/**
 * @xnetjs/devkit — the agentic dev loop (exploration 0190).
 *
 * The heart of "vibe coding xNet from within xNet", and the loop this very
 * session embodies:
 *
 *   isolate (worktree) → agent edits → validation gate → checkpoint | roll back
 *
 * It never touches the live checkout (all work happens in a throwaway worktree),
 * it always lands on a known-good state (checkpoint on pass, hard reset on fail),
 * and it's pure orchestration over the injectable ports, so it's fully testable.
 */

import type { AgentRunner, AgentTask } from './agent'
import type { CommandRunner } from './command-runner'
import { Git, type GitCheckpoint } from './git'
import { runValidationGate, type GateResult, type ValidationStep } from './validation-gate'

export interface RunAgentTaskOptions {
  /** `Git` bound to the MAIN repo (the worktree is created from it). */
  git: Git
  /** Runner used for the validation gate (and PR push). */
  runner: CommandRunner
  /** The coding agent (bring-your-own CLI, or a fake). */
  agent: AgentRunner
  task: AgentTask
  /** Where to create the throwaway worktree. */
  worktreePath: string
  /** Branch name for the worktree (defaults to `agent/<task.id>`). */
  branch?: string
  /** The validation gate to run after the agent edits. */
  gate: ValidationStep[]
  /** Keep the worktree after a successful run (needed to push a PR). Default false. */
  keepWorktree?: boolean
}

export interface AgentTaskResult {
  ok: boolean
  branch: string
  worktreePath: string
  /** The restore point, present only when the gate passed. */
  checkpoint?: GitCheckpoint
  /** Gate outcome (empty steps if the agent itself failed before the gate ran). */
  gate: GateResult
  /** True when edits were discarded because the gate failed. */
  rolledBack: boolean
  /** Agent stdout/stderr, for surfacing in the terminal UI. */
  agentOutput: string
}

/**
 * Run one agent task end-to-end. Returns a checkpoint on success or a
 * rolled-back result on failure; never leaves the worktree in a broken state.
 */
export async function runAgentTask(options: RunAgentTaskOptions): Promise<AgentTaskResult> {
  const branch = options.branch ?? `agent/${options.task.id}`
  const empty: GateResult = { ok: false, steps: [] }
  const wt = await options.git.worktreeAdd(options.worktreePath, branch)

  try {
    // 1. The agent edits files in the isolated worktree.
    const agentResult = await options.agent.run(options.worktreePath, options.task)
    if (!agentResult.ok) {
      await wt.resetHard()
      return {
        ok: false,
        branch,
        worktreePath: options.worktreePath,
        gate: empty,
        rolledBack: true,
        agentOutput: agentResult.output
      }
    }

    // 2. Validate. On failure, discard the edits — the remediation.
    const gate = await runValidationGate(options.runner, options.worktreePath, options.gate)
    if (!gate.ok) {
      await wt.resetHard()
      return {
        ok: false,
        branch,
        worktreePath: options.worktreePath,
        gate,
        rolledBack: true,
        agentOutput: agentResult.output
      }
    }

    // 3. Checkpoint — a restore point on the branch.
    const checkpoint = await wt.checkpoint(options.task.id)
    return {
      ok: true,
      branch,
      worktreePath: options.worktreePath,
      checkpoint,
      gate,
      rolledBack: false,
      agentOutput: agentResult.output
    }
  } finally {
    // The branch (and any checkpoint commit) survives worktree removal.
    if (!options.keepWorktree) {
      await options.git.worktreeRemove(options.worktreePath).catch(() => {})
    }
  }
}

export interface OpenPullRequestOptions {
  base?: string
  title?: string
  body?: string
}

/**
 * Push the branch and open a PR via the `gh` CLI — the "one-click PR to the
 * open-source repo" output path. Runs in the worktree (keep it with
 * `keepWorktree: true`).
 */
export async function openPullRequest(
  runner: CommandRunner,
  worktreePath: string,
  branch: string,
  options: OpenPullRequestOptions = {}
): Promise<{ url: string }> {
  const push = await runner.run('git', ['push', '-u', 'origin', branch], { cwd: worktreePath })
  if (!push.ok) throw new Error(`git push failed: ${push.stderr.trim()}`)

  const args = ['pr', 'create', '--base', options.base ?? 'main']
  if (options.title) args.push('--title', options.title)
  if (options.body) args.push('--body', options.body)
  if (!options.title && !options.body) args.push('--fill')

  const pr = await runner.run('gh', args, { cwd: worktreePath })
  if (!pr.ok) throw new Error(`gh pr create failed: ${pr.stderr.trim()}`)
  return { url: pr.stdout.trim() }
}

export interface PublishPluginRepoOptions {
  /** New GitHub repo, e.g. `'alice/xnet-plugin-kanban'` or `'xnet-plugin-kanban'`. */
  repo: string
  /** Visibility for `gh repo create`. Default `'public'`. */
  visibility?: 'public' | 'private'
}

/**
 * Create a GitHub repo from a plugin directory and push it — the "create your own
 * plugin repo" output path (exploration 0190). The marketplace-manifest PR
 * (adding the repo to 0047's `registry.yaml`) is a follow-up once that registry
 * repo exists.
 */
export async function publishPluginRepo(
  runner: CommandRunner,
  cwd: string,
  options: PublishPluginRepoOptions
): Promise<{ repoUrl: string }> {
  const visibility = options.visibility ?? 'public'
  const r = await runner.run(
    'gh',
    ['repo', 'create', options.repo, `--${visibility}`, '--source=.', '--remote=origin', '--push'],
    { cwd }
  )
  if (!r.ok) throw new Error(`gh repo create failed: ${r.stderr.trim()}`)
  // `gh repo create` prints the repo URL (last line of stdout).
  const repoUrl = r.stdout.trim().split('\n').pop()?.trim() ?? ''
  return { repoUrl }
}
