/**
 * @xnetjs/devkit — the coding-agent port (exploration 0190).
 *
 * "Bring your own agent": xNet hosts the user's *own* `claude` / `codex` / `aider`
 * CLI rather than building a coder. `cliAgentRunner` spawns that CLI in the
 * worktree (zero model cost to xNet — it's the user's subscription).
 * `fakeAgentRunner` runs an injected edit callback for tests.
 */

import type { CommandRunner } from './command-runner'

export interface AgentTask {
  /** Stable id (used for the branch + checkpoint label). */
  id: string
  /** The natural-language instruction handed to the agent. */
  prompt: string
}

export interface AgentResult {
  ok: boolean
  output: string
}

export interface AgentRunner {
  /** Run the coding agent in `workdir` against `task`; it edits files in place. */
  run(workdir: string, task: AgentTask): Promise<AgentResult>
}

export interface CliAgentOptions {
  /** The CLI to spawn, e.g. `'claude'`, `'codex'`, `'aider'`. */
  command: string
  /**
   * Arg template; the literal `{prompt}` token is replaced by the task prompt.
   * Default is Claude Code's headless form: `['-p', '{prompt}']`.
   */
  args?: string[]
  /** Per-run timeout in ms (0 = none). */
  timeoutMs?: number
}

/** An `AgentRunner` backed by the user's own coding-agent CLI. */
export function cliAgentRunner(runner: CommandRunner, options: CliAgentOptions): AgentRunner {
  return {
    async run(workdir, task) {
      // split/join (not String.replace): the prompt is arbitrary text, and
      // replace() would interpret `$&`/`$\``/`$'`/`$$`/`$n` in it as special
      // replacement patterns (corrupting any prompt with `$`), and only swap the
      // first `{prompt}` token. split/join is literal and replaces every token.
      const args = (options.args ?? ['-p', '{prompt}']).map((a) =>
        a.split('{prompt}').join(task.prompt)
      )
      const r = await runner.run(options.command, args, {
        cwd: workdir,
        timeoutMs: options.timeoutMs
      })
      return { ok: r.ok, output: `${r.stdout}${r.stderr}` }
    }
  }
}

/** A test/dev `AgentRunner` that runs an injected edit against the worktree. */
export function fakeAgentRunner(
  edit: (workdir: string, task: AgentTask) => void | Promise<void>
): AgentRunner {
  return {
    async run(workdir, task) {
      await edit(workdir, task)
      return { ok: true, output: `edited ${task.id}` }
    }
  }
}
