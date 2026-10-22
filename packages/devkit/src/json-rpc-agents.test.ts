import type { AgentFrame } from './agent-frames'
import { describe, expect, it, vi } from 'vitest'
import { acpChatAgent, foldAcpUpdate } from './acp-agent'
import { codexAppServerChatAgent, foldCodexNotification } from './codex-app-server'
import { JsonRpcSession, type DuplexProcess, type DuplexRunner } from './json-rpc-stdio'

/**
 * A scripted agent process: replies to requests by method name, and can push
 * notifications when a given method is received.
 */
function fakeAgent(script: {
  responses?: Record<string, unknown>
  /** Notifications/requests emitted after the named method arrives. */
  emitAfter?: Record<string, unknown[]>
}) {
  const written: string[] = []
  const queue: string[] = []
  let wake: (() => void) | undefined
  let closed = false
  const push = (message: unknown): void => {
    queue.push(JSON.stringify(message))
    wake?.()
    wake = undefined
  }

  const proc: DuplexProcess = {
    write(line) {
      written.push(line)
      const message = JSON.parse(line) as { id?: number; method?: string }
      if (!message.method) return

      for (const emission of script.emitAfter?.[message.method] ?? []) push(emission)

      if (message.id !== undefined) {
        push({
          jsonrpc: '2.0',
          id: message.id,
          result: script.responses?.[message.method] ?? {}
        })
      }
    },
    async *lines() {
      while (true) {
        const line = queue.shift()
        if (line !== undefined) {
          yield line
          continue
        }
        if (closed) return
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    },
    kill() {
      closed = true
      wake?.()
      wake = undefined
    }
  }

  const runner: DuplexRunner = { spawn: () => proc }
  return { proc, runner, written, push }
}

const sentMethods = (written: string[]): string[] =>
  written
    .map((line) => (JSON.parse(line) as { method?: string }).method)
    .filter(Boolean) as string[]

describe('JSON-RPC over stdio (exploration 0416)', () => {
  it('correlates responses to requests', async () => {
    const { proc } = fakeAgent({ responses: { ping: { pong: true } } })
    const session = new JsonRpcSession(proc)
    void session.start()

    await expect(session.request('ping')).resolves.toEqual({ pong: true })
    session.close()
  })

  it('rejects a request when the agent errors', async () => {
    const written: string[] = []
    const queue: string[] = []
    let wake: (() => void) | undefined
    const proc: DuplexProcess = {
      write(line) {
        written.push(line)
        const { id } = JSON.parse(line) as { id: number }
        queue.push(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -1, message: 'nope' } }))
        wake?.()
      },
      async *lines() {
        while (true) {
          const line = queue.shift()
          if (line !== undefined) {
            yield line
            continue
          }
          await new Promise<void>((r) => {
            wake = r
          })
        }
      },
      kill: vi.fn()
    }
    const session = new JsonRpcSession(proc)
    void session.start()

    await expect(session.request('boom')).rejects.toThrow(/nope/)
  })

  it('never leaves a caller hanging when the process dies', async () => {
    const proc: DuplexProcess = {
      write: () => {},
      // eslint-disable-next-line require-yield
      async *lines() {
        return // closes immediately
      },
      kill: vi.fn()
    }
    const session = new JsonRpcSession(proc)
    const pump = session.start()
    const pending = session.request('anything')
    await pump

    await expect(pending).rejects.toThrow(/closed before responding/)
  })

  it('answers a server-initiated request, and refuses when no handler exists', async () => {
    const { proc, written, push } = fakeAgent({})
    const session = new JsonRpcSession(proc)
    void session.start()

    push({ jsonrpc: '2.0', id: 99, method: 'ask' })
    await vi.waitFor(() => expect(written.length).toBeGreaterThan(0))

    const reply = JSON.parse(written[0]) as { id: number; error?: { code: number } }
    expect(reply.id).toBe(99)
    expect(reply.error?.code).toBe(-32601)
    session.close()
  })
})

describe('Codex app-server v2 (0480)', () => {
  const script = (status = 'completed') => ({
    responses: {
      'thread/start': { thread: { id: 'thread-1' } },
      'thread/resume': { thread: { id: 'thread-1' } },
      'turn/start': { turn: { id: 'turn-1' } }
    },
    emitAfter: {
      'turn/start': [
        { method: 'codex/event/agent_message_delta', params: { delta: 'duplicate' } },
        {
          method: 'item/agentMessage/delta',
          params: { threadId: 'thread-1', turnId: 'turn-1', delta: 'done' }
        },
        {
          method: 'turn/completed',
          params: { threadId: 'thread-1', turn: { id: 'turn-1', status } }
        }
      ]
    }
  })
  it('uses initialize/initialized, v2 start and an explicit resume after process restart', async () => {
    for (const resumeSessionId of [undefined, 'thread-1']) {
      const fake = fakeAgent(script())
      const agent = codexAppServerChatAgent(fake.runner, {
        cwd: '/tmp',
        config: { 'features.shell_tool': false }
      })
      const result = await agent.streamTurnFrames({ prompt: 'hello', resumeSessionId }, () => {})
      expect(result).toEqual({ text: 'done', sessionId: 'thread-1' })
      expect(sentMethods(fake.written)).toEqual([
        'initialize',
        'initialized',
        resumeSessionId ? 'thread/resume' : 'thread/start',
        'turn/start'
      ])
      const start = JSON.parse(fake.written[2])
      expect(start.params.approvalPolicy).toBe('never')
      expect(start.params.config['features.shell_tool']).toBe(false)
    }
  })
  it('maps current event names and preserves the legacy folding helper', () => {
    expect(foldCodexNotification('item/agentMessage/delta', { delta: 'hello' })).toEqual([
      { type: 'delta', text: 'hello' }
    ])
    expect(foldCodexNotification('codex/event/agent_message_delta', { delta: 'hello' })).toEqual([
      { type: 'delta', text: 'hello' }
    ])
    expect(
      foldCodexNotification('item/completed', { item: { type: 'commandExecution', id: 'a' } })
    ).toMatchObject([{ type: 'tool_result', ok: false }])
  })
  it.each(['failed', 'interrupted'])('never treats terminal %s as success', async (status) => {
    const fake = fakeAgent(script(status))
    await expect(
      codexAppServerChatAgent(fake.runner, { cwd: '/tmp' }).streamTurn(
        { prompt: 'hello' },
        () => {}
      )
    ).rejects.toThrow(status)
  })
  it('fails on EOF after a partial answer', async () => {
    const setup = script()
    setup.emitAfter['turn/start'].pop()
    const fake = fakeAgent(setup)
    const agent = codexAppServerChatAgent(fake.runner, { cwd: '/tmp' })
    const result = agent.streamTurn({ prompt: 'hello' }, () => {
      setTimeout(() => fake.proc.kill(), 0)
    })
    await expect(result).rejects.toThrow('disconnected before turn completion')
  })
  it('refuses a runtime without v2 thread IDs', async () => {
    const fake = fakeAgent({})
    await expect(
      codexAppServerChatAgent(fake.runner, { cwd: '/tmp' }).streamTurn({ prompt: 'hi' }, () => {})
    ).rejects.toThrow('thread ID')
  })
  it('denies approvals and does not accept arbitrary server requests', async () => {
    const fake = fakeAgent(script())
    fake.push({
      id: 90,
      method: 'item/commandExecution/requestApproval',
      params: { itemId: 'cmd', command: 'touch sentinel' }
    })
    fake.push({ id: 91, method: 'item/tool/call', params: {} })
    await codexAppServerChatAgent(fake.runner, { cwd: '/tmp' }).streamTurn(
      { prompt: 'hello' },
      () => {}
    )
    const replies = fake.written.map((s) => JSON.parse(s))
    expect(replies.find((r) => r.id === 90).result).toEqual({ decision: 'decline' })
    expect(replies.find((r) => r.id === 91).error).toBeDefined()
  })
  it('interrupts a running turn and rejects cancellation', async () => {
    const setup = script()
    setup.emitAfter['turn/start'].pop()
    const fake = fakeAgent(setup)
    const controller = new AbortController()
    const result = codexAppServerChatAgent(fake.runner, { cwd: '/tmp' }).streamTurn(
      { prompt: 'go', signal: controller.signal },
      () => {}
    )
    const assertion = expect(result).rejects.toThrow()
    await vi.waitFor(() => expect(sentMethods(fake.written)).toContain('turn/start'))
    controller.abort()
    await vi.waitFor(() => expect(sentMethods(fake.written)).toContain('turn/interrupt'))
    fake.push({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'interrupted' } }
    })
    await assertion
  })
})

describe('ACP folding (exploration 0416)', () => {
  it('maps message chunks and tool calls', () => {
    expect(
      foldAcpUpdate({
        update: { sessionUpdate: 'agent_message_chunk', content: { text: 'hey' } }
      })
    ).toEqual([{ type: 'delta', text: 'hey' }])

    expect(
      foldAcpUpdate({
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 't1',
          title: 'Read file',
          rawInput: { path: 'a.ts' }
        }
      })
    ).toEqual([{ type: 'tool_call', id: 't1', name: 'Read file', input: { path: 'a.ts' } }])
  })

  it('emits a tool result only on a terminal status', () => {
    const inProgress = foldAcpUpdate({
      update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'in_progress' }
    })
    expect(inProgress).toEqual([])

    const failed = foldAcpUpdate({
      update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'failed' }
    })
    expect(failed).toEqual([{ type: 'tool_result', id: 't1', ok: false, content: undefined }])
  })

  it('runs a turn, reporting session and result frames', async () => {
    const { runner, written } = fakeAgent({
      responses: {
        'session/new': { sessionId: 'acp-1' },
        'session/prompt': { stopReason: 'end_turn' }
      },
      emitAfter: {
        'session/prompt': [
          {
            jsonrpc: '2.0',
            method: 'session/update',
            params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: 'ok' } } }
          }
        ]
      }
    })

    const frames: AgentFrame[] = []
    const agent = acpChatAgent(runner, { cwd: '/tmp' })
    const result = await agent.streamTurnFrames({ prompt: 'hi' }, (f) => frames.push(f))

    expect(result.sessionId).toBe('acp-1')
    expect(result.text).toBe('ok')
    expect(frames.at(-1)).toMatchObject({ type: 'result', ok: true })
    expect(sentMethods(written)).toEqual(['initialize', 'session/new', 'session/prompt'])
  })

  it('reuses a session on resume', async () => {
    const { runner, written } = fakeAgent({
      responses: { 'session/prompt': { stopReason: 'end_turn' } }
    })
    const agent = acpChatAgent(runner, { cwd: '/tmp' })
    await agent.streamTurnFrames({ prompt: 'again', resumeSessionId: 'acp-1' }, () => {})

    expect(sentMethods(written)).not.toContain('session/new')
  })
})
