/**
 * @xnetjs/hub - Disk-usage watchdog (exploration 0291).
 *
 * Periodically measures the hub's on-disk footprint and flips a boolean when it
 * crosses a fraction of the volume limit. The node relay consults `isFull()` and
 * sheds writes (`STORAGE_FULL`) before the volume actually fills — a full SQLite
 * volume otherwise crashes the process on the next write/checkpoint, which is how
 * the demo hub went hard-down (see exploration 0290's 502).
 *
 * Sampling is cheap and coarse (a bounded `stat` walk), so it runs on an
 * interval rather than per-write.
 */

import { measureDataUsage, type DataUsageFs } from '../data-usage'

export type DiskWatchdogOptions = {
  /** Directory to measure (the hub data dir). */
  dataDir: string
  /** Volume capacity in bytes to measure usage against. */
  maxBytes: number
  /** Fraction of `maxBytes` at which writes start being shed (default 0.9). */
  threshold?: number
  /** How often to re-measure, ms (default 30s). */
  checkIntervalMs?: number
  /** Injectable fs for tests. */
  fs?: DataUsageFs
}

export class DiskWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null
  private full = false
  private readonly limitBytes: number
  private readonly checkIntervalMs: number

  constructor(private options: DiskWatchdogOptions) {
    const threshold = options.threshold ?? 0.9
    this.limitBytes = Math.max(0, options.maxBytes * threshold)
    this.checkIntervalMs = options.checkIntervalMs ?? 30_000
  }

  /** Measure once and update the flag. Exposed for tests. */
  sample(): boolean {
    const { usedBytes } = measureDataUsage(this.options.dataDir, this.options.fs)
    const wasFull = this.full
    this.full = usedBytes >= this.limitBytes
    if (this.full && !wasFull) {
      console.warn(`[disk-watchdog] usage ${usedBytes}B ≥ ${this.limitBytes}B — shedding writes`)
    } else if (!this.full && wasFull) {
      console.log(`[disk-watchdog] usage ${usedBytes}B back under limit — accepting writes`)
    }
    return this.full
  }

  /** Whether the hub should currently shed writes. */
  isFull(): boolean {
    return this.full
  }

  start(): void {
    this.stop()
    this.sample()
    this.timer = setInterval(() => {
      try {
        this.sample()
      } catch (err) {
        console.error('[disk-watchdog] sample failed:', err)
      }
    }, this.checkIntervalMs)
    // Don't keep the process alive just for the watchdog.
    this.timer.unref?.()
    console.log(
      `[disk-watchdog] started (limit=${this.limitBytes}B of ${this.options.maxBytes}B, every ${this.checkIntervalMs}ms)`
    )
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
