/**
 * Performance metrics for cryptographic operations.
 *
 * Tracks signing, verification, and cache performance to help
 * identify bottlenecks and optimize security level selection.
 */

import type { SecurityLevel } from '../security-level'

// ─── Types ────────────────────────────────────────────────────────

/**
 * Optional telemetry collector interface for crypto operations.
 * Compatible with @xnetjs/telemetry TelemetryCollector.
 */
export interface CryptoTelemetry {
  reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): void
  reportUsage(metricName: string, value: number): void
}

/**
 * Metrics for cryptographic operations.
 */
export interface CryptoMetrics {
  /** Total sign operations */
  signCount: number

  /** Total signing time in milliseconds */
  signTimeMs: number

  /** Total verify operations */
  verifyCount: number

  /** Total verification time in milliseconds */
  verifyTimeMs: number

  /** Cache hits during verification */
  cacheHits: number

  /** Cache misses during verification */
  cacheMisses: number

  /** Operations performed via workers */
  workerOperations: number

  /** Breakdown by security level */
  byLevel: Record<SecurityLevel, LevelMetrics>
}

/**
 * Metrics for a specific security level.
 */
export interface LevelMetrics {
  signCount: number
  signTimeMs: number
  verifyCount: number
  verifyTimeMs: number
}

/**
 * Computed averages from metrics.
 */
export interface MetricAverages {
  /** Average signing time in milliseconds */
  avgSignMs: number

  /** Average verification time in milliseconds */
  avgVerifyMs: number

  /** Cache hit rate (0-1) */
  cacheHitRate: number

  /** By-level averages */
  byLevel: Record<SecurityLevel, { avgSignMs: number; avgVerifyMs: number }>
}

// ─── Metrics Collector ────────────────────────────────────────────

/**
 * Collector for cryptographic performance metrics.
 *
 * Thread-safe accumulation of timing and count data.
 *
 * @example
 * ```typescript
 * // Record a signing operation
 * const start = performance.now()
 * const sig = hybridSign(message, keys, level)
 * cryptoMetrics.recordSign(level, performance.now() - start)
 *
 * // Get statistics
 * console.log(cryptoMetrics.getAverages())
 * ```
 */
export class CryptoMetricsCollector {
  private metrics: CryptoMetrics = this.createEmptyMetrics()
  private telemetry?: CryptoTelemetry

  private createEmptyMetrics(): CryptoMetrics {
    return {
      signCount: 0,
      signTimeMs: 0,
      verifyCount: 0,
      verifyTimeMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
      workerOperations: 0,
      byLevel: {
        0: { signCount: 0, signTimeMs: 0, verifyCount: 0, verifyTimeMs: 0 },
        1: { signCount: 0, signTimeMs: 0, verifyCount: 0, verifyTimeMs: 0 },
        2: { signCount: 0, signTimeMs: 0, verifyCount: 0, verifyTimeMs: 0 }
      }
    }
  }

  /**
   * Set telemetry collector for forwarding aggregated metrics.
   * When set, metrics will be reported to telemetry periodically.
   */
  setTelemetry(telemetry: CryptoTelemetry | undefined): void {
    this.telemetry = telemetry
  }

  /**
   * Record a signing operation.
   */
  recordSign(level: SecurityLevel, durationMs: number): void {
    this.metrics.signCount++
    this.metrics.signTimeMs += durationMs
    this.metrics.byLevel[level].signCount++
    this.metrics.byLevel[level].signTimeMs += durationMs

    // Report to telemetry if available
    this.telemetry?.reportPerformance(`crypto.sign.level${level}`, durationMs, 'crypto')
    this.telemetry?.reportUsage('crypto.sign', 1)
  }

  /**
   * Record a verification operation.
   */
  recordVerify(level: SecurityLevel, durationMs: number, cached: boolean): void {
    this.metrics.verifyCount++
    this.metrics.verifyTimeMs += durationMs
    this.metrics.byLevel[level].verifyCount++
    this.metrics.byLevel[level].verifyTimeMs += durationMs

    if (cached) {
      this.metrics.cacheHits++
      this.telemetry?.reportUsage('crypto.cache.hit', 1)
    } else {
      this.metrics.cacheMisses++
      this.telemetry?.reportUsage('crypto.cache.miss', 1)
    }

    // Report to telemetry if available
    this.telemetry?.reportPerformance(`crypto.verify.level${level}`, durationMs, 'crypto')
    this.telemetry?.reportUsage('crypto.verify', 1)
  }

  /**
   * Record a cache hit (without full verification).
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++
    this.telemetry?.reportUsage('crypto.cache.hit', 1)
  }

  /**
   * Record a cache miss.
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++
    this.telemetry?.reportUsage('crypto.cache.miss', 1)
  }

  /**
   * Record a worker operation.
   */
  recordWorkerOp(): void {
    this.metrics.workerOperations++
    this.telemetry?.reportUsage('crypto.worker.operation', 1)
  }

  /**
   * Get all metrics.
   */
  getMetrics(): CryptoMetrics {
    return {
      ...this.metrics,
      byLevel: {
        0: { ...this.metrics.byLevel[0] },
        1: { ...this.metrics.byLevel[1] },
        2: { ...this.metrics.byLevel[2] }
      }
    }
  }

  /**
   * Get computed averages.
   */
  getAverages(): MetricAverages {
    const { signCount, signTimeMs, verifyCount, verifyTimeMs, cacheHits, cacheMisses, byLevel } =
      this.metrics

    const cacheTotal = cacheHits + cacheMisses

    return {
      avgSignMs: signCount > 0 ? signTimeMs / signCount : 0,
      avgVerifyMs: verifyCount > 0 ? verifyTimeMs / verifyCount : 0,
      cacheHitRate: cacheTotal > 0 ? cacheHits / cacheTotal : 0,
      byLevel: {
        0: {
          avgSignMs: byLevel[0].signCount > 0 ? byLevel[0].signTimeMs / byLevel[0].signCount : 0,
          avgVerifyMs:
            byLevel[0].verifyCount > 0 ? byLevel[0].verifyTimeMs / byLevel[0].verifyCount : 0
        },
        1: {
          avgSignMs: byLevel[1].signCount > 0 ? byLevel[1].signTimeMs / byLevel[1].signCount : 0,
          avgVerifyMs:
            byLevel[1].verifyCount > 0 ? byLevel[1].verifyTimeMs / byLevel[1].verifyCount : 0
        },
        2: {
          avgSignMs: byLevel[2].signCount > 0 ? byLevel[2].signTimeMs / byLevel[2].signCount : 0,
          avgVerifyMs:
            byLevel[2].verifyCount > 0 ? byLevel[2].verifyTimeMs / byLevel[2].verifyCount : 0
        }
      }
    }
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics()
  }

  /**
   * Get a summary string for logging.
   */
  summary(): string {
    const avg = this.getAverages()
    const m = this.metrics

    return [
      `Crypto Metrics:`,
      `  Sign: ${m.signCount} ops, avg ${avg.avgSignMs.toFixed(2)}ms`,
      `  Verify: ${m.verifyCount} ops, avg ${avg.avgVerifyMs.toFixed(2)}ms`,
      `  Cache: ${m.cacheHits} hits, ${m.cacheMisses} misses (${(avg.cacheHitRate * 100).toFixed(1)}%)`,
      `  By Level:`,
      `    L0: ${m.byLevel[0].signCount} signs (${avg.byLevel[0].avgSignMs.toFixed(2)}ms), ${m.byLevel[0].verifyCount} verifies`,
      `    L1: ${m.byLevel[1].signCount} signs (${avg.byLevel[1].avgSignMs.toFixed(2)}ms), ${m.byLevel[1].verifyCount} verifies`,
      `    L2: ${m.byLevel[2].signCount} signs (${avg.byLevel[2].avgSignMs.toFixed(2)}ms), ${m.byLevel[2].verifyCount} verifies`
    ].join('\n')
  }
}

// ─── Global Instance ──────────────────────────────────────────────

/**
 * Global metrics collector instance.
 */
export const cryptoMetrics = new CryptoMetricsCollector()
