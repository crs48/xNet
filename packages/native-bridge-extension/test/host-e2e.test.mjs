import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { encodeMessage, createMessageDecoder } from '../host/native-messaging.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const HOST = join(here, '..', 'host', 'xnet-bridge-host.mjs')

/** Spawn the real host, drive it with framed requests, collect framed replies. */
function driveHost(env, requests) {
  return new Promise((resolve, reject) => {
    const replies = []
    const child = spawn(process.execPath, [HOST], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'inherit']
    })
    const decoder = createMessageDecoder((m) => replies.push(m), reject)
    child.stdout.on('data', (chunk) => decoder.push(chunk))
    child.on('error', reject)
    child.on('exit', (code) => resolve({ code, replies }))
    for (const req of requests) child.stdin.write(encodeMessage(req))
    child.stdin.end() // browser closing the port → host exits 0
  })
}

describe('xnet-bridge-host.mjs end-to-end (cli backend, real process)', () => {
  it('answers health and a chat turn over stdio framing, then exits cleanly', async () => {
    // A stand-in coding-agent CLI: prints a reply built from the -p prompt.
    const dir = mkdtempSync(join(tmpdir(), 'xnet-fake-agent-'))
    const fakeAgent = join(dir, 'fake-agent.mjs')
    writeFileSync(
      fakeAgent,
      '#!/usr/bin/env node\nprocess.stdout.write("cli reply: " + process.argv[3])\n'
    )
    chmodSync(fakeAgent, 0o755)

    const { code, replies } = await driveHost(
      { XNET_BRIDGE_MODE: 'cli', XNET_BRIDGE_AGENT: fakeAgent },
      [
        { v: 1, id: 'h', kind: 'health' },
        { v: 1, id: 'c', kind: 'chat', messages: [{ role: 'user', content: 'hello world' }] }
      ]
    )

    expect(code).toBe(0)
    const health = replies.find((r) => r.id === 'h')
    expect(health).toMatchObject({ ok: true, transport: 'cli', agent: fakeAgent })
    const chat = replies.find((r) => r.id === 'c')
    expect(chat).toEqual({ ok: true, content: 'cli reply: hello world', id: 'c' })
  })
})
