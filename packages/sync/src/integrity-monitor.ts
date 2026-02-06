/**
 * Periodic Integrity Monitor
 *
 * A background service that periodically checks data integrity and
 * emits events when issues are detected.
 *
 * @example
 * ```typescript
 * const monitor = createIntegrityMonitor({
 *   getChanges: () => storage.getAllChanges(),
 *   intervalMs: 60000, // Check every minute
 *   onIssues: (report) => {
 *     console.warn('Integrity issues:', report.issues)
 *   }
 * })
 *
 * monitor.start()
 * // ... later
 * monitor.stop()
 * ```
 */

import type { Change } from './change'
import type { IntegrityReport, VerifyOptions } from './integrity'
import { verifyIntegrity, quickIntegrityCheck, formatIntegrityReport } from './integrity'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration for the integrity monitor.
 */
export interface IntegrityMonitorConfig {
  /** Function to retrieve all changes for verification */
  getChanges: () => Promise<Change<unknown>[]> | Change<unknown>[]

  /** Interval between checks in milliseconds (default: 5 minutes) */
  intervalMs?: number

  /** Use quick check (skip signatures) for periodic checks */
  quickCheck?: boolean

  /** Additional verification options */
  verifyOptions?: VerifyOptions

  /** Called when issues are detected */
  onIssues?: (report: IntegrityReport) => void

  /** Called after each check (including clean ones) */
  onCheck?: (report: IntegrityReport) => void

  /** Called when an error occurs during check */
  onError?: (error: Error) => void

  /** Whether to run a check immediately on start */
  checkOnStart?: boolean

  /** Minimum number of changes before running checks */
  minChangesForCheck?: number

  /** Enable debug logging */
  debug?: boolean
}

/**
 * Statistics from the integrity monitor.
 */
export interface IntegrityMonitorStats {
  /** Number of checks performed */
  checksPerformed: number
  /** Number of issues found across all checks */
  totalIssuesFound: number
  /** Time of last check */
  lastCheckAt: Date | null
  /** Duration of last check in ms */
  lastCheckDurationMs: number
  /** Result of last check */
  lastReport: IntegrityReport | null
  /** Whether the monitor is currently running */
  isRunning: boolean
  /** Whether a check is currently in progress */
  isChecking: boolean
}

/**
 * The integrity monitor instance.
 */
export interface IntegrityMonitor {
  /** Start periodic monitoring */
  start(): void
  /** Stop periodic monitoring */
  stop(): void
  /** Run a check immediately (independent of the periodic schedule) */
  checkNow(): Promise<IntegrityReport>
  /** Get current statistics */
  getStats(): IntegrityMonitorStats
  /** Check if the monitor is running */
  isRunning(): boolean
  /** Update configuration */
  configure(config: Partial<IntegrityMonitorConfig>): void
}

// ─── Default Configuration ────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_MIN_CHANGES = 10

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Create an integrity monitor instance.
 */
export function createIntegrityMonitor(config: IntegrityMonitorConfig): IntegrityMonitor {
  let currentConfig = { ...config }
  let intervalId: ReturnType<typeof setInterval> | null = null
  let isRunning = false
  let isChecking = false

  const stats: IntegrityMonitorStats = {
    checksPerformed: 0,
    totalIssuesFound: 0,
    lastCheckAt: null,
    lastCheckDurationMs: 0,
    lastReport: null,
    isRunning: false,
    isChecking: false
  }

  const log = (message: string) => {
    if (currentConfig.debug) {
      console.log(`[IntegrityMonitor] ${message}`)
    }
  }

  const runCheck = async (): Promise<IntegrityReport> => {
    if (isChecking) {
      log('Check already in progress, skipping')
      return stats.lastReport ?? createEmptyReport()
    }

    isChecking = true
    stats.isChecking = true

    try {
      log('Starting integrity check')
      const startTime = Date.now()

      // Get changes
      const changes = await Promise.resolve(currentConfig.getChanges())

      // Skip if too few changes
      const minChanges = currentConfig.minChangesForCheck ?? DEFAULT_MIN_CHANGES
      if (changes.length < minChanges) {
        log(`Skipping check: only ${changes.length} changes (min: ${minChanges})`)
        return createEmptyReport()
      }

      // Run verification
      const report = currentConfig.quickCheck
        ? await quickIntegrityCheck(changes)
        : await verifyIntegrity(changes, currentConfig.verifyOptions)

      // Update stats
      stats.checksPerformed++
      stats.lastCheckAt = new Date()
      stats.lastCheckDurationMs = Date.now() - startTime
      stats.lastReport = report
      stats.totalIssuesFound += report.issues.length

      log(`Check complete: ${report.valid}/${report.checked} valid, ${report.issues.length} issues`)

      // Emit callbacks
      currentConfig.onCheck?.(report)

      if (report.issues.length > 0) {
        currentConfig.onIssues?.(report)
      }

      return report
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      log(`Check failed: ${err.message}`)
      currentConfig.onError?.(err)
      throw err
    } finally {
      isChecking = false
      stats.isChecking = false
    }
  }

  const start = () => {
    if (isRunning) {
      log('Already running')
      return
    }

    const intervalMs = currentConfig.intervalMs ?? DEFAULT_INTERVAL_MS
    log(`Starting with interval ${intervalMs}ms`)

    isRunning = true
    stats.isRunning = true

    // Run initial check if configured
    if (currentConfig.checkOnStart) {
      runCheck().catch(() => {
        // Error already handled in runCheck
      })
    }

    // Start periodic checks
    intervalId = setInterval(() => {
      runCheck().catch(() => {
        // Error already handled in runCheck
      })
    }, intervalMs)
  }

  const stop = () => {
    if (!isRunning) {
      log('Not running')
      return
    }

    log('Stopping')

    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }

    isRunning = false
    stats.isRunning = false
  }

  const checkNow = async (): Promise<IntegrityReport> => {
    return runCheck()
  }

  const getStats = (): IntegrityMonitorStats => {
    return { ...stats }
  }

  const configure = (newConfig: Partial<IntegrityMonitorConfig>) => {
    const wasRunning = isRunning

    if (wasRunning) {
      stop()
    }

    currentConfig = { ...currentConfig, ...newConfig }

    if (wasRunning) {
      start()
    }
  }

  return {
    start,
    stop,
    checkNow,
    getStats,
    isRunning: () => isRunning,
    configure
  }
}

/**
 * Create an empty integrity report.
 */
function createEmptyReport(): IntegrityReport {
  return {
    checked: 0,
    valid: 0,
    issues: [],
    repairable: true,
    summary: {
      errors: 0,
      warnings: 0,
      byType: {
        'hash-mismatch': 0,
        'signature-invalid': 0,
        'chain-broken': 0,
        'missing-parent': 0,
        'duplicate-id': 0,
        'invalid-lamport': 0,
        'future-timestamp': 0
      }
    },
    durationMs: 0
  }
}

// ─── React Integration Helper ─────────────────────────────────────────────────

/**
 * Options for creating a React-friendly integrity monitor.
 */
export interface ReactIntegrityMonitorOptions extends IntegrityMonitorConfig {
  /** Emit state changes for React to observe */
  onStateChange?: (stats: IntegrityMonitorStats) => void
}

/**
 * Create an integrity monitor with React-friendly state updates.
 * This wraps the monitor to emit state changes that can be observed
 * by React hooks.
 */
export function createReactIntegrityMonitor(
  options: ReactIntegrityMonitorOptions
): IntegrityMonitor {
  const { onStateChange, ...config } = options

  const monitor = createIntegrityMonitor({
    ...config,
    onCheck: (report) => {
      config.onCheck?.(report)
      onStateChange?.(monitor.getStats())
    },
    onError: (error) => {
      config.onError?.(error)
      onStateChange?.(monitor.getStats())
    }
  })

  // Wrap start/stop to emit state changes
  const originalStart = monitor.start.bind(monitor)
  const originalStop = monitor.stop.bind(monitor)

  monitor.start = () => {
    originalStart()
    onStateChange?.(monitor.getStats())
  }

  monitor.stop = () => {
    originalStop()
    onStateChange?.(monitor.getStats())
  }

  return monitor
}

// ─── Convenience Exports ──────────────────────────────────────────────────────

export { formatIntegrityReport }
