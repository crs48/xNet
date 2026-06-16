/**
 * @xnetjs/devkit — the validation gate (exploration 0190).
 *
 * The verification spine: run a sequence of checks (typecheck → lint → test →
 * fallow), short-circuiting on the first failure. The dev loop runs this before
 * it lets an agent's edits become a checkpoint or a PR — exactly the gate this
 * very repo runs on every change.
 */

import type { CommandRunner } from './command-runner'

export interface ValidationStep {
  name: string
  command: string
  args: string[]
}

export interface StepResult {
  name: string
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

export interface GateResult {
  ok: boolean
  steps: StepResult[]
  /** Name of the step that failed (if any). */
  failedStep?: string
}

/** Run the gate in order, stopping at the first failed step. */
export async function runValidationGate(
  runner: CommandRunner,
  cwd: string,
  steps: ValidationStep[]
): Promise<GateResult> {
  const results: StepResult[] = []
  for (const step of steps) {
    const r = await runner.run(step.command, step.args, { cwd })
    results.push({ name: step.name, ok: r.ok, code: r.code, stdout: r.stdout, stderr: r.stderr })
    if (!r.ok) return { ok: false, steps: results, failedStep: step.name }
  }
  return { ok: true, steps: results }
}

/**
 * The default xNet gate — the same checks this repo enforces in CI, expressed as
 * data so a host can tweak/scope them.
 */
export function defaultXnetGate(options: { changedSince?: string } = {}): ValidationStep[] {
  const since = options.changedSince ?? 'origin/main'
  return [
    { name: 'typecheck', command: 'pnpm', args: ['turbo', 'run', 'typecheck'] },
    { name: 'lint', command: 'pnpm', args: ['eslint', '.', '--max-warnings', '0'] },
    { name: 'test', command: 'pnpm', args: ['vitest', 'run'] },
    {
      name: 'fallow',
      command: 'pnpm',
      args: ['exec', 'fallow', 'audit', '--changed-since', since, '--fail-on-issues']
    }
  ]
}
