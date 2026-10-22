/** Codex app-server v2, verified against codex-cli 0.162 (exploration 0480). */
import type { AgentFrame } from './agent-frames'
import type {
  ChatMessage,
  FramedChatAgent,
  StreamTurnRequest,
  StreamTurnResult
} from './chat-agent'
import { flattenChat } from './chat-agent'
import { JsonRpcSession, type DuplexRunner } from './json-rpc-stdio'

export interface CodexAppServerOptions {
  command?: string
  args?: string[]
  cwd: string
  env?: Record<string, string | undefined>
  idleTimeoutMs?: number
  /** Application-owned configuration, applied again when resuming a thread. */
  config?: Record<string, unknown>
  model?: string
  baseInstructions?: string
  /** A sandbox is not a tool allowlist. Embedders must enforce their tool policy separately. */
  sandbox?: 'read-only' | 'workspace-write'
  onPermission?: (tool: string, input: unknown) => Promise<boolean>
  onWarning?: (message: string) => void
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
const string = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

export function foldCodexNotification(method: string, params: unknown): AgentFrame[] {
  const p = record(params)
  // Keep the exported folding helper compatible for existing consumers. The v2
  // adapter below ignores these legacy notifications to avoid duplicate deltas.
  if (method === 'codex/event/agent_message_delta') {
    const text = string(p.delta) ?? string(p.text)
    return text ? [{ type: 'delta', text }] : []
  }
  if (method === 'codex/event/tool_call_begin')
    return [
      {
        type: 'tool_call',
        id: string(p.call_id) ?? string(p.id) ?? 'tool',
        name: string(p.tool_name) ?? string(p.name) ?? 'tool',
        input: p.arguments ?? p.input
      }
    ]
  if (method === 'codex/event/tool_call_end')
    return [
      {
        type: 'tool_result',
        id: string(p.call_id) ?? string(p.id) ?? 'tool',
        ok: p.success === true,
        content: string(p.output)
      }
    ]
  if (method === 'codex/event/token_count') {
    const info = record(p.info ?? p)
    const input = typeof info.input_tokens === 'number' ? info.input_tokens : undefined
    const output = typeof info.output_tokens === 'number' ? info.output_tokens : undefined
    return input === undefined && output === undefined
      ? []
      : [{ type: 'cost', inputTokens: input, outputTokens: output }]
  }
  if (method === 'item/agentMessage/delta') {
    return typeof p.delta === 'string' ? [{ type: 'delta', text: p.delta }] : []
  }
  if (method === 'thread/tokenUsage/updated') {
    const usage = record(record(p.tokenUsage).last)
    return [
      {
        type: 'cost',
        inputTokens: typeof usage.inputTokens === 'number' ? usage.inputTokens : undefined,
        outputTokens: typeof usage.outputTokens === 'number' ? usage.outputTokens : undefined
      }
    ]
  }
  const item = record(p.item)
  const type = string(item.type)
  if (
    method === 'item/started' &&
    type &&
    !['agentMessage', 'userMessage', 'reasoning', 'plan'].includes(type)
  ) {
    return [{ type: 'tool_call', id: string(item.id) ?? 'tool', name: type, input: item }]
  }
  if (
    method === 'item/completed' &&
    type &&
    !['agentMessage', 'userMessage', 'reasoning', 'plan'].includes(type)
  ) {
    return [
      {
        type: 'tool_result',
        id: string(item.id) ?? 'tool',
        ok: item.status === 'completed',
        content: string(item.aggregatedOutput)
      }
    ]
  }
  return []
}

export function codexAppServerChatAgent(
  runner: DuplexRunner,
  options: CodexAppServerOptions
): FramedChatAgent {
  async function runTurn(
    turn: StreamTurnRequest,
    onFrame: (frame: AgentFrame) => void
  ): Promise<StreamTurnResult> {
    turn.signal?.throwIfAborted()
    const proc = runner.spawn(
      options.command ?? 'codex',
      options.args ?? ['app-server', '--stdio'],
      {
        cwd: options.cwd,
        env: options.env,
        idleTimeoutMs: options.idleTimeoutMs ?? 180_000
      }
    )
    let threadId: string | undefined
    let turnId: string | undefined
    let terminal: Record<string, unknown> | undefined
    let streamed = ''
    const messages = new Map<string, string>()
    let resolveCompleted!: () => void
    const completed = new Promise<void>((resolve) => {
      resolveCompleted = resolve
    })
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const session = new JsonRpcSession(proc, {
      onWarning: options.onWarning,
      onNotification(method, params) {
        if (method.startsWith('codex/event/')) return
        const p = record(params)
        if (threadId && p.threadId && p.threadId !== threadId) return
        if (turnId && p.turnId && p.turnId !== turnId) return
        for (const frame of foldCodexNotification(method, params)) {
          if (frame.type === 'delta') streamed += frame.text
          onFrame(frame)
        }
        const item = record(p.item)
        if (
          method === 'item/completed' &&
          item.type === 'agentMessage' &&
          typeof item.text === 'string'
        ) {
          messages.set(string(item.id) ?? 'message', item.text)
        }
        if (method === 'turn/completed') {
          terminal = record(p.turn)
          resolveCompleted()
        }
      },
      async onRequest(method, params) {
        const p = record(params)
        if (
          !['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(
            method
          )
        ) {
          throw new Error(`Unsupported agent request: ${method}`)
        }
        const tool = string(p.command) ?? method
        onFrame({ type: 'permission_request', id: string(p.itemId) ?? method, tool, input: params })
        const approved =
          !turn.signal?.aborted && (await (options.onPermission?.(tool, params) ?? false))
        return { decision: approved ? 'accept' : 'decline' }
      }
    })
    // Attach the rejection handler immediately: EOF may race initialization.
    const pump = session.start()
    const disconnected = pump.then(() => {
      throw new Error('Codex disconnected before turn completion')
    })
    void disconnected.catch(() => {})
    const cancel = () => {
      if (threadId && turnId) {
        void session.request('turn/interrupt', { threadId, turnId }).catch(() => {})
        killTimer = setTimeout(() => session.close('Codex turn cancelled'), 1500)
      } else session.close('Codex turn cancelled')
    }
    turn.signal?.addEventListener('abort', cancel, { once: true })
    try {
      await session.request('initialize', { clientInfo: { name: 'xnet', version: '0.1' } })
      session.notify('initialized')
      turn.signal?.throwIfAborted()
      const params = {
        cwd: options.cwd,
        sandbox: options.sandbox ?? 'read-only',
        approvalPolicy: 'never',
        ...(options.model ? { model: options.model } : {}),
        ...(options.config ? { config: options.config } : {}),
        ...(options.baseInstructions ? { baseInstructions: options.baseInstructions } : {})
      }
      const response = record(
        await session.request(turn.resumeSessionId ? 'thread/resume' : 'thread/start', {
          ...params,
          ...(turn.resumeSessionId ? { threadId: turn.resumeSessionId } : {})
        })
      )
      threadId = string(record(response.thread).id)
      if (!threadId)
        throw new Error('Codex did not return a thread ID; this runtime is incompatible')
      onFrame({ type: 'session', sessionId: threadId })
      turn.signal?.throwIfAborted()
      const started = record(
        await session.request('turn/start', {
          threadId,
          input: [{ type: 'text', text: turn.prompt }],
          ...(turn.outputSchema ? { outputSchema: turn.outputSchema } : {})
        })
      )
      turnId = string(record(started.turn).id)
      if (!turnId) throw new Error('Codex did not return a turn ID')
      if (turn.signal?.aborted) cancel()
      await Promise.race([completed, disconnected])
      turn.signal?.throwIfAborted()
      if (terminal?.status !== 'completed') {
        throw new Error(
          string(record(terminal?.error).message) ??
            `Codex turn ${string(terminal?.status) ?? 'failed'}`
        )
      }
      const text = (messages.size ? [...messages.values()].join('\n\n') : streamed).trim()
      if (!text) throw new Error('Codex completed without an answer')
      onFrame({ type: 'result', ok: true, text, sessionId: threadId })
      return { text, sessionId: threadId }
    } catch (cause) {
      onFrame({
        type: 'result',
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause)
      })
      throw cause
    } finally {
      turn.signal?.removeEventListener('abort', cancel)
      if (killTimer) clearTimeout(killTimer)
      session.close()
      proc.kill()
    }
  }
  return {
    streamTurnFrames: runTurn,
    streamTurn: (turn, onDelta) =>
      runTurn(turn, (frame) => {
        if (frame.type === 'delta') onDelta(frame.text)
      }),
    async chat(messages: ChatMessage[]) {
      return (await runTurn({ prompt: flattenChat(messages) }, () => {})).text
    }
  }
}
