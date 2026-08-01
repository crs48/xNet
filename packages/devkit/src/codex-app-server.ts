/**
 * Codex `app-server` adapter (exploration 0392 item, built in 0416).
 *
 * Codex went the opposite way from Anthropic: `codex app-server` is a
 * documented, versioned JSON-RPC 2.0 embedding surface explicitly sanctioned
 * for third-party products, with the user's ChatGPT-plan auth handled inside
 * the harness. Driving it beats the previous one-shot `codex exec` on two
 * counts that the user can feel:
 *
 *   - **Threads persist.** A follow-up turn resumes the same conversation
 *     instead of replaying the entire history as a new prompt.
 *   - **Tool calls and approvals are visible.** `exec` flattened them away;
 *     here they arrive as notifications and become {@link AgentFrame}s, which
 *     is what lets the panel render them and prompt for consent.
 *
 * Approval requests arrive as server-initiated *requests*, so the adapter must
 * answer them. It refuses by default: an embedder that auto-approves is
 * strictly worse than one that cannot approve at all, because it launders the
 * agent's decision as the user's.
 */

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
  /** CLI to spawn. Default `'codex'`. */
  command?: string
  /** Args. Default `['app-server']`. */
  args?: string[]
  cwd: string
  /** Kill a turn with no output for this many ms (0 = never). Default 180000. */
  idleTimeoutMs?: number
  /**
   * Decides a permission request. Default denies everything — see the module
   * note. Return `true` to approve.
   */
  onPermission?: (tool: string, input: unknown) => Promise<boolean>
  onWarning?: (message: string) => void
}

/** Notification methods app-server emits during a turn. */
const NOTIFY = {
  delta: 'codex/event/agent_message_delta',
  message: 'codex/event/agent_message',
  toolBegin: 'codex/event/tool_call_begin',
  toolEnd: 'codex/event/tool_call_end',
  usage: 'codex/event/token_count',
  done: 'codex/event/task_complete'
} as const

/** Permission requests app-server sends back at the client. */
const PERMISSION_METHODS = new Set([
  'codex/request/exec_approval',
  'codex/request/apply_patch_approval'
])

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

/**
 * Fold one app-server notification into zero or more {@link AgentFrame}s.
 *
 * Pure and exported so the mapping is testable without a subprocess — the same
 * discipline `foldStreamJsonFrames` follows for Claude Code.
 */
export function foldCodexNotification(method: string, params: unknown): AgentFrame[] {
  const p = asRecord(params)

  switch (method) {
    case NOTIFY.delta: {
      const text = readString(p.delta) ?? readString(p.text)
      return text ? [{ type: 'delta', text }] : []
    }
    case NOTIFY.message: {
      // Complete-message events duplicate the deltas that preceded them; the
      // terminal `result` frame carries the final text instead.
      return []
    }
    case NOTIFY.toolBegin: {
      const id = readString(p.call_id) ?? readString(p.id) ?? 'tool'
      const name = readString(p.tool_name) ?? readString(p.name) ?? 'tool'
      return [{ type: 'tool_call', id, name, input: p.arguments ?? p.input }]
    }
    case NOTIFY.toolEnd: {
      const id = readString(p.call_id) ?? readString(p.id) ?? 'tool'
      // Absent `success` means the agent did not say — treat as failure rather
      // than reporting a success we were never told about.
      const ok = p.success === true
      return [{ type: 'tool_result', id, ok, content: readString(p.output) }]
    }
    case NOTIFY.usage: {
      const info = asRecord(p.info ?? p)
      const input = typeof info.input_tokens === 'number' ? info.input_tokens : undefined
      const output = typeof info.output_tokens === 'number' ? info.output_tokens : undefined
      if (input === undefined && output === undefined) return []
      return [{ type: 'cost', inputTokens: input, outputTokens: output }]
    }
    default:
      return []
  }
}

/**
 * A {@link FramedChatAgent} over `codex app-server`.
 *
 * Threads are created on the first turn and reused whenever the caller passes
 * back the `sessionId` it received — this is the "no full-history replay"
 * property the exploration asked for.
 */
export function codexAppServerChatAgent(
  runner: DuplexRunner,
  options: CodexAppServerOptions
): FramedChatAgent {
  const {
    command = 'codex',
    args = ['app-server'],
    cwd,
    idleTimeoutMs = 180_000,
    onPermission = async () => false,
    onWarning
  } = options

  async function runTurn(
    turn: StreamTurnRequest,
    onFrame: (frame: AgentFrame) => void
  ): Promise<StreamTurnResult> {
    const proc = runner.spawn(command, args, { cwd, idleTimeoutMs })

    let finalText = ''
    let done: (() => void) | undefined
    const completed = new Promise<void>((resolve) => {
      done = resolve
    })

    const session = new JsonRpcSession(proc, {
      onWarning,
      onNotification: (method, params) => {
        for (const frame of foldCodexNotification(method, params)) {
          if (frame.type === 'delta') finalText += frame.text
          onFrame(frame)
        }
        if (method === NOTIFY.done) done?.()
      },
      onRequest: async (method, params) => {
        if (!PERMISSION_METHODS.has(method)) {
          throw new Error(`Unsupported request ${method}`)
        }
        const p = asRecord(params)
        const tool = readString(p.tool_name) ?? readString(p.command) ?? method
        const id = readString(p.call_id) ?? readString(p.id) ?? 'permission'

        // Surface it before deciding, so the panel can render the prompt.
        onFrame({ type: 'permission_request', id, tool, input: params })

        const approved = await onPermission(tool, params)
        return { decision: approved ? 'approved' : 'denied' }
      }
    })

    const pump = session.start()

    try {
      await session.request('initialize', {
        clientInfo: { name: 'xnet', version: '1' }
      })

      // Resume the existing thread, or start one.
      let threadId = turn.resumeSessionId
      if (!threadId) {
        const created = asRecord(await session.request('newConversation', { cwd }))
        threadId = readString(created.conversationId) ?? readString(created.threadId)
      }
      if (threadId) onFrame({ type: 'session', sessionId: threadId })

      await session.request('sendUserMessage', {
        conversationId: threadId,
        items: [{ type: 'text', text: turn.prompt }]
      })

      // The turn ends on `task_complete`, or when the process exits.
      await Promise.race([completed, pump])

      const text = finalText.trim()
      onFrame({ type: 'result', ok: true, text, ...(threadId ? { sessionId: threadId } : {}) })
      return { text, ...(threadId ? { sessionId: threadId } : {}) }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onFrame({ type: 'result', ok: false, error: message })
      throw err
    } finally {
      session.close()
    }
  }

  return {
    streamTurnFrames: runTurn,
    async streamTurn(turn, onDelta) {
      return await runTurn(turn, (frame) => {
        if (frame.type === 'delta') onDelta(frame.text)
      })
    },
    async chat(messages: ChatMessage[]) {
      const result = await runTurn({ prompt: flattenChat(messages) }, () => {})
      return result.text
    }
  }
}
