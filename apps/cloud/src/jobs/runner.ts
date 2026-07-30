/**
 * xNet Cloud — the driver that ticks leased jobs (0411 G2).
 *
 * The important change from a bare `setInterval` is not the timer, it is what
 * the timer *decides*. Here the interval is only a **tick frequency**: every
 * tick asks {@link runIfDue} whether the job is due according to its stored
 * completion time. So:
 *
 *  - a deploy no longer skips a run — the first tick of the fresh process sees
 *    the job is overdue and runs it (`runOnStart`);
 *  - a second replica sees the lease and skips;
 *  - a job that stops running becomes *visible* via {@link JobRegistry.health}
 *    instead of failing silently.
 */

import type { DocStore } from '../stores/durable'
import {
  jobHealth,
  runIfDue,
  type JobHealth,
  type JobRecord,
  type LeasedJobOptions
} from './leased'

export interface JobSpec {
  jobId: string
  /** Minimum gap between successful runs. */
  intervalMs: number
  /** How often to *check* whether the job is due. Defaults to `intervalMs`. */
  tickMs?: number
  /** Lease duration — set above the job's worst-case runtime. Defaults to `tickMs`. */
  leaseMs?: number
  work: () => Promise<void>
}

/** Everything a registry needs that is not a job. Injected for deterministic tests. */
export interface JobRunnerDeps {
  store: DocStore<JobRecord>
  /** This instance's id, so leases identify a holder. */
  holder: string
  nowMs?: () => number
  /** Where a job failure is reported. Defaults to `console.error`. */
  onError?: (jobId: string, error: unknown) => void
}

/**
 * Registers periodic jobs, ticks them, and reports their health.
 *
 * `start()` returns a stop function; the timers `unref()` so they never keep the
 * process alive, exactly as the loops they replace did.
 */
export class JobRegistry {
  private readonly specs: JobSpec[] = []
  private readonly timers: ReturnType<typeof setInterval>[] = []

  constructor(private readonly deps: JobRunnerDeps) {}

  private get now(): () => number {
    return this.deps.nowMs ?? Date.now
  }

  add(spec: JobSpec): this {
    this.specs.push(spec)
    return this
  }

  private optionsFor(spec: JobSpec): LeasedJobOptions {
    const tickMs = spec.tickMs ?? spec.intervalMs
    return {
      jobId: spec.jobId,
      intervalMs: spec.intervalMs,
      leaseMs: spec.leaseMs ?? tickMs,
      holder: this.deps.holder,
      nowMs: this.now
    }
  }

  /**
   * Run one job if it is due. Exposed so tests (and a future manual "run now"
   * endpoint) can drive a tick without waiting on a timer.
   */
  async tick(jobId: string): Promise<void> {
    const spec = this.specs.find((s) => s.jobId === jobId)
    if (!spec) throw new Error(`No such job: ${jobId}`)
    try {
      await runIfDue(this.deps.store, this.optionsFor(spec), spec.work)
    } catch (error) {
      // A job failure must not kill the tick loop, but it must be reported —
      // `runIfDue` has already recorded the run as failed, so it stays due.
      const report =
        this.deps.onError ??
        ((id: string, err: unknown) => {
          // eslint-disable-next-line no-console
          console.error(`[jobs] ${id} FAILED:`, err)
        })
      report(spec.jobId, error)
    }
  }

  /** Tick every registered job once (a fresh process's catch-up pass). */
  async tickAll(): Promise<void> {
    for (const spec of this.specs) await this.tick(spec.jobId)
  }

  /**
   * Start the tick timers. `runOnStart` fires an immediate catch-up pass, which
   * is the actual fix for a deploy landing between scheduled runs.
   */
  start(opts: { runOnStart?: boolean } = {}): () => void {
    if (opts.runOnStart !== false) void this.tickAll()
    for (const spec of this.specs) {
      const timer = setInterval(() => void this.tick(spec.jobId), spec.tickMs ?? spec.intervalMs)
      timer.unref()
      this.timers.push(timer)
    }
    return () => this.stop()
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t)
    this.timers.length = 0
  }

  /**
   * Current health of every registered job — the observability surface behind
   * `/internal/fleet/jobs`. A job that has silently stopped running shows up
   * here as `stale`, with no failure required.
   */
  async health(): Promise<JobHealth[]> {
    const now = this.now()
    return Promise.all(
      this.specs.map(async (spec) => jobHealth(await this.deps.store.get(spec.jobId), spec, now))
    )
  }
}

/** True when any registered job is overdue — the alert condition. */
export function anyStale(health: JobHealth[]): boolean {
  return health.some((h) => h.stale)
}
