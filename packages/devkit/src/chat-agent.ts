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

import type { CommandRunner } from './command-runner'

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
export function flattenChat(messages: ChatMessage[]): string {
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
