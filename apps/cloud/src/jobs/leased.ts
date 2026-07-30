/**
 * xNet Cloud — restart-safe, replica-safe periodic work (0411 G2).
 *
 * `setInterval` schedules off **process uptime**. A Cloud Run revision deployed
 * at 02:59 therefore skips the 03:00 restore drill entirely, and because the
 * drill only logs on failure, a skipped run is indistinguishable from a passed
 * one. That is the failure mode AGENTS.md names directly: "a truncated run is
 * not a completed one".
 *
 * A leased job instead schedules off **stored completion time**:
 *
 *  - **Due-based** — `now - lastCompletedMs >= intervalMs`, so a restart resumes
 *    the schedule rather than restarting the clock.
 *  - **Leased** — a holder takes a short lease, so a second replica skips
 *    instead of double-running.
 *  - **Loud** — {@link stalenessMs} exposes the age of the last *successful*
 *    run, so "hasn't run in two days" is an alertable number rather than
 *    silence.
 *
 * Only a successful run advances the schedule; a failed run stays due and is
 * retried on the next tick.
 *
 * This is not a workflow engine (ADR-28). There is no mid-run checkpointing: a
 * process that dies inside `work()` loses that attempt and retries the whole
 * thing once the lease expires, so the work must be idempotent.
 */

import type { DocStore } from '../stores/durable'

/** Persisted schedule state for one job. */
export interface JobRecord {
  jobId: string
  /**
   * When the job last completed **successfully**, or `null` if it never has.
   * Deliberately nullable rather than `0`-as-sentinel: "never ran" and "ran at
   * epoch" must not be the same value (AGENTS.md — absent ≠ unreadable).
   */
  lastCompletedMs: number | null
  lastOutcome: 'ok' | 'failed' | 'never'
  /** Lease expiry; a different holder must not run until this passes. */
  leaseUntilMs: number
  /** Who holds the lease (instance id) — lets the holder re-enter its own lease. */
  holder: string
}

export interface LeasedJobOptions {
  jobId: string
  /** Minimum gap between successful runs. */
  intervalMs: number
  /** How long the lease is held — set above the job's worst-case runtime. */
  leaseMs: number
  /** This instance's id (e.g. Cloud Run revision + pid). */
  holder: string
  nowMs?: () => number
}

export type RunOutcome =
  /** The job ran (successfully or not — a throw propagates). */
  | 'ran'
  /** Another holder's lease is live. */
  | 'leased-elsewhere'
  /** Not enough time has passed since the last success. */
  | 'not-due'

/**
 * Whether `opts.holder` may claim this job now. Pure, so the scheduling policy
 * is unit-testable without a clock or a store.
 *
 * A live lease held by *someone else* blocks; the holder's own lease does not,
 * so a crashed-and-restarted instance with the same id can re-enter.
 */
export function claimable(rec: JobRecord | null, opts: LeasedJobOptions, nowMs: number): boolean {
  if (!rec) return true
  if (rec.leaseUntilMs > nowMs && rec.holder !== opts.holder) return false
  if (rec.lastCompletedMs === null) return true // never succeeded → always due
  return nowMs - rec.lastCompletedMs >= opts.intervalMs
}

/**
 * Age of the last **successful** run. `Infinity` when the job has never
 * completed, so a job that has never run is maximally stale rather than
 * silently fine — a never-run restore drill is the exact thing G2 is about.
 */
export function stalenessMs(rec: JobRecord | null, nowMs: number): number {
  if (!rec || rec.lastCompletedMs === null) return Number.POSITIVE_INFINITY
  return nowMs - rec.lastCompletedMs
}

/**
 * Is this job overdue enough to page someone? Defaults to 2× the interval —
 * one missed cycle is noise, two is a broken schedule.
 */
export function isStale(
  rec: JobRecord | null,
  opts: Pick<LeasedJobOptions, 'intervalMs'>,
  nowMs: number,
  multiplier = 2
): boolean {
  return stalenessMs(rec, nowMs) > opts.intervalMs * multiplier
}

/**
 * Run `work` if the job is due and unleased. Returns what happened.
 *
 * A throw from `work` propagates to the caller *after* the record is updated to
 * `failed`, so the job stays due and the failure is never swallowed.
 */
export async function runIfDue(
  store: DocStore<JobRecord>,
  opts: LeasedJobOptions,
  work: () => Promise<void>
): Promise<RunOutcome> {
  const clock = opts.nowMs ?? Date.now
  const started = clock()
  const rec = await store.get(opts.jobId)

  if (!claimable(rec, opts, started)) {
    return rec && rec.leaseUntilMs > started && rec.holder !== opts.holder
      ? 'leased-elsewhere'
      : 'not-due'
  }

  const lastCompletedMs = rec?.lastCompletedMs ?? null
  await store.put(opts.jobId, {
    jobId: opts.jobId,
    lastCompletedMs,
    lastOutcome: rec?.lastOutcome ?? 'never',
    leaseUntilMs: started + opts.leaseMs,
    holder: opts.holder
  })

  try {
    await work()
    await store.put(opts.jobId, {
      jobId: opts.jobId,
      lastCompletedMs: clock(),
      lastOutcome: 'ok',
      leaseUntilMs: 0,
      holder: opts.holder
    })
    return 'ran'
  } catch (error) {
    // Keep the OLD completion time: a failed run must not advance the schedule,
    // or a permanently broken drill would look like it ran every night.
    await store.put(opts.jobId, {
      jobId: opts.jobId,
      lastCompletedMs,
      lastOutcome: 'failed',
      leaseUntilMs: 0,
      holder: opts.holder
    })
    throw error
  }
}

/** A job's health, for the observability surface. */
export interface JobHealth {
  jobId: string
  lastOutcome: JobRecord['lastOutcome']
  /** `null` when never completed (JSON has no Infinity). */
  stalenessMs: number | null
  stale: boolean
}

/** Summarize a job for `/internal/fleet/jobs` and alerting. */
export function jobHealth(
  rec: JobRecord | null,
  opts: Pick<LeasedJobOptions, 'jobId' | 'intervalMs'>,
  nowMs: number,
  multiplier = 2
): JobHealth {
  const age = stalenessMs(rec, nowMs)
  return {
    jobId: opts.jobId,
    lastOutcome: rec?.lastOutcome ?? 'never',
    stalenessMs: Number.isFinite(age) ? age : null,
    stale: isStale(rec, opts, nowMs, multiplier)
  }
}
