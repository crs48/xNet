import { describe, expect, it, vi } from 'vitest'
import { acpChatAgent, foldAcpUpdate } from './acp-agent'
import type { AgentFrame } from './agent-frames'
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

describe('Codex app-server folding (exploration 0416)', () => {
  it('maps deltas, tool calls, results, and usage', () => {
    expect(foldCodexNotification('codex/event/agent_message_delta', { delta: 'hi' })).toEqual([
      { type: 'delta', text: 'hi' }
    ])
    expect(
      foldCodexNotification('codex/event/tool_call_begin', {
        call_id: 'c1',
        tool_name: 'shell',
        arguments: { cmd: 'ls' }
      })
    ).toEqual([{ type: 'tool_call', id: 'c1', name: 'shell', input: { cmd: 'ls' } }])
    expect(
      foldCodexNotification('codex/event/token_count', {
        info: { input_tokens: 10, output_tokens: 4 }
      })
    ).toEqual([{ type: 'cost', inputTokens: 10, outputTokens: 4 }])
  })

  it('treats an unstated tool outcome as failure, not success', () => {
    expect(foldCodexNotification('codex/event/tool_call_end', { call_id: 'c1' })).toEqual([
      { type: 'tool_result', id: 'c1', ok: false, content: undefined }
    ])
    expect(
      foldCodexNotification('codex/event/tool_call_end', { call_id: 'c1', success: true })
    ).toEqual([{ type: 'tool_result', id: 'c1', ok: true, content: undefined }])
  })

  it('drops complete-message events so deltas are not duplicated', () => {
    expect(foldCodexNotification('codex/event/agent_message', { message: 'hi' })).toEqual([])
    expect(foldCodexNotification('codex/event/unknown', {})).toEqual([])
  })

  it('creates a thread on the first turn and reuses it on resume', async () => {
    const script = {
      responses: { newConversation: { conversationId: 'thread-1' } },
      emitAfter: {
        sendUserMessage: [
          {
            jsonrpc: '2.0',
            method: 'codex/event/agent_message_delta',
            params: { delta: 'done' }
          },
          { jsonrpc: '2.0', method: 'codex/event/task_complete', params: {} }
        ]
      }
    }

    const first = fakeAgent(script)
    const agentA = codexAppServerChatAgent(first.runner, { cwd: '/tmp' })
    const frames: AgentFrame[] = []
    const resultA = await agentA.streamTurnFrames({ prompt: 'hello' }, (f) => frames.push(f))

    expect(resultA.sessionId).toBe('thread-1')
    expect(resultA.text).toBe('done')
    expect(frames.some((f) => f.type === 'session')).toBe(true)
    expect(sentMethods(first.written)).toContain('newConversation')

    // Resuming must NOT create a second thread.
    const second = fakeAgent(script)
    const agentB = codexAppServerChatAgent(second.runner, { cwd: '/tmp' })
    const resultB = await agentB.streamTurnFrames(
      { prompt: 'follow up', resumeSessionId: 'thread-1' },
      () => {}
    )

    expect(resultB.sessionId).toBe('thread-1')
    expect(sentMethods(second.written)).not.toContain('newConversation')
  })

  it('surfaces a permission request and denies it by default', async () => {
    const { runner } = fakeAgent({
      responses: { newConversation: { conversationId: 't' } },
      emitAfter: {
        sendUserMessage: [
          {
            jsonrpc: '2.0',
            id: 7,
            method: 'codex/request/exec_approval',
            params: { command: 'rm' }
          },
          { jsonrpc: '2.0', method: 'codex/event/task_complete', params: {} }
        ]
      }
    })

    const frames: AgentFrame[] = []
    const agent = codexAppServerChatAgent(runner, { cwd: '/tmp' })
    await agent.streamTurnFrames({ prompt: 'go' }, (f) => frames.push(f))

    const permission = frames.find((f) => f.type === 'permission_request')
    expect(permission).toBeDefined()
    expect(permission).toMatchObject({ tool: 'rm' })
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
