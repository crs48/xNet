/**
 * @xnetjs/devkit — the chat-agent port (exploration 0194).
 *
 * The agent bridge drives the user's OWN coding-agent CLI as a *chat* surface:
 * a conversation in, the assistant's reply text out. `cliChatAgent` spawns the
 * user's `claude` / `codex` CLI (their subscription — zero model cost to xNet);
 * `fakeChatAgent` scripts replies for tests. Distinct from {@link AgentRunner},
 * which edits files in a worktree — here we just want the model's reply to stream
 * back to xNet's chat panel.
 */

import { buildStreamingAgentArgs, type AgentLaunchOptions } from './agent-launch'
import type { CommandRunner, LineRunner } from './command-runner'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatAgent {
  /** Produce the assistant's reply text for a conversation. */
  chat(messages: ChatMessage[]): Promise<string>
}

export interface CliChatAgentOptions {
  /** CLI to spawn, e.g. `'claude'` or `'codex'`. */
  command: string
  /**
   * Arg template; the literal `{prompt}` token is replaced by the flattened
   * conversation. Default is Claude Code's headless form `['-p', '{prompt}']`;
   * Codex would be `['exec', '{prompt}']`.
   */
  args?: string[]
  /** Working directory the agent runs in (its file/workspace scope). */
  cwd: string
  /** Per-turn timeout in ms (0 = none). Default 120000. */
  timeoutMs?: number
}

/** Flatten a conversation into a single prompt for headless CLIs. */
export function flattenChat(messages: readonly ChatMessage[]): string {
  return messages
    .map((message) =>
      message.role === 'user' ? message.content : `${message.role}: ${message.content}`
    )
    .join('\n\n')
}

/**
 * A {@link ChatAgent} backed by the user's own coding-agent CLI. Spawning the
 * installed CLI (rather than reusing its auth token) is the ToS-safe way to use
 * the user's subscription.
 */
export function cliChatAgent(runner: CommandRunner, options: CliChatAgentOptions): ChatAgent {
  return {
    async chat(messages) {
      const prompt = flattenChat(messages)
      // split/join (not String.replace): the prompt is arbitrary text, and
      // replace() would interpret `$&`/`$\``/`$'`/`$$`/`$n` as special patterns
      // and only swap the first token. split/join is literal and replaces all.
      const args = (options.args ?? ['-p', '{prompt}']).map((arg) =>
        arg.split('{prompt}').join(prompt)
      )
      const result = await runner.run(options.command, args, {
        cwd: options.cwd,
        timeoutMs: options.timeoutMs ?? 120_000
      })
      if (!result.ok) {
        throw new Error(
          `agent "${options.command}" failed (code ${result.code}): ${result.stderr || result.stdout}`.trim()
        )
      }
      return result.stdout.trim()
    }
  }
}

export interface OpenAiChatAgentOptions {
  /** Base URL of an OpenAI-compatible server, e.g. `http://localhost:11434` (Ollama). */
  baseUrl: string
  /** Model id to request (e.g. `llama3.2`). */
  model: string
  /** Optional bearer token for the upstream (LM Studio / a keyed gateway). */
  apiKey?: string
  /** Per-turn timeout in ms. Default 120000. */
  timeoutMs?: number
  /** Injectable fetch for tests. Default: global `fetch`. */
  fetchImpl?: typeof fetch
}

/**
 * A {@link ChatAgent} that forwards the conversation to an upstream
 * OpenAI-compatible server (Ollama's `/v1`, LM Studio, vLLM, …). This lets the
 * hardened bridge daemon *front* a raw local model, so browser access to it goes
 * through the same authenticated, origin-locked, Host-validated door as the CLI
 * agents — instead of the user weakening the model server's own CORS. The reply
 * is returned as text; the bridge streams it back as OpenAI SSE.
 */
export function openAiChatAgent(options: OpenAiChatAgentOptions): ChatAgent {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`
  return {
    async chat(messages) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})
        },
        body: JSON.stringify({ model: options.model, messages, stream: false }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000)
      })
      if (!response.ok) {
        throw new Error(`upstream model at ${options.baseUrl} failed (HTTP ${response.status})`)
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      return data.choices?.[0]?.message?.content?.trim() ?? ''
    }
  }
}

// ─── Streaming, session-aware chat agent (exploration 0391) ────────────────────

/** One planned agent turn: the prompt to send, and the session to continue. */
export interface StreamTurnRequest {
  prompt: string
  /** Continue this stored CLI session (`--resume`) instead of starting fresh. */
  resumeSessionId?: string
}

export interface StreamTurnResult {
  text: string
  /** The CLI session id, for resuming the conversation next turn. */
  sessionId?: string
}

/**
 * A {@link ChatAgent} that can also stream a turn's deltas live and carry a
 * session across turns. The bridge upgrades to this path when the agent
 * supports it (Claude Code); others stay on the one-shot `chat()` path.
 */
export interface StreamingChatAgent extends ChatAgent {
  streamTurn(turn: StreamTurnRequest, onDelta: (text: string) => void): Promise<StreamTurnResult>
}

export function isStreamingChatAgent(agent: ChatAgent): agent is StreamingChatAgent {
  return typeof (agent as Partial<StreamingChatAgent>).streamTurn === 'function'
}

/** Reducer state while consuming one turn's `stream-json` NDJSON events. */
export interface StreamJsonState {
  text: string
  sessionId?: string
  /** Whether any partial (`stream_event`) delta arrived — if so, complete
   *  `assistant` messages are duplicates and must not be re-emitted. */
  sawPartialDelta: boolean
  error?: string
}

export const initialStreamJsonState = (): StreamJsonState => ({ text: '', sawPartialDelta: false })

/**
 * Fold one NDJSON line of Claude Code `stream-json` output into the state.
 * Returns the delta text this line contributes (to forward to the client), or
 * undefined. Pure, so the event protocol is unit-tested without spawning.
 *
 * Event shapes handled (all defensively):
 * - `{type:'system',subtype:'init',session_id}` — session id, no text.
 * - `{type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text}}}`
 *   — a live partial delta (`--include-partial-messages`).
 * - `{type:'assistant',message:{content:[{type:'text',text}]}}` — a complete
 *   assistant message; only used when no partials arrived (older CLIs).
 * - `{type:'result',subtype,result,session_id,is_error}` — final: authoritative
 *   session id, and the full text fallback when nothing streamed.
 */
export function reduceStreamJsonLine(
  state: StreamJsonState,
  line: string
): { state: StreamJsonState; delta?: string } {
  let event: Record<string, unknown>
  try {
    const parsed = JSON.parse(line) as unknown
    if (!parsed || typeof parsed !== 'object') return { state }
    event = parsed as Record<string, unknown>
  } catch {
    return { state } // non-JSON noise on stdout — ignore
  }
  const next: StreamJsonState = { ...state }
  if (typeof event.session_id === 'string') next.sessionId = event.session_id

  if (event.type === 'stream_event') {
    const inner = (event.event ?? {}) as Record<string, unknown>
    if (inner.type === 'content_block_delta') {
      const delta = (inner.delta ?? {}) as Record<string, unknown>
      if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
        next.sawPartialDelta = true
        next.text += delta.text
        return { state: next, delta: delta.text }
      }
    }
    return { state: next }
  }

  if (event.type === 'assistant' && !next.sawPartialDelta) {
    const message = (event.message ?? {}) as Record<string, unknown>
    const blocks = Array.isArray(message.content) ? message.content : []
    const text = blocks
      .map((block) => {
        const b = (block ?? {}) as Record<string, unknown>
        return b.type === 'text' && typeof b.text === 'string' ? b.text : ''
      })
      .join('')
    if (text) {
      next.text += text
      return { state: next, delta: text }
    }
    return { state: next }
  }

  if (event.type === 'result') {
    const isError = event.is_error === true || (event.subtype && event.subtype !== 'success')
    if (isError) {
      next.error =
        typeof event.result === 'string' && event.result
          ? event.result
          : `agent turn failed (${String(event.subtype ?? 'error')})`
      return { state: next }
    }
    if (!next.text && typeof event.result === 'string' && event.result) {
      next.text = event.result
      return { state: next, delta: event.result }
    }
  }

  return { state: next }
}

export interface CliStreamingChatAgentOptions {
  /** CLI to spawn — must speak `stream-json` (Claude Code). */
  command: string
  /** Working directory (also scopes the CLI's stored sessions). */
  cwd: string
  /** Kill a turn with no output for this many ms. Default 180000 (0 = never). */
  idleTimeoutMs?: number
  /** MCP wiring forwarded to {@link buildStreamingAgentArgs}. */
  launch?: AgentLaunchOptions
}

/**
 * A {@link StreamingChatAgent} over Claude Code's `stream-json` headless mode:
 * deltas are forwarded live as the CLI emits them, and each turn reports the
 * CLI session id so the next turn can `--resume` it (the CLI then carries the
 * conversation context itself — no more re-sending the whole history).
 * Timeouts are idle-based, not wall-clock: long turns are legitimate, silent
 * ones are reaped.
 */
export function cliStreamingChatAgent(
  lines: LineRunner,
  options: CliStreamingChatAgentOptions
): StreamingChatAgent {
  const idleTimeoutMs = options.idleTimeoutMs ?? 180_000
  return {
    async streamTurn(turn, onDelta) {
      const args = buildStreamingAgentArgs(turn.prompt, {
        ...options.launch,
        ...(turn.resumeSessionId ? { resumeSessionId: turn.resumeSessionId } : {})
      })
      let state = initialStreamJsonState()
      for await (const line of lines.stream(options.command, args, {
        cwd: options.cwd,
        idleTimeoutMs
      })) {
        const step = reduceStreamJsonLine(state, line)
        state = step.state
        if (step.delta) onDelta(step.delta)
        if (state.error) break
      }
      if (state.error) throw new Error(state.error)
      return {
        text: state.text.trim(),
        ...(state.sessionId ? { sessionId: state.sessionId } : {})
      }
    },
    async chat(messages) {
      const result = await this.streamTurn({ prompt: flattenChat(messages) }, () => {})
      return result.text
    }
  }
}

/** A test/dev {@link ChatAgent} that returns a scripted or derived reply. */
export function fakeChatAgent(
  reply: (messages: ChatMessage[]) => string | Promise<string>
): ChatAgent {
  return {
    async chat(messages) {
      return await reply(messages)
    }
  }
}
