/**
 * @xnetjs/devkit — the chat-agent port (exploration 0194).
 *
 * The agent bridge drives the user's OWN coding-agent CLI as a *chat* surface:
 * a conversation in, the assistant's reply text out. `cliChatAgent` spawns the
 * user's `claude` / `codex` CLI (their subscription — zero model cost to xNet);
 * `fakeChatAgent` scripts replies for tests. Distinct from {@link AgentRunner},
 * which edits files in a worktree — here we just want the model's reply to stream
 * back to XNet's chat panel.
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
