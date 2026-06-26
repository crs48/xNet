/**
 * @xnetjs/sqlite - Priority scheduler for the single SQLite worker
 *
 * The web app funnels every storage operation — interactive reads, background
 * writes, sync-apply batches — through ONE SQLite worker thread (exploration
 * 0227). With no scheduling, the worker serves Comlink calls in arrival order,
 * so an interactive read can be stuck behind a burst of queued writes. 0227
 * fixed the one pathological 18s op; this scheduler generalises the fix so that
 * *no* queued operation can starve an interactive read (exploration 0228).
 *
 * It does NOT add parallelism — a single OPFS connection is inherently serial
 * (the `opfs-sahpool` VFS holds exclusive file handles, so multiple reader
 * workers on the same DB are impossible). What it adds is **ordering**: queued
 * work drains highest-priority-lane first, and identical concurrent reads are
 * coalesced into a single execution.
 *
 * Safety: jobs run strictly one-at-a-time (no preemption of an in-flight op),
 * which matches SQLite's single-connection serialization — operations on one
 * connection are never truly concurrent anyway. A job already executing always
 * completes before the next is dequeued.
 */

/** Priority lanes, drained in this order: interactive → bulk → write. */
export type SchedulerLane = 'interactive' | 'bulk' | 'write'

/** Drain order — earlier lanes are served to exhaustion before later ones. */
const LANE_ORDER: readonly SchedulerLane[] = ['interactive', 'bulk', 'write']

/** Monotonic clock, falling back to `Date.now` where `performance` is absent. */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

interface QueuedJob {
  run: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  lane: SchedulerLane
  label?: string
  enqueuedAt: number
}

/** Point-in-time view of scheduler depth (for diagnostics / the perf panel). */
export interface SchedulerSnapshot {
  interactive: number
  bulk: number
  write: number
  /** Whether a job is currently executing. */
  inFlight: boolean
}

/** Per-operation timing emitted to {@link WorkerScheduler}'s reporter. */
export interface SchedulerOpReport {
  lane: SchedulerLane
  label?: string
  /** Time the op waited behind other ops before starting (head-of-line). */
  queueMs: number
  /** Time the op spent executing (SQL + OPFS I/O), excluding queue wait. */
  execMs: number
}

export class WorkerScheduler {
  private readonly queues: Record<SchedulerLane, QueuedJob[]> = {
    interactive: [],
    bulk: [],
    write: []
  }
  /** In-flight + queued reads keyed by `coalesceKey`, to collapse duplicates. */
  private readonly coalesced = new Map<string, Promise<unknown>>()
  private running = false

  /**
   * @param onOp optional per-operation timing reporter (boot diagnostics, 0229).
   */
  constructor(private readonly onOp?: (report: SchedulerOpReport) => void) {}

  /**
   * Enqueue `fn` on `lane`. Returns a promise that settles with `fn`'s result.
   *
   * When `coalesceKey` is provided (reads only — they're idempotent), an
   * identical key that is already queued or in flight returns the SAME promise
   * instead of enqueuing a second execution. The key is dropped once that
   * execution settles, so a later identical read re-runs against fresh data.
   */
  schedule<T>(
    lane: SchedulerLane,
    fn: () => Promise<T>,
    coalesceKey?: string,
    label?: string
  ): Promise<T> {
    if (coalesceKey !== undefined) {
      const inflight = this.coalesced.get(coalesceKey)
      if (inflight) return inflight as Promise<T>
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.queues[lane].push({
        run: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        lane,
        label,
        enqueuedAt: nowMs()
      })
    })

    if (coalesceKey !== undefined) {
      this.coalesced.set(coalesceKey, promise as Promise<unknown>)
      const clear = (): void => {
        if (this.coalesced.get(coalesceKey) === promise) this.coalesced.delete(coalesceKey)
      }
      promise.then(clear, clear)
    }

    void this.pump()
    return promise
  }

  /** Current queue depths and in-flight flag. */
  snapshot(): SchedulerSnapshot {
    return {
      interactive: this.queues.interactive.length,
      bulk: this.queues.bulk.length,
      write: this.queues.write.length,
      inFlight: this.running
    }
  }

  /** Pull the next job, highest-priority non-empty lane first (FIFO within a lane). */
  private next(): QueuedJob | undefined {
    for (const lane of LANE_ORDER) {
      const job = this.queues[lane].shift()
      if (job) return job
    }
    return undefined
  }

  /** Drain the queues one job at a time. Re-entrant-safe via the `running` latch. */
  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      let job: QueuedJob | undefined
      while ((job = this.next())) {
        const startedAt = nowMs()
        try {
          job.resolve(await job.run())
        } catch (err) {
          job.reject(err)
        } finally {
          if (this.onOp) {
            const endedAt = nowMs()
            this.onOp({
              lane: job.lane,
              label: job.label,
              queueMs: startedAt - job.enqueuedAt,
              execMs: endedAt - startedAt
            })
          }
        }
      }
    } finally {
      this.running = false
    }
  }
}
