/**
 * The model lane's frame vocabulary (exploration 0416, closing 0392).
 *
 * xNet has two ways to reach a model, and until now they reported progress in
 * two different shapes: the **bridge lane** (a spawned coding-agent CLI) emits
 * structured `AgentFrame`s over `/v1/agent/stream`, while the **model lane**
 * (`AiAgentRuntime` driving a raw provider) emitted only its own internal
 * events. The panel therefore had to render tool activity twice, and the
 * Phase-0 "tools are advertised but invisible" badge could never retire for
 * providers whose tool-calling is actually reliable.
 *
 * This declares the same union for the model lane. It is deliberately a
 * *re-declaration* rather than an import from `@xnetjs/devkit`: the frames are
 * a wire contract shared by processes that version independently, and
 * `packages/plugins` sits below `devkit` in the dependency order. `workbench`
 * re-declares it for the same reason.
 *
 * Names stay ACP-aligned so a literal-ACP transport can replace either lane
 * without reshaping the panel.
 */

/** One structured event from an agent turn. Mirrors devkit's `AgentFrame`. */
export type AiAgentFrame =
  | { type: 'session'; sessionId: string; capabilities?: string[] }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input?: unknown }
  | { type: 'tool_result'; id: string; ok: boolean; content?: string }
  | { type: 'permission_request'; id: string; tool: string; input?: unknown }
  | { type: 'cost'; usd?: number; inputTokens?: number; outputTokens?: number }
  | { type: 'result'; ok: boolean; text?: string; sessionId?: string; error?: string }

/** Receives frames as a turn progresses. */
export type AiAgentFrameSink = (frame: AiAgentFrame) => void

/**
 * Frame for a tool the model asked to run.
 */
export function toolCallFrame(call: {
  id: string
  name: string
  arguments?: unknown
}): AiAgentFrame {
  return { type: 'tool_call', id: call.id, name: call.name, input: call.arguments }
}

/**
 * Frame for a completed tool call.
 *
 * `denied` is reported as `ok: false` rather than omitted: a refused tool is a
 * negative outcome the user should see, not an absence.
 */
export function toolResultFrame(
  call: { id: string },
  content: string,
  denied: boolean
): AiAgentFrame {
  return { type: 'tool_result', id: call.id, ok: !denied, content }
}
