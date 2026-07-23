/**
 * @xnetjs/devkit — the structured agent-frame vocabulary (exploration 0392).
 *
 * The bridge's OpenAI-compatible endpoint (`/v1/chat/completions`) can only
 * carry text deltas: every tool call, cost figure, and session id Claude Code
 * emits over `stream-json` is flattened away before it reaches the browser.
 * That is the binding constraint on the product — no in-chat consent UI, no
 * tool-call visibility, no cost display.
 *
 * This module defines the richer wire the app-facing endpoint speaks instead:
 * a small {@link AgentFrame} union whose names are aligned with the Agent
 * Client Protocol (ACP) so a literal-ACP transport can be swapped in later
 * without reshaping the panel. Every serious agent client (Zed, Codex desktop,
 * JetBrains) receives frames like these; xNet's bridge deliberately flattened
 * them for Phase 0, and this is the un-flattening.
 *
 * {@link foldStreamJsonFrames} is the pure reducer that maps one NDJSON line of
 * Claude Code `stream-json` output to zero-or-more frames — the frame-emitting
 * counterpart of {@link reduceStreamJsonLine} (which stays untouched so the
 * OpenAI-compatible endpoint keeps its byte-for-byte output). Other agents
 * (Codex `app-server`, `gemini --experimental-acp`) fold their own native
 * protocols into the same vocabulary.
 */

/**
 * One structured event from an agent turn, forwarded to the app over the
 * framed endpoint. ACP-aligned names; a superset of what any single agent
 * emits (a plain text model only ever produces `delta`/`result`).
 */
export type AgentFrame =
  | { type: 'session'; sessionId: string; capabilities?: string[] }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input?: unknown }
  | { type: 'tool_result'; id: string; ok: boolean; content?: string }
  | { type: 'permission_request'; id: string; tool: string; input?: unknown }
  | { type: 'cost'; usd?: number; inputTokens?: number; outputTokens?: number }
  | { type: 'result'; ok: boolean; text?: string; sessionId?: string; error?: string }

/** The frame `type` discriminants, handy for exhaustive UI switches/tests. */
export const AGENT_FRAME_TYPES = [
  'session',
  'delta',
  'tool_call',
  'tool_result',
  'permission_request',
  'cost',
  'result'
] as const

/** Reducer state while folding one turn's `stream-json` NDJSON into frames. */
export interface StreamJsonFrameState {
  text: string
  sessionId?: string
  /** Whether any partial (`stream_event`) delta arrived — if so, complete
   *  `assistant` text blocks are duplicates and must not be re-emitted. */
  sawPartialDelta: boolean
  /** Set once a terminal `result` frame has been produced. */
  done: boolean
  error?: string
}

export const initialStreamJsonFrameState = (): StreamJsonFrameState => ({
  text: '',
  sawPartialDelta: false,
  done: false
})

/**
 * Fold one NDJSON line of Claude Code `stream-json` output into frames. Pure,
 * so the protocol mapping is unit-tested without spawning. Unlike
 * {@link reduceStreamJsonLine} (deltas only) this preserves the tool-use, cost,
 * and session structure the OpenAI protocol discards.
 *
 * Event shapes handled (all defensively):
 * - `{type:'system',subtype:'init',session_id,tools?}` → a `session` frame
 *   (with the `capabilities` array when present, v2.1.205+).
 * - `{type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text}}}`
 *   → a `delta` frame.
 * - `{type:'assistant',message:{content:[...]}}` → a `tool_call` frame per
 *   `tool_use` block, plus a `delta` frame per `text` block *only when no
 *   partial deltas streamed* (older CLIs / non-partial mode).
 * - `{type:'user',message:{content:[{type:'tool_result',tool_use_id,content,is_error}]}}`
 *   → a `tool_result` frame per block (the agent's own tool ran).
 * - `{type:'control_request',request:{subtype:'can_use_tool',tool_name,input}}`
 *   → a `permission_request` frame (the CLI is asking the client to approve a
 *   tool — the stream-json input-mode consent hook).
 * - `{type:'result',...,total_cost_usd?,usage?}` → a `cost` frame (when cost or
 *   token usage is present) followed by the terminal `result` frame.
 */
export function foldStreamJsonFrames(
  state: StreamJsonFrameState,
  line: string
): { state: StreamJsonFrameState; frames: AgentFrame[] } {
  let event: Record<string, unknown>
  try {
    const parsed = JSON.parse(line) as unknown
    if (!parsed || typeof parsed !== 'object') return { state, frames: [] }
    event = parsed as Record<string, unknown>
  } catch {
    return { state, frames: [] } // non-JSON noise on stdout — ignore
  }

  const next: StreamJsonFrameState = { ...state }
  const frames: AgentFrame[] = []
  if (typeof event.session_id === 'string') next.sessionId = event.session_id

  if (event.type === 'system' && event.subtype === 'init') {
    if (typeof event.session_id === 'string') {
      const capabilities = stringArray(event.capabilities)
      frames.push({
        type: 'session',
        sessionId: event.session_id,
        ...(capabilities.length ? { capabilities } : {})
      })
    }
    return { state: next, frames }
  }

  if (event.type === 'stream_event') {
    const inner = asRecord(event.event)
    if (inner.type === 'content_block_delta') {
      const delta = asRecord(inner.delta)
      if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
        next.sawPartialDelta = true
        next.text += delta.text
        frames.push({ type: 'delta', text: delta.text })
      }
    }
    return { state: next, frames }
  }

  if (event.type === 'assistant') {
    const message = asRecord(event.message)
    const blocks = Array.isArray(message.content) ? message.content : []
    for (const raw of blocks) {
      const block = asRecord(raw)
      if (
        block.type === 'tool_use' &&
        typeof block.id === 'string' &&
        typeof block.name === 'string'
      ) {
        frames.push({
          type: 'tool_call',
          id: block.id,
          name: block.name,
          ...(block.input !== undefined ? { input: block.input } : {})
        })
      } else if (block.type === 'text' && typeof block.text === 'string' && block.text) {
        // Complete text blocks are duplicates once partial deltas streamed.
        if (!next.sawPartialDelta) {
          next.text += block.text
          frames.push({ type: 'delta', text: block.text })
        }
      }
    }
    return { state: next, frames }
  }

  if (event.type === 'user') {
    const message = asRecord(event.message)
    const blocks = Array.isArray(message.content) ? message.content : []
    for (const raw of blocks) {
      const block = asRecord(raw)
      if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        frames.push({
          type: 'tool_result',
          id: block.tool_use_id,
          ok: block.is_error !== true,
          ...(typeof block.content === 'string' ? { content: block.content } : {})
        })
      }
    }
    return { state: next, frames }
  }

  if (event.type === 'control_request') {
    const request = asRecord(event.request)
    if (request.subtype === 'can_use_tool' && typeof request.tool_name === 'string') {
      const id =
        typeof event.request_id === 'string'
          ? event.request_id
          : typeof request.tool_use_id === 'string'
            ? request.tool_use_id
            : request.tool_name
      frames.push({
        type: 'permission_request',
        id,
        tool: request.tool_name,
        ...(request.input !== undefined ? { input: request.input } : {})
      })
    }
    return { state: next, frames }
  }

  if (event.type === 'result') {
    const cost = costFrame(event)
    if (cost) frames.push(cost)
    const isError = event.is_error === true || (event.subtype && event.subtype !== 'success')
    if (isError) {
      next.error =
        typeof event.result === 'string' && event.result
          ? event.result
          : `agent turn failed (${String(event.subtype ?? 'error')})`
      next.done = true
      frames.push({ type: 'result', ok: false, error: next.error })
      return { state: next, frames }
    }
    // A `result` with text is the authoritative full reply when nothing
    // streamed; fold it in so the terminal frame always carries the text.
    if (!next.text && typeof event.result === 'string' && event.result) next.text = event.result
    next.done = true
    frames.push({
      type: 'result',
      ok: true,
      ...(next.text ? { text: next.text } : {}),
      ...(next.sessionId ? { sessionId: next.sessionId } : {})
    })
    return { state: next, frames }
  }

  return { state: next, frames }
}

function costFrame(event: Record<string, unknown>): AgentFrame | undefined {
  const usd = numberOf(event.total_cost_usd)
  const usage = asRecord(event.usage)
  const inputTokens = numberOf(usage.input_tokens)
  const outputTokens = numberOf(usage.output_tokens)
  if (usd === undefined && inputTokens === undefined && outputTokens === undefined) return undefined
  return {
    type: 'cost',
    ...(usd !== undefined ? { usd } : {}),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {})
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}
