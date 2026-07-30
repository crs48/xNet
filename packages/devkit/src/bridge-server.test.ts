import type { AgentFrame } from './agent-frames'
import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createBridgeServer,
  type BridgeServerConfig,
  type BridgeServerHandle
} from './bridge-server'
import {
  fakeChatAgent,
  type FramedChatAgent,
  type StreamingChatAgent,
  type StreamTurnRequest
} from './chat-agent'

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

// ─── Streaming agent path (exploration 0391) ────────────────────────────────────

/** A scripted StreamingChatAgent that records planned turns. */
function fakeStreamingAgent(
  reply = 'live reply',
  sessionId = 'sess-1'
): StreamingChatAgent & {
  turns: StreamTurnRequest[]
} {
  const turns: StreamTurnRequest[] = []
  return {
    turns,
    async streamTurn(turn, onDelta) {
      turns.push(turn)
      for (const piece of reply.split(/(?<= )/)) {
        onDelta(piece)
        await Promise.resolve()
      }
      return { text: reply, sessionId }
    },
    async chat() {
      return reply
    }
  }
}

describe('createBridgeServer with a streaming agent', () => {
  it('streams live deltas as separate SSE chunks', async () => {
    const url = await start({ agent: fakeStreamingAgent('one two three') })
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    const contentChunks = [...text.matchAll(/"content":"([^"]*)"/g)].map((m) => m[1])
    expect(contentChunks).toEqual(['one ', 'two ', 'three'])
    expect(text).toContain('data: [DONE]')
  })

  it('resumes the CLI session on the conversation follow-up turn', async () => {
    const agent = fakeStreamingAgent('hi there', 'sess-42')
    const url = await start({ agent })
    const turn1 = [{ role: 'user', content: 'hello' }]
    await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: turn1 })
    })
    expect(agent.turns[0].resumeSessionId).toBeUndefined()

    const turn2 = [
      ...turn1,
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'follow-up' }
    ]
    await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: turn2 })
    })
    expect(agent.turns[1].resumeSessionId).toBe('sess-42')
    expect(agent.turns[1].prompt).toBe('follow-up')
  })

  it('answers 502 when the agent fails before any delta', async () => {
    const failing: StreamingChatAgent = {
      async streamTurn() {
        throw new Error('spawn failed')
      },
      async chat() {
        return ''
      }
    }
    const url = await start({ agent: failing })
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(502)
  })

  it('surfaces a mid-stream failure as visible text before [DONE]', async () => {
    const failing: StreamingChatAgent = {
      async streamTurn(_turn, onDelta) {
        onDelta('partial ')
        throw new Error('cli died')
      },
      async chat() {
        return ''
      }
    }
    const url = await start({ agent: failing })
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('partial ')
    expect(text).toContain('bridge error: cli died')
    expect(text).toContain('data: [DONE]')
  })
})

// ─── Framed endpoint (exploration 0392) ─────────────────────────────────────────

/** Parse the `data: <json>` frames from a framed-endpoint SSE body. */
function parseFrames(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map((block) => block.replace(/^data: /, '').trim())
    .filter((line) => line && line !== '[DONE]')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

/** A FramedChatAgent that replays a scripted frame sequence. */
function fakeFramedAgent(
  frames: AgentFrame[],
  sessionId = 'sess-1'
): FramedChatAgent & { turns: StreamTurnRequest[] } {
  const turns: StreamTurnRequest[] = []
  // Mirror cliStreamingChatAgent: the returned text is the streamed deltas, or
  // the terminal result frame's text when nothing streamed.
  const deltaText = frames
    .filter((f): f is Extract<AgentFrame, { type: 'delta' }> => f.type === 'delta')
    .map((f) => f.text)
    .join('')
  const resultText = frames.find(
    (f): f is Extract<AgentFrame, { type: 'result' }> => f.type === 'result'
  )?.text
  const text = deltaText || resultText || ''
  return {
    turns,
    async streamTurnFrames(turn, onFrame) {
      turns.push(turn)
      for (const frame of frames) {
        onFrame(frame)
        await Promise.resolve()
      }
      return { text, sessionId }
    },
    async streamTurn(turn, onDelta) {
      turns.push(turn)
      onDelta(text)
      return { text, sessionId }
    },
    async chat() {
      return text
    }
  }
}

describe('createBridgeServer framed endpoint (/v1/agent/stream)', () => {
  it('requires the pairing token', async () => {
    const url = await start()
    const res = await fetch(`${url}/v1/agent/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(401)
  })

  it('forwards structured frames (session, delta, tool_call, result) as SSE', async () => {
    const agent = fakeFramedAgent(
      [
        { type: 'session', sessionId: 'sess-9' },
        { type: 'delta', text: 'work' },
        { type: 'tool_call', id: 'tu-1', name: 'xnet_update', input: { id: 'n1' } },
        { type: 'tool_result', id: 'tu-1', ok: true },
        { type: 'result', ok: true, text: 'work', sessionId: 'sess-9' }
      ],
      'sess-9'
    )
    const url = await start({ agent })
    const res = await fetch(`${url}/v1/agent/stream`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'go' }] })
    })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const frames = parseFrames(await res.text())
    expect(frames.map((f) => f.type)).toEqual([
      'session',
      'delta',
      'tool_call',
      'tool_result',
      'result'
    ])
    expect(frames[2]).toMatchObject({ name: 'xnet_update', input: { id: 'n1' } })
  })

  it('resumes the CLI session on the conversation follow-up turn', async () => {
    const agent = fakeFramedAgent(
      [{ type: 'result', ok: true, text: 'hi there', sessionId: 'sess-42' }],
      'sess-42'
    )
    const url = await start({ agent })
    const turn1 = [{ role: 'user', content: 'hello' }]
    await fetch(`${url}/v1/agent/stream`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: turn1 })
    })
    expect(agent.turns[0].resumeSessionId).toBeUndefined()
    await fetch(`${url}/v1/agent/stream`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({
        messages: [
          ...turn1,
          { role: 'assistant', content: 'hi there' },
          { role: 'user', content: 'more' }
        ]
      })
    })
    expect(agent.turns[1].resumeSessionId).toBe('sess-42')
    expect(agent.turns[1].prompt).toBe('more')
  })

  it('synthesizes delta+result frames for a plain (non-framed) agent', async () => {
    const url = await start({ agent: fakeChatAgent(() => 'plain reply') })
    const res = await fetch(`${url}/v1/agent/stream`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    const frames = parseFrames(await res.text())
    expect(frames).toEqual([
      { type: 'delta', text: 'plain reply' },
      { type: 'result', ok: true, text: 'plain reply' }
    ])
  })

  it('surfaces a mid-stream failure as a terminal error result frame', async () => {
    const failing: FramedChatAgent = {
      async streamTurnFrames(_turn, onFrame) {
        onFrame({ type: 'delta', text: 'partial' })
        throw new Error('cli died')
      },
      async streamTurn() {
        return { text: '' }
      },
      async chat() {
        return ''
      }
    }
    const url = await start({ agent: failing })
    const res = await fetch(`${url}/v1/agent/stream`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(200)
    const frames = parseFrames(await res.text())
    expect(frames.at(-1)).toEqual({ type: 'result', ok: false, error: 'cli died' })
  })

  it('answers 502 when a framed agent fails before any frame', async () => {
    const failing: FramedChatAgent = {
      async streamTurnFrames() {
        throw new Error('spawn failed')
      },
      async streamTurn() {
        return { text: '' }
      },
      async chat() {
        return ''
      }
    }
    const url = await start({ agent: failing })
    const res = await fetch(`${url}/v1/agent/stream`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    })
    expect(res.status).toBe(502)
  })
})
