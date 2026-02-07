/**
 * Memory Profile
 *
 * Utilities for measuring memory usage.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Memory snapshot
 */
export interface MemorySnapshot {
  /** Maximum heap size in bytes */
  jsHeapSizeLimit: number
  /** Total allocated heap in bytes */
  totalJSHeapSize: number
  /** Currently used heap in bytes */
  usedJSHeapSize: number
}

// ─── Memory Utilities ──────────────────────────────────────────────────────────

/**
 * Get current memory usage.
 * Returns null if not supported (non-Chromium browsers).
 */
export function getMemoryUsage(): MemorySnapshot | null {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const mem = (performance as unknown as { memory: MemorySnapshot }).memory
    return {
      jsHeapSizeLimit: mem.jsHeapSizeLimit,
      totalJSHeapSize: mem.totalJSHeapSize,
      usedJSHeapSize: mem.usedJSHeapSize
    }
  }
  return null
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Profile memory usage of a function.
 */
export async function profileMemory(
  label: string,
  fn: () => void | Promise<void>
): Promise<{ delta: number; total: number } | null> {
  // Force GC if available (requires --expose-gc flag)
  if (typeof globalThis.gc === 'function') {
    globalThis.gc()
  }

  const before = getMemoryUsage()

  await fn()

  // Force GC again
  if (typeof globalThis.gc === 'function') {
    globalThis.gc()
  }

  const after = getMemoryUsage()

  if (before && after) {
    const delta = after.usedJSHeapSize - before.usedJSHeapSize
    console.log(
      `[Memory] ${label}: ${formatBytes(delta)} (${formatBytes(after.usedJSHeapSize)} total)`
    )
    return { delta, total: after.usedJSHeapSize }
  }

  return null
}

// ─── Memory Tracker ────────────────────────────────────────────────────────────

/**
 * Memory tracker for monitoring usage over time.
 */
export class MemoryTracker {
  private samples: MemorySnapshot[] = []
  private intervalId: ReturnType<typeof setInterval> | null = null

  /**
   * Start sampling memory at the given interval.
   */
  start(intervalMs: number = 1000): void {
    if (this.intervalId) return

    this.samples = []
    this.sample()

    this.intervalId = setInterval(() => this.sample(), intervalMs)
  }

  /**
   * Stop sampling and return statistics.
   */
  stop(): {
    samples: MemorySnapshot[]
    peakUsed: number
    averageUsed: number
    growth: number
  } {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    const usedValues = this.samples.map((s) => s.usedJSHeapSize)

    return {
      samples: [...this.samples],
      peakUsed: Math.max(...usedValues),
      averageUsed: usedValues.reduce((a, b) => a + b, 0) / usedValues.length,
      growth: usedValues.length > 1 ? usedValues[usedValues.length - 1] - usedValues[0] : 0
    }
  }

  /**
   * Take a memory sample.
   */
  private sample(): void {
    const mem = getMemoryUsage()
    if (mem) {
      this.samples.push(mem)
    }
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a memory tracker.
 */
export function createMemoryTracker(): MemoryTracker {
  return new MemoryTracker()
}
