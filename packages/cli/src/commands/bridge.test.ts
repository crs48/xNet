import type { BridgeServerHandle } from '@xnetjs/devkit'
import { FakeCommandRunner } from '@xnetjs/devkit'
import { afterEach, describe, expect, it } from 'vitest'
import { buildBridgeServer } from './bridge'

let handle: BridgeServerHandle | undefined

afterEach(async () => {
  await handle?.stop()
  handle = undefined
})

describe('buildBridgeServer', () => {
  it('serves /health for the chosen agent without spawning it', async () => {
    handle = buildBridgeServer({ agent: 'claude', port: 0 }, new FakeCommandRunner())
    await handle.start()
    const res = await fetch(`${handle.url}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, agent: 'claude' })
  })

  it('drives the injected agent CLI for a chat turn (codex arg template)', async () => {
    const runner = new FakeCommandRunner([
      { match: () => true, result: { stdout: 'codex says hi' } }
    ])
    handle = buildBridgeServer({ agent: 'codex', port: 0, token: 'test-token' }, runner)
    await handle.start()
    const res = await fetch(`${handle.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    expect(body.choices[0].message.content).toBe('codex says hi')
    expect(runner.calls[0].command).toBe('codex')
    expect(runner.calls[0].args).toEqual(['exec', 'hi'])
  })

  it('pins the pairing token when --token is given', async () => {
    handle = buildBridgeServer(
      { agent: 'claude', port: 0, token: 'pinned-code' },
      new FakeCommandRunner()
    )
    await handle.start()
    expect(handle.pairingToken).toBe('pinned-code')
  })

  it('hands xNet workspace tools to the agent when mcpConfigPath is set', async () => {
    const runner = new FakeCommandRunner([{ match: () => true, result: { stdout: 'ok' } }])
    handle = buildBridgeServer(
      { agent: 'claude', port: 0, mcpConfigPath: '/tmp/cfg.json', token: 'test-token' },
      runner
    )
    await handle.start()
    await fetch(`${handle.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(runner.calls[0].args).toEqual([
      '-p',
      'hi',
      '--output-format',
      'text',
      '--mcp-config',
      '/tmp/cfg.json',
      '--allowedTools',
      'mcp__xnet__*'
    ])
  })
})
