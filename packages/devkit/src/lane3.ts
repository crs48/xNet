/**
 * @xnetjs/devkit — the Lane 3 preconditions (exploration 0399, W3).
 *
 * Everything that has to be true, or has to be shown, before an agent is
 * allowed to edit xNet's own source from a point-and-change gesture:
 *
 *   1. {@link probeDevEnvironment} — is there a dev environment at all?
 *   2. {@link assertEditable} — is this file even in scope? (kernel refusal)
 *   3. {@link previewWorktree} — run the change somewhere ELSE, never in the
 *      process the user is driving.
 *   4. {@link reviewWorktree} — the diff and the gate result, before a PR.
 *
 * Step 3 is the one that matters most. A type error in a Lane 3 edit blanks
 * whatever surface rendered it; if that surface is the editing session, the user
 * has no way back from inside the app. The worktree gets its own dev server on
 * its own port, and the known-good checkout keeps serving the session.
 */

import type { CommandRunner, LineRunner } from './command-runner'
import { isKernel, workspaceOf, type Resolution } from './blast-radius'
import { runValidationGate, type GateResult, type ValidationStep } from './validation-gate'

// ─── 1. Is there a dev environment? ─────────────────────────────────────────

/** What Lane 3 needs on the host, and whether it is there. */
export interface DevEnvironment {
  /** A git work tree rooted at `cwd`. */
  checkout: boolean
  /** `pnpm` on PATH — the validation gate shells out to it. */
  pnpm: boolean
  /** `gh` on PATH and authenticated — required only to open the PR. */
  gh: boolean
  /** True when an agent task could run. `gh` is NOT required for this. */
  ready: boolean
  /** Human-readable reason when `ready` is false. */
  reason?: string
}

/**
 * Probe the host for a usable dev environment.
 *
 * Follows 0393's ladder shape: ask cheap questions in order and report what was
 * found, rather than assuming and failing later. `gh` is probed but excluded
 * from `ready` — a user can run tasks and keep checkpoints locally without ever
 * opening a pull request, and refusing the whole lane for a missing `gh` would
 * be a worse answer than offering it without the PR button.
 */
export async function probeDevEnvironment(
  runner: CommandRunner,
  cwd: string
): Promise<DevEnvironment> {
  const [checkoutResult, pnpmResult, ghResult] = await Promise.all([
    runner.run('git', ['rev-parse', '--is-inside-work-tree'], { cwd }),
    runner.run('pnpm', ['--version'], { cwd }),
    runner.run('gh', ['auth', 'status'], { cwd })
  ])

  const checkout = checkoutResult.ok && checkoutResult.stdout.trim() === 'true'
  const pnpm = pnpmResult.ok
  const gh = ghResult.ok

  if (!checkout) {
    return {
      checkout,
      pnpm,
      gh,
      ready: false,
      reason:
        'No git checkout here. Point-and-change can edit xNet’s source only from a source checkout, not from an installed build.'
    }
  }
  if (!pnpm) {
    return {
      checkout,
      pnpm,
      gh,
      ready: false,
      reason: 'pnpm was not found on PATH. The validation gate cannot run without it.'
    }
  }
  return { checkout, pnpm, gh, ready: true }
}

// ─── 2. Is this file in scope? ──────────────────────────────────────────────

/** Why a Lane 3 task was refused. */
export type Lane3RefusalCode = 'not-allowed' | 'kernel' | 'no-source' | 'wrong-lane'

/** The outcome of {@link assertEditable} — data, never a throw. */
export interface EditableVerdict {
  editable: boolean
  code?: Lane3RefusalCode
  /** The sentence to show. Present whenever `editable` is false. */
  reason?: string
}

/**
 * Gate a resolution before any agent runs.
 *
 * Re-checks the kernel rule here rather than trusting the browser's verdict:
 * `Resolution` arrives over a wire the renderer controls, and a check that only
 * happens on the side that can be bypassed is not a check. The lane and the
 * package are both re-derived from `source`.
 */
export function assertEditable(resolution: Resolution): EditableVerdict {
  if (resolution.lane !== 3) {
    return {
      editable: false,
      code: 'wrong-lane',
      reason: `This is a Lane ${resolution.lane} change; it does not go through the dev loop.`
    }
  }
  const workspace = workspaceOf(resolution.source)
  if (!workspace) {
    return {
      editable: false,
      code: 'no-source',
      reason: 'No source location to edit — the element carried no usable source ref.'
    }
  }
  if (isKernel(workspace)) {
    return {
      editable: false,
      code: 'kernel',
      reason: `Refusing to edit kernel code in ${workspace.path}: a change here can pass every check and still break sync, identity, or stored data.`
    }
  }
  if (!resolution.allowed) {
    return {
      editable: false,
      code: 'not-allowed',
      reason: resolution.explain
    }
  }
  return { editable: true }
}

// ─── 3. Preview it somewhere else ───────────────────────────────────────────

export interface PreviewWorktreeOptions {
  /**
   * Port for the worktree's dev server. MUST differ from the port the editing
   * session is served on — that separation is the whole point.
   */
  port: number
  /** Package to run `dev` in. Defaults to the web app. */
  filter?: string
  /** Give up if the server prints nothing for this long. Default 120s. */
  idleTimeoutMs?: number
}

export interface WorktreePreview {
  url: string
  /** Lines the dev server printed before it became ready (for diagnostics). */
  output: string[]
}

/** Matches Vite's readiness line, e.g. `Local:   http://localhost:5219/`. */
const READY_LINE = /https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)\/?/

/**
 * Start a dev server rooted in `worktreePath` and resolve once it is serving.
 *
 * Deliberately takes the port from the caller and refuses to reuse the session's
 * port: hot-patching the running app is the failure mode this exploration exists
 * to prevent, and "the preview happened to bind the same port" is how that
 * happens by accident.
 *
 * Resolves only on the readiness line. A server that exits, or never prints one,
 * REJECTS — a preview URL that was never confirmed is worse than no preview,
 * because the user reads a blank page as "my change broke it".
 */
export async function previewWorktree(
  lineRunner: LineRunner,
  worktreePath: string,
  sessionPort: number,
  options: PreviewWorktreeOptions
): Promise<WorktreePreview> {
  if (options.port === sessionPort) {
    throw new Error(
      `Refusing to preview a worktree on the session's own port (${sessionPort}). A broken edit would take down the surface you are editing from.`
    )
  }

  const args = [
    '--filter',
    options.filter ?? 'xnet-web',
    'dev',
    '--port',
    String(options.port),
    '--strictPort'
  ]
  const output: string[] = []

  for await (const line of lineRunner.stream('pnpm', args, {
    cwd: worktreePath,
    idleTimeoutMs: options.idleTimeoutMs ?? 120_000
  })) {
    output.push(line)
    const match = READY_LINE.exec(line)
    if (match && Number(match[1]) === options.port) {
      return { url: `http://localhost:${options.port}`, output }
    }
  }

  throw new Error(
    `The worktree's dev server never reported a URL on port ${options.port}. Last output:\n${output.slice(-10).join('\n')}`
  )
}

// ─── 4. Show the diff and the gate before offering a PR ─────────────────────

export interface WorktreeReview {
  /** Unified diff of the agent's work against the base. Empty when nothing changed. */
  diff: string
  /** Files touched, for a summary line. */
  files: string[]
  gate: GateResult
  /**
   * True only when there is a change AND the gate passed. The PR button is
   * gated on this, so an empty or failing task cannot produce one.
   */
  prReady: boolean
}

/**
 * Collect everything a human needs before deciding to open a PR.
 *
 * The gate result alone is not enough: it proves "not broken", never "not
 * wrong", so the diff is not optional context — it is the review.
 */
export async function reviewWorktree(
  runner: CommandRunner,
  worktreePath: string,
  base: string,
  steps: ValidationStep[]
): Promise<WorktreeReview> {
  const [diffResult, nameResult] = await Promise.all([
    runner.run('git', ['diff', `${base}...HEAD`], { cwd: worktreePath }),
    runner.run('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: worktreePath })
  ])
  const diff = diffResult.ok ? diffResult.stdout : ''
  const files = nameResult.ok
    ? nameResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : []

  const gate = await runValidationGate(runner, worktreePath, steps)
  return { diff, files, gate, prReady: gate.ok && files.length > 0 }
}
