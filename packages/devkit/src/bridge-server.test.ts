import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createBridgeServer,
  type BridgeServerConfig,
  type BridgeServerHandle
} from './bridge-server'
import { fakeChatAgent } from './chat-agent'

/**
 * Raw loopback GET with a caller-chosen `Host` header. `fetch`/undici silently
 * overrides `Host` with the URL authority, so a DNS-rebinding request (attacker
 * hostname reaching 127.0.0.1) can only be simulated at the `node:http` layer.
 */
function getWithHost(url: string, host: string): Promise<number> {
  const { port } = new URL(url)
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port: Number(port), path: '/health', headers: { host } },
      (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      }
    )
    req.on('error', reject)
    req.end()
  })
}

let handle: BridgeServerHandle | undefined

afterEach(async () => {
  await handle?.stop()
  handle = undefined
})

const TOKEN = 'test-pairing-token'

async function start(overrides: Partial<BridgeServerConfig> = {}): Promise<string> {
  handle = createBridgeServer({
    agent: fakeChatAgent(() => 'hi there'),
    agentName: 'claude',
    port: 0,
    pairingToken: TOKEN,
    ...overrides
  })
  await handle.start()
  return handle.url
}

/** Data-endpoint headers: JSON + the pairing token the daemon now requires. */
const authed = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

describe('createBridgeServer', () => {
  it('refuses to bind a non-loopback host', () => {
    expect(() => createBridgeServer({ agent: fakeChatAgent(() => ''), host: '0.0.0.0' })).toThrow(
      /loopback/
    )
  })

  it('serves /health with bridgeHealth so the connector ladder detects it', async () => {
    const url = await start()
    const res = await fetch(`${url}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      service: 'xnet-agent-bridge',
      agent: 'claude'
    })
  })

  it('answers chat completions (non-streaming) from the agent', async () => {
    const url = await start({ agent: fakeChatAgent((m) => `echo:${m[m.length - 1].content}`) })
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    expect(body.choices[0].message.content).toBe('echo:hi')
  })

  it('streams chat completions as OpenAI SSE ending in [DONE]', async () => {
    const url = await start({ agent: fakeChatAgent(() => 'streamed reply') })
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toContain('streamed reply')
    expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true)
  })

  it('refuses a disallowed browser origin', async () => {
    const url = await start()
    const res = await fetch(`${url}/health`, { headers: { origin: 'https://evil.example' } })
    expect(res.status).toBe(403)
  })

  it('allows a configured origin and emits Private Network Access on preflight', async () => {
    const url = await start({ allowedOrigins: ['https://app.example'] })
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'OPTIONS',
      headers: { origin: 'https://app.example' }
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(res.headers.get('access-control-allow-private-network')).toBe('true')
  })

  it('rejects a chat completion with no pairing token (401)', async () => {
    const url = await start()
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(401)
  })

  it('rejects a chat completion with a wrong pairing token (401)', async () => {
    const url = await start()
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer nope' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(401)
  })

  it('generates a random pairing token when none is configured', async () => {
    handle = createBridgeServer({ agent: fakeChatAgent(() => 'hi'), port: 0 })
    await handle.start()
    expect(handle.pairingToken).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  })

  it('rejects a request whose Host is not our loopback authority (anti-rebind, 403)', async () => {
    const url = await start()
    expect(await getWithHost(url, 'evil.example')).toBe(403)
    // sanity: the same request with a correct loopback Host is accepted
    expect(await getWithHost(url, `127.0.0.1:${new URL(url).port}`)).toBe(200)
  })

  it('leaves /health unauthenticated so detection works before pairing', async () => {
    const url = await start()
    const res = await fetch(`${url}/health`) // no Authorization header
    expect(res.status).toBe(200)
  })

  it('returns 502 when the agent throws', async () => {
    const url = await start({
      agent: fakeChatAgent(() => {
        throw new Error('agent down')
      })
    })
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(502)
  })

  it('answers /run with 501 when code tasks are not enabled', async () => {
    const url = await start()
    const res = await fetch(`${url}/run`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ taskId: 't1', prompt: 'do it' })
    })
    expect(res.status).toBe(501)
  })

  it('delegates /run to the configured handler', async () => {
    let seen: { taskId: string; prompt: string } | undefined
    const url = await start({
      run: async (request) => {
        seen = { taskId: request.taskId, prompt: request.prompt }
        return {
          ok: true,
          branch: `agent/${request.taskId}`,
          worktreePath: '/wt',
          gate: { ok: true, steps: [] },
          rolledBack: false,
          agentOutput: 'done'
        }
      }
    })
    const res = await fetch(`${url}/run`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ taskId: 't1', prompt: 'add a toggle' })
    })
    const body = (await res.json()) as { ok: boolean; branch: string }
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, branch: 'agent/t1' })
    expect(seen).toEqual({ taskId: 't1', prompt: 'add a toggle' })
  })

  it('rejects /run without taskId + prompt (400)', async () => {
    const url = await start({ run: async () => ({}) as never })
    const res = await fetch(`${url}/run`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ prompt: 'no id' })
    })
    expect(res.status).toBe(400)
  })

  it('returns 502 when the /run handler throws', async () => {
    const url = await start({
      run: async () => {
        throw new Error('worktree boom')
      }
    })
    const res = await fetch(`${url}/run`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ taskId: 't1', prompt: 'x' })
    })
    expect(res.status).toBe(502)
  })
})
