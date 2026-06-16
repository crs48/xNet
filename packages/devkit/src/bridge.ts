/**
 * @xnetjs/devkit — the agent bridge contract (exploration 0190).
 *
 * The pure logic of the "local bridge" daemon the connector ladder already probes
 * for at `http://127.0.0.1:31416/health` (exploration 0174). The Electron HTTP
 * server is a thin shell: it answers `/health` with `bridgeHealth()` (so the
 * connector detects it) and routes `/run` to `handleBridgeRun()`. Keeping the
 * logic here makes the daemon testable without an HTTP server or a real agent.
 */

import type { AgentRunner } from './agent'
import type { CommandRunner } from './command-runner'
import type { Git } from './git'
import type { ValidationStep } from './validation-gate'
import { dirname, resolve } from 'node:path'
import { runAgentTask, type AgentTaskResult } from './dev-loop'

export interface BridgeHealthPayload {
  ok: true
  service: 'xnet-agent-bridge'
  /** Which coding-agent CLI this bridge wraps (e.g. `'claude'`). */
  agent: string
  version: string
}

/** The `/health` payload the connector ladder (0174) probes for at `:31416`. */
export function bridgeHealth(options: { agent: string; version: string }): BridgeHealthPayload {
  return { ok: true, service: 'xnet-agent-bridge', agent: options.agent, version: options.version }
}

export interface BridgeDeps {
  /** `Git` bound to the target repo. */
  git: Git
  /** Runner for the validation gate. */
  runner: CommandRunner
  /** The coding agent (bring-your-own CLI, or a fake). */
  agent: AgentRunner
  /** The default validation gate run after the agent edits. */
  gate: ValidationStep[]
  /** Base directory under which per-task worktrees are created. */
  worktreeRoot: string
}

export interface BridgeRunRequest {
  taskId: string
  prompt: string
  /** Override the worktree directory name (defaults to `taskId`). */
  worktreeName?: string
}

/**
 * Resolve a per-task worktree path that is guaranteed to be a direct child of
 * `worktreeRoot`. `name` comes from the (untrusted) request body, so reject any
 * value that is empty, a path separator / traversal segment, or otherwise escapes
 * the root — a `/run` caller must not control where the worktree (and the agent's
 * edits + gate) land.
 */
export function resolveWorktreePath(worktreeRoot: string, name: string): string {
  if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name)) {
    throw new Error(`Invalid worktree name: ${JSON.stringify(name)}`)
  }
  const root = resolve(worktreeRoot)
  const target = resolve(root, name)
  if (dirname(target) !== root) {
    throw new Error(`Worktree path escapes root: ${JSON.stringify(name)}`)
  }
  return target
}

/**
 * The `/run` handler. Constructs the task + a per-task worktree path and runs the
 * dev loop, keeping the worktree so a PR / publish can follow. The Electron
 * server is just: parse JSON body → `handleBridgeRun` → JSON response.
 */
export async function handleBridgeRun(
  deps: BridgeDeps,
  request: BridgeRunRequest
): Promise<AgentTaskResult> {
  return runAgentTask({
    git: deps.git,
    runner: deps.runner,
    agent: deps.agent,
    task: { id: request.taskId, prompt: request.prompt },
    worktreePath: resolveWorktreePath(deps.worktreeRoot, request.worktreeName ?? request.taskId),
    gate: deps.gate,
    keepWorktree: true
  })
}
