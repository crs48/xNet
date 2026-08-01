/**
 * Agent Client Protocol (ACP) adapter (exploration 0392 item, built in 0416).
 *
 * ACP is the cross-vendor standard for decoupling a UI from an agent: JSON-RPC
 * over stdio, streamed `session/update` notifications, and server-initiated
 * permission requests. Gemini CLI is the reference agent
 * (`gemini --experimental-acp`), and Zed, JetBrains, Neovim and Emacs are
 * clients.
 *
 * This is the cheapest adapter in the set, and that is the point: xNet's
 * `AgentFrame` vocabulary was deliberately given ACP-aligned names in 0392, so
 * the mapping here is nearly one-to-one. Every future ACP agent arrives for
 * free — which is the whole argument for not building a harness.
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

export interface AcpAgentOptions {
  /** CLI to spawn. Default `'gemini'`. */
  command?: string
  /** Args. Default `['--experimental-acp']`. */
  args?: string[]
  cwd: string
  /** Kill a turn with no output for this many ms (0 = never). Default 180000. */
  idleTimeoutMs?: number
  /** Decides a permission request. Denies by default (see codex-app-server). */
  onPermission?: (tool: string, input: unknown) => Promise<boolean>
  onWarning?: (message: string) => void
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

/** Pull display text out of ACP's content-block shape. */
function contentText(value: unknown): string | undefined {
  const record = asRecord(value)
  if (readString(record.text)) return readString(record.text)
  if (Array.isArray(value)) {
    const parts = value.map((part) => readString(asRecord(part).text)).filter(Boolean)
    return parts.length > 0 ? parts.join('') : undefined
  }
  return undefined
}

/**
 * Fold one ACP `session/update` into {@link AgentFrame}s.
 *
 * Pure and exported for the same reason as the Codex fold: the mapping is the
 * part worth testing, and it should not require a subprocess.
 */
export function foldAcpUpdate(params: unknown): AgentFrame[] {
  const p = asRecord(params)
  const update = asRecord(p.update)
  const kind = readString(update.sessionUpdate)

  switch (kind) {
    case 'agent_message_chunk': {
      const text = contentText(update.content)
      return text ? [{ type: 'delta', text }] : []
    }
    case 'tool_call': {
      const id = readString(update.toolCallId) ?? 'tool'
      const name = readString(update.title) ?? readString(update.kind) ?? 'tool'
      return [{ type: 'tool_call', id, name, input: update.rawInput }]
    }
    case 'tool_call_update': {
      const id = readString(update.toolCallId) ?? 'tool'
      const status = readString(update.status)
      // Only terminal statuses produce a result; `in_progress` is not an answer.
      if (status !== 'completed' && status !== 'failed') return []
      return [
        {
          type: 'tool_result',
          id,
          ok: status === 'completed',
          content: contentText(update.content)
        }
      ]
    }
    default:
      return []
  }
}

/**
 * A {@link FramedChatAgent} over any ACP agent.
 */
export function acpChatAgent(runner: DuplexRunner, options: AcpAgentOptions): FramedChatAgent {
  const {
    command = 'gemini',
    args = ['--experimental-acp'],
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

    const session = new JsonRpcSession(proc, {
      onWarning,
      onNotification: (method, params) => {
        if (method !== 'session/update') return
        for (const frame of foldAcpUpdate(params)) {
          if (frame.type === 'delta') finalText += frame.text
          onFrame(frame)
        }
      },
      onRequest: async (method, params) => {
        if (method !== 'session/request_permission') {
          throw new Error(`Unsupported request ${method}`)
        }
        const p = asRecord(params)
        const call = asRecord(p.toolCall)
        const id = readString(call.toolCallId) ?? 'permission'
        const tool = readString(call.title) ?? readString(call.kind) ?? 'tool'

        onFrame({ type: 'permission_request', id, tool, input: params })

        const approved = await onPermission(tool, params)
        // ACP expects an outcome object naming the selected option kind.
        return {
          outcome: approved
            ? { outcome: 'selected', optionId: 'allow' }
            : { outcome: 'cancelled' }
        }
      }
    })

    const pump = session.start()

    try {
      await session.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }
      })

      let sessionId = turn.resumeSessionId
      if (!sessionId) {
        const created = asRecord(await session.request('session/new', { cwd, mcpServers: [] }))
        sessionId = readString(created.sessionId)
      }
      if (sessionId) onFrame({ type: 'session', sessionId })

      // `session/prompt` resolves when the turn ends — ACP models a turn as a
      // request, so there is no separate completion notification to await.
      const result = asRecord(
        await session.request('session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text: turn.prompt }]
        })
      )
      const stopReason = readString(result.stopReason)

      const text = finalText.trim()
      onFrame({
        type: 'result',
        ok: stopReason !== 'refusal',
        text,
        ...(sessionId ? { sessionId } : {})
      })
      return { text, ...(sessionId ? { sessionId } : {}) }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onFrame({ type: 'result', ok: false, error: message })
      throw err
    } finally {
      session.close()
      void pump.catch(() => {})
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
