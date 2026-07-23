import type { BridgeServerHandle } from '@xnetjs/devkit'
import { FakeCommandRunner, FakeLineRunner } from '@xnetjs/devkit'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bridgeAgentHome,
  buildBridgeServer,
  installServeArgs,
  launchdPlist,
  LAUNCHD_LABEL
} from './bridge'

let handle: BridgeServerHandle | undefined

afterEach(async () => {
  await handle?.stop()
  handle = undefined
})

/** A scripted stream-json turn for the claude streaming path. */
const claudeTurn = (text: string, sessionId = 'sess-1'): string[] => [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: sessionId }),
  JSON.stringify({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } }
  }),
  JSON.stringify({ type: 'result', subtype: 'success', result: text, session_id: sessionId })
]

describe('buildBridgeServer', () => {
  it('serves /health for the chosen agent without spawning it', async () => {
    handle = buildBridgeServer({ agent: 'claude', port: 0 }, new FakeCommandRunner())
    await handle.start()
    const res = await fetch(`${handle.url}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, agent: 'claude' })
  })

  it('drives claude over the streaming stream-json path in the agent home', async () => {
    const lines = new FakeLineRunner([{ match: () => true, lines: claudeTurn('hi from claude') }])
    handle = buildBridgeServer(
      { agent: 'claude', port: 0, token: 'test-token' },
      new FakeCommandRunner(),
      lines
    )
    await handle.start()
    const res = await fetch(`${handle.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    expect(body.choices[0].message.content).toBe('hi from claude')
    expect(lines.calls[0].command).toBe('claude')
    expect(lines.calls[0].args.slice(0, 2)).toEqual(['-p', 'hi'])
    expect(lines.calls[0].args).toContain('stream-json')
    expect(lines.calls[0].cwd).toBe(bridgeAgentHome())
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

  it('hands xNet workspace tools to the claude agent when mcpConfigPath is set', async () => {
    const lines = new FakeLineRunner([{ match: () => true, lines: claudeTurn('ok') }])
    handle = buildBridgeServer(
      { agent: 'claude', port: 0, mcpConfigPath: '/tmp/cfg.json', token: 'test-token' },
      new FakeCommandRunner(),
      lines
    )
    await handle.start()
    await fetch(`${handle.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(lines.calls[0].args).toEqual([
      '-p',
      'hi',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--mcp-config',
      '/tmp/cfg.json',
      '--allowedTools',
      'mcp__xnet__*'
    ])
  })

  it('resumes the claude session on a follow-up turn', async () => {
    const lines = new FakeLineRunner([
      { match: (_c, args) => !args.includes('--resume'), lines: claudeTurn('first reply', 's-7') },
      { match: (_c, args) => args.includes('--resume'), lines: claudeTurn('second reply', 's-7') }
    ])
    handle = buildBridgeServer(
      { agent: 'claude', port: 0, token: 'test-token' },
      new FakeCommandRunner(),
      lines
    )
    await handle.start()
    const headers = { 'content-type': 'application/json', authorization: 'Bearer test-token' }
    await fetch(`${handle.url}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'q1' }] })
    })
    await fetch(`${handle.url}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'first reply' },
          { role: 'user', content: 'q2' }
        ]
      })
    })
    expect(lines.calls[1].args).toContain('--resume')
    expect(lines.calls[1].args[lines.calls[1].args.indexOf('--resume') + 1]).toBe('s-7')
    expect(lines.calls[1].args[1]).toBe('q2')
  })
})

describe('launchd install helpers', () => {
  it('serializes serve args with a stable token and origins', () => {
    const args = installServeArgs(
      { allowOrigin: ['https://app.xnet.fyi'], port: 31416, agent: 'claude' },
      'tok-1'
    )
    expect(args).toEqual([
      'bridge',
      'serve',
      '--token',
      'tok-1',
      '--agent',
      'claude',
      '--port',
      '31416',
      '--allow-origin',
      'https://app.xnet.fyi'
    ])
  })

  it('renders a launchd plist with escaped program arguments', () => {
    const plist = launchdPlist('/usr/local/bin/node', '/opt/xnet/cli.js', [
      'bridge',
      'serve',
      '--token',
      'a&b<c'
    ])
    expect(plist).toContain(`<string>${LAUNCHD_LABEL}</string>`)
    expect(plist).toContain('<string>/usr/local/bin/node</string>')
    expect(plist).toContain('<string>a&amp;b&lt;c</string>')
    expect(plist).toContain('<key>KeepAlive</key>')
  })
})
