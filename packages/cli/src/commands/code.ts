/**
 * `xnet code <intent>` — the agentic dev-loop as a command (explorations 0190 + 0194).
 *
 * Isolate in a git worktree → the user's OWN coding agent edits → validation
 * gate (typecheck → lint → test → fallow) → checkpoint on pass / roll back on
 * fail → optionally open a PR. Lets you "vibe-code" xNet (or a scaffolded
 * plugin) from the CLI, leveraging the user's agent subscription. The verifiable
 * spine lives in `@xnetjs/devkit`; this is the option mapping + result summary.
 */

import { join, resolve } from 'node:path'
import {
  cliAgentRunner,
  defaultXnetGate,
  Git,
  NodeCommandRunner,
  openPullRequest,
  runAgentTask,
  type AgentTaskResult,
  type ValidationStep
} from '@xnetjs/devkit'
import { Command } from 'commander'

export interface CodeRunOptions {
  agent?: string
  id?: string
  branch?: string
  worktree?: string
  base?: string
  pr?: boolean
  keep?: boolean
  repo?: string
}

export interface CodeRunConfig {
  id: string
  branch: string
  base: string
  worktreePath: string
  gate: ValidationStep[]
  keepWorktree: boolean
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'task'
  )
}

/**
 * Map CLI options to a dev-loop config. Pure (clock injected) so it's testable
 * without git. The worktree is kept when a PR is requested (a PR needs to push
 * the branch) or `--keep` is set.
 */
export function resolveCodeRunConfig(
  prompt: string,
  options: CodeRunOptions,
  repoRoot: string,
  now: () => number = Date.now
): CodeRunConfig {
  const id = options.id ?? `code-${slug(prompt)}-${now().toString(36)}`
  const branch = options.branch ?? `agent/${id}`
  const base = options.base ?? 'origin/main'
  const worktreePath = options.worktree
    ? resolve(options.worktree)
    : join(repoRoot, '.xnet', 'agent-worktrees', id)
  return {
    id,
    branch,
    base,
    worktreePath,
    gate: defaultXnetGate({ changedSince: base }),
    keepWorktree: Boolean(options.pr || options.keep)
  }
}

/** Human-readable one-liner for a dev-loop result. Pure + testable. */
export function summarizeAgentTaskResult(result: AgentTaskResult): string {
  if (!result.ok) {
    if (result.rolledBack && result.gate.failedStep) {
      return `✗ gate failed at "${result.gate.failedStep}" — edits rolled back on ${result.branch}.`
    }
    return `✗ agent run failed on ${result.branch}.`
  }
  if (result.noChanges) return `• agent made no changes on ${result.branch}.`
  return `✓ ${result.branch} passed the gate and was checkpointed.`
}

export function registerCodeCommand(program: Command): void {
  program
    .command('code')
    .argument('<intent>', 'What the coding agent should do')
    .description('Run a coding agent on this repo in an isolated worktree (gate → checkpoint/PR)')
    .option('--agent <command>', 'Coding agent CLI (claude, codex, aider, …)', 'claude')
    .option('--id <id>', 'Task id (also the default branch + worktree name)')
    .option('--branch <name>', 'Branch for the worktree (default agent/<id>)')
    .option('--base <ref>', 'Base ref for the gate + PR (default origin/main)')
    .option('--worktree <dir>', 'Worktree directory (default .xnet/agent-worktrees/<id>)')
    .option('--pr', 'Open a pull request when the gate passes')
    .option('--keep', 'Keep the worktree after a successful run')
    .option('--repo <dir>', 'Repo root (default current dir)')
    .action(async (intent: string, options: CodeRunOptions) => {
      const runner = new NodeCommandRunner()
      const repoRoot = resolve(options.repo ?? process.cwd())
      const config = resolveCodeRunConfig(intent, options, repoRoot)
      const result = await runAgentTask({
        git: new Git(runner, repoRoot),
        runner,
        agent: cliAgentRunner(runner, { command: options.agent ?? 'claude' }),
        task: { id: config.id, prompt: intent },
        worktreePath: config.worktreePath,
        branch: config.branch,
        gate: config.gate,
        keepWorktree: config.keepWorktree
      })
      // stderr so stdout stays clean for any tooling that scrapes it.
      console.error(summarizeAgentTaskResult(result))
      if (result.ok && !result.noChanges && options.pr) {
        try {
          const pr = await openPullRequest(runner, config.worktreePath, config.branch, {
            base: config.base,
            title: intent
          })
          console.error(`→ PR: ${pr.url}`)
        } catch (err) {
          console.error(`→ PR failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      process.exitCode = result.ok ? 0 : 1
    })
}
