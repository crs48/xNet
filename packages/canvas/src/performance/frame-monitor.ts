/**
 * Frame Monitor
 *
 * Utility for measuring frame times and detecting dropped frames.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Frame statistics
 */
export interface FrameStats {
  /** Total number of frames measured */
  frameCount: number
  /** Average frame time in milliseconds */
  averageFrameTime: number
  /** Maximum frame time in milliseconds */
  maxFrameTime: number
  /** Minimum frame time in milliseconds */
  minFrameTime: number
  /** Number of frames exceeding 16.67ms (dropped frames) */
  droppedFrames: number
  /** Percentage of frames that were dropped */
  droppedFramePercent: number
  /** Frames per second (based on average frame time) */
  fps: number
}

// ─── Frame Monitor ─────────────────────────────────────────────────────────────

/**
 * Frame monitor for measuring render performance.
 */
export class FrameMonitor {
  private frameTimes: number[] = []
  private lastFrameTime = 0
  private isRunning = false
  private animationId = 0

  /**
   * Start measuring frame times.
   */
  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.frameTimes = []
    this.lastFrameTime = performance.now()
    this.tick()
  }

  /**
   * Stop measuring and return statistics.
   */
  stop(): FrameStats {
    this.isRunning = false
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationId)
    }
    return this.getStats()
  }

  /**
   * Reset measurements without stopping.
   */
  reset(): void {
    this.frameTimes = []
    this.lastFrameTime = performance.now()
  }

  /**
   * Get current statistics.
   */
  getStats(): FrameStats {
    if (this.frameTimes.length === 0) {
      return {
        frameCount: 0,
        averageFrameTime: 0,
        maxFrameTime: 0,
        minFrameTime: 0,
        droppedFrames: 0,
        droppedFramePercent: 0,
        fps: 0
      }
    }

    const sum = this.frameTimes.reduce((a, b) => a + b, 0)
    const avg = sum / this.frameTimes.length
    const dropped = this.frameTimes.filter((t) => t > 16.67).length

    return {
      frameCount: this.frameTimes.length,
      averageFrameTime: avg,
      maxFrameTime: Math.max(...this.frameTimes),
      minFrameTime: Math.min(...this.frameTimes),
      droppedFrames: dropped,
      droppedFramePercent: (dropped / this.frameTimes.length) * 100,
      fps: 1000 / avg
    }
  }

  /**
   * Animation frame tick.
   */
  private tick(): void {
    if (!this.isRunning) return

    const now = performance.now()
    const frameTime = now - this.lastFrameTime
    this.frameTimes.push(frameTime)
    this.lastFrameTime = now

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationId = requestAnimationFrame(() => this.tick())
    }
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a frame monitor.
 */
export function createFrameMonitor(): FrameMonitor {
  return new FrameMonitor()
}
