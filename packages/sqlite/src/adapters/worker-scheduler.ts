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
  /** Truncated, param-free op description (e.g. the SQL) for boot diagnostics. */
  detail?: string
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
  /**
   * Truncated, param-free op description (e.g. the SQL text). Without it the
   * boot log shows only the generic label ('query'), so a slow op can't be told
   * apart from any other read — the missing field that kept the cold-open stall
   * unidentified across explorations 0227–0233/0249.
   */
  detail?: string
  /** Time the op waited behind other ops before starting (head-of-line). */
  queueMs: number
  /** Time the op spent executing (SQL + OPFS I/O), excluding queue wait. */
  execMs: number
  /**
   * Monotonic clock value (same base as `performance.now()` in the worker) when
   * the op was enqueued via {@link WorkerScheduler.schedule}. Lets a consumer
   * relate the FIRST op back to when `open()` finished — the gap that is invisible
   * to `queueMs`/`execMs` because both start only once an op exists, which kept the
   * 7th cold-open migration (the stall that moved off `execMs` entirely) unpinned
   * (exploration 0253).
   */
  enqueuedAt: number
  /** Monotonic clock value when the op actually began executing (dequeued). */
  startedAt: number
}

/**
 * The extra fields the worker host stamps on the FIRST op after `open()` to
 * localize a cold-open stall that has left `execMs`/`queueMs` (exploration 0253).
 * Both gaps are measured against when `open()` finished, which `queueMs`/`execMs`
 * structurally cannot see — they only span an op that already exists.
 */
export interface FirstOpGapFields {
  firstOpAfterOpen: true
  /** open done → first op ENQUEUED. The upstream/transport wait (≈0 ⇒ the wait was the open itself). */
  idleBeforeFirstOpMs: number
  /** open done → first op EXECUTED (idle + any in-worker queue/exec of earlier non-reported work). */
  sinceOpenMs: number
}

/**
 * Compute {@link FirstOpGapFields} for the first scheduled op. Pure so it is
 * unit-testable without a Worker/WASM — the worker host (`web-worker.ts`) self-
 * exposes Comlink at import, so the testable logic lives here instead.
 */
export function firstOpGapFields(
  report: Pick<SchedulerOpReport, 'enqueuedAt' | 'startedAt'>,
  openedAtMs: number
): FirstOpGapFields {
  return {
    firstOpAfterOpen: true,
    idleBeforeFirstOpMs: Math.round(report.enqueuedAt - openedAtMs),
    sinceOpenMs: Math.round(report.startedAt - openedAtMs)
  }
}

/** Aggregated per-lane op latency (exploration 0263). All ms values rounded. */
export interface SchedulerLaneOpStats {
  /** Ops executed on this lane since open/reset. */
  ops: number
  queueP50Ms: number
  queueP95Ms: number
  execP50Ms: number
  execP95Ms: number
  /** Worst single execution — the head-of-line-blocking amplitude. */
  maxExecMs: number
}

/**
 * Cumulative scheduler statistics: how many ops ran, how many duplicate reads
 * were served without executing (coalesced), and per-lane latency percentiles.
 * This is the "p50/p95 per-query worker time" measurement of exploration 0263 —
 * the number that says whether the statement cache / batch RPC actually moved
 * anything, without wading through per-op boot-log lines.
 */
export interface SchedulerOpStats {
  ops: number
  coalescedHits: number
  lanes: Record<SchedulerLane, SchedulerLaneOpStats>
}

/**
 * Nearest-rank percentile over an UNSORTED sample array (sorts a copy).
 * Returns 0 for an empty sample.
 */
export function percentileMs(samples: readonly number[], p: number): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[rank])
}

/**
 * Per-lane sample cap. Percentiles are computed over the most recent samples
 * (ring buffer) so a long-lived worker reflects current behaviour, not boot.
 */
const SCHEDULER_STATS_SAMPLE_CAP = 512

/** Ring-buffered queue/exec samples plus counters for one lane. */
class LaneStatsAccumulator {
  ops = 0
  maxExecMs = 0
  private readonly queueSamples: number[] = []
  private readonly execSamples: number[] = []
  private cursor = 0

  record(queueMs: number, execMs: number): void {
    this.ops += 1
    if (execMs > this.maxExecMs) this.maxExecMs = execMs
    if (this.queueSamples.length < SCHEDULER_STATS_SAMPLE_CAP) {
      this.queueSamples.push(queueMs)
      this.execSamples.push(execMs)
    } else {
      this.queueSamples[this.cursor] = queueMs
      this.execSamples[this.cursor] = execMs
      this.cursor = (this.cursor + 1) % SCHEDULER_STATS_SAMPLE_CAP
    }
  }

  stats(): SchedulerLaneOpStats {
    return {
      ops: this.ops,
      queueP50Ms: percentileMs(this.queueSamples, 50),
      queueP95Ms: percentileMs(this.queueSamples, 95),
      execP50Ms: percentileMs(this.execSamples, 50),
      execP95Ms: percentileMs(this.execSamples, 95),
      maxExecMs: Math.round(this.maxExecMs)
    }
  }

  reset(): void {
    this.ops = 0
    this.maxExecMs = 0
    this.queueSamples.length = 0
    this.execSamples.length = 0
    this.cursor = 0
  }
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
  /** Aggregated op timing per lane (exploration 0263). */
  private readonly laneStats: Record<SchedulerLane, LaneStatsAccumulator> = {
    interactive: new LaneStatsAccumulator(),
    bulk: new LaneStatsAccumulator(),
    write: new LaneStatsAccumulator()
  }
  private coalescedHits = 0

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
    label?: string,
    detail?: string
  ): Promise<T> {
    if (coalesceKey !== undefined) {
      const inflight = this.coalesced.get(coalesceKey)
      if (inflight) {
        this.coalescedHits += 1
        return inflight as Promise<T>
      }
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.queues[lane].push({
        run: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        lane,
        label,
        detail,
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

  /** Cumulative op counts, coalesce hits, and per-lane latency percentiles. */
  opStats(): SchedulerOpStats {
    const lanes = {
      interactive: this.laneStats.interactive.stats(),
      bulk: this.laneStats.bulk.stats(),
      write: this.laneStats.write.stats()
    }
    return {
      ops: lanes.interactive.ops + lanes.bulk.ops + lanes.write.ops,
      coalescedHits: this.coalescedHits,
      lanes
    }
  }

  /** Zero the op-stats counters for a focused before/after measurement. */
  resetOpStats(): void {
    this.coalescedHits = 0
    for (const lane of LANE_ORDER) {
      this.laneStats[lane].reset()
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
          const endedAt = nowMs()
          const queueMs = startedAt - job.enqueuedAt
          const execMs = endedAt - startedAt
          // Aggregation is always on (cheap ring-buffer write); the per-op
          // reporter stays gated behind boot debug in the worker host.
          this.laneStats[job.lane].record(queueMs, execMs)
          if (this.onOp) {
            this.onOp({
              lane: job.lane,
              label: job.label,
              detail: job.detail,
              queueMs,
              execMs,
              enqueuedAt: job.enqueuedAt,
              startedAt
            })
          }
        }
      }
    } finally {
      this.running = false
    }
  }
}
