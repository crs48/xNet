import { describe, it, expect } from 'vitest'
import { createBridgeServer, fakeChatAgent } from '@xnetjs/devkit'
import { handleMessage } from '../host/relay.mjs'
import { cliBackend, daemonBackend, flattenChat } from '../host/backends.mjs'

const USER = [{ role: 'user', content: 'ping' }]

describe('relay.handleMessage', () => {
  const echo = {
    async health() {
      return { agent: 'fake', version: '9.9.9' }
    },
    async chat(messages) {
      return `echo:${flattenChat(messages)}`
    }
  }

  it('answers health', async () => {
    expect(await handleMessage({ v: 1, kind: 'health' }, echo)).toEqual({
      ok: true,
      agent: 'fake',
      version: '9.9.9'
    })
  })

  it('answers chat and echoes the request id for correlation', async () => {
    const reply = await handleMessage({ v: 1, id: 't1', kind: 'chat', messages: USER }, echo)
    expect(reply).toEqual({ ok: true, content: 'echo:ping', id: 't1' })
  })

  it('rejects an unsupported protocol version', async () => {
    const reply = await handleMessage({ v: 99, kind: 'health' }, echo)
    expect(reply.ok).toBe(false)
    expect(reply.error).toMatch(/protocol version/)
  })

  it('rejects unknown kinds and empty chats without throwing', async () => {
    expect((await handleMessage({ kind: 'nope' }, echo)).ok).toBe(false)
    expect((await handleMessage({ kind: 'chat', messages: [] }, echo)).ok).toBe(false)
  })

  it('turns a backend failure into ok:false rather than rejecting', async () => {
    const boom = { async health() { throw new Error('backend down') }, async chat() {} }
    const reply = await handleMessage({ kind: 'health' }, boom)
    expect(reply).toEqual({ ok: false, error: 'backend down' })
  })
})

describe('cliBackend (injected runner)', () => {
  it('flattens the conversation into the {prompt} slot and returns stdout', async () => {
    const calls = []
    const backend = cliBackend({
      command: 'claude',
      run: async (command, args, opts) => {
        calls.push({ command, args, opts })
        return { code: 0, stdout: 'hello from cli\n', stderr: '' }
      }
    })
    const content = await backend.chat([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' }
    ])
    expect(content).toBe('hello from cli')
    expect(calls[0].command).toBe('claude')
    expect(calls[0].args).toEqual(['-p', 'system: be terse\n\nhi'])
  })

  it('surfaces a non-zero exit as an error', async () => {
    const backend = cliBackend({
      run: async () => ({ code: 2, stdout: '', stderr: 'not logged in' })
    })
    await expect(backend.chat(USER)).rejects.toThrow(/not logged in/)
  })
})

describe('daemonBackend → real hardened bridge daemon', () => {
  it('forwards a chat through the token-gated daemon and gets the reply', async () => {
    const server = createBridgeServer({
      agent: fakeChatAgent((messages) => `daemon saw: ${messages.at(-1).content}`),
      agentName: 'claude',
      port: 0, // ephemeral
      pairingToken: 'spike-token'
    })
    await server.start()
    try {
      const backend = daemonBackend({ url: server.url, token: server.pairingToken })
      expect((await backend.health()).ok).toBe(true)
      expect(await backend.chat([{ role: 'user', content: 'hello' }])).toBe('daemon saw: hello')
    } finally {
      await server.stop()
    }
  })

  it('fails when the pairing token is wrong (daemon returns 401)', async () => {
    const server = createBridgeServer({
      agent: fakeChatAgent(() => 'secret'),
      port: 0,
      pairingToken: 'right-token'
    })
    await server.start()
    try {
      const backend = daemonBackend({ url: server.url, token: 'wrong-token' })
      await expect(backend.chat(USER)).rejects.toThrow(/401/)
    } finally {
      await server.stop()
    }
  })
})
