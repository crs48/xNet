/**
 * @xnetjs/hub - Bridge Prometheus metrics to telemetry system.
 *
 * This bridge allows the Hub to report metrics to both:
 * 1. Prometheus (server-side, always-on, for ops monitoring)
 * 2. Telemetry system (opt-in, privacy-preserving, for client insights)
 */

import type { Metrics } from './metrics'
import type { TelemetryCollector } from '@xnetjs/telemetry'
import { HUB_METRICS } from './metrics'

export type TelemetryBridgeConfig = {
  /**
   * How often to flush metrics to telemetry (ms).
   * Default: 60 seconds.
   */
  flushIntervalMs?: number

  /**
   * Whether to enable the bridge.
   * Default: false (opt-in).
   */
  enabled?: boolean
}

const DEFAULT_CONFIG: Required<TelemetryBridgeConfig> = {
  flushIntervalMs: 60_000,
  enabled: false
}

/**
 * Bridges Prometheus metrics to the telemetry system.
 *
 * @example
 * ```ts
 * const metrics = new Metrics()
 * const telemetry = new TelemetryCollector({ consent })
 * const bridge = new TelemetryBridge(metrics, telemetry, { enabled: true })
 * bridge.start()
 * ```
 */
export class TelemetryBridge {
  private config: Required<TelemetryBridgeConfig>
  private interval: ReturnType<typeof setInterval> | null = null
  private lastCounters = new Map<string, number>()

  constructor(
    private metrics: Metrics,
    private telemetry: TelemetryCollector,
    config?: TelemetryBridgeConfig
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Start the bridge, flushing metrics at the configured interval.
   */
  start(): void {
    if (!this.config.enabled || this.interval) return

    // Flush immediately, then on interval
    void this.flush()
    this.interval = setInterval(() => {
      void this.flush()
    }, this.config.flushIntervalMs)
  }

  /**
   * Stop the bridge.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  /**
   * Manually flush current metrics to telemetry.
   */
  async flush(): Promise<void> {
    try {
      // Parse Prometheus text format
      const rendered = this.metrics.render()
      const lines = rendered.split('\n').filter((line) => line && !line.startsWith('#'))

      for (const line of lines) {
        const parts = line.split(' ')
        if (parts.length !== 2) continue

        const [name, valueStr] = parts
        const value = parseFloat(valueStr)
        if (!Number.isFinite(value)) continue

        // Map Prometheus metrics to telemetry events
        this.reportMetric(name, value)
      }
    } catch (err) {
      // Silent failure - don't break the hub if telemetry fails
      if (process.env.NODE_ENV === 'development') {
        console.error('[TelemetryBridge] Flush failed:', err)
      }
    }
  }

  private reportMetric(name: string, value: number): void {
    // WebSocket metrics
    if (name === HUB_METRICS.WS_CONNECTIONS_TOTAL) {
      const delta = this.getDelta(name, value)
      if (delta > 0) {
        this.telemetry.reportUsage('hub.ws.connections', delta)
      }
    } else if (name === HUB_METRICS.WS_CONNECTIONS_ACTIVE) {
      // Gauge - report absolute value bucketed
      this.telemetry.reportUsage('hub.ws.active_connections', value)
    } else if (name === HUB_METRICS.WS_MESSAGES_RECEIVED) {
      const delta = this.getDelta(name, value)
      if (delta > 0) {
        this.telemetry.reportUsage('hub.ws.messages_received', delta)
      }
    } else if (name === HUB_METRICS.WS_MESSAGES_SENT) {
      const delta = this.getDelta(name, value)
      if (delta > 0) {
        this.telemetry.reportUsage('hub.ws.messages_sent', delta)
      }
    } else if (name === HUB_METRICS.WS_MESSAGES_REJECTED) {
      const delta = this.getDelta(name, value)
      if (delta > 0) {
        this.telemetry.reportUsage('hub.ws.messages_rejected', delta)
      }
    }

    // Sync metrics
    else if (name === HUB_METRICS.SYNC_DOCS_HOT) {
      this.telemetry.reportUsage('hub.sync.docs_hot', value)
    } else if (name === HUB_METRICS.SYNC_DOCS_WARM) {
      this.telemetry.reportUsage('hub.sync.docs_warm', value)
    } else if (name === HUB_METRICS.SYNC_PERSISTS_TOTAL) {
      const delta = this.getDelta(name, value)
      if (delta > 0) {
        this.telemetry.reportUsage('hub.sync.persists', delta)
      }
    }

    // Backup metrics
    else if (name === HUB_METRICS.BACKUP_UPLOADS_TOTAL) {
      const delta = this.getDelta(name, value)
      if (delta > 0) {
        this.telemetry.reportUsage('hub.backup.uploads', delta)
      }
    } else if (name === HUB_METRICS.BACKUP_BYTES_STORED) {
      this.telemetry.reportUsage('hub.backup.bytes_stored', value)
    }

    // Query metrics
    else if (name === HUB_METRICS.QUERY_REQUESTS_TOTAL) {
      const delta = this.getDelta(name, value)
      if (delta > 0) {
        this.telemetry.reportUsage('hub.query.requests', delta)
      }
    } else if (name.startsWith(HUB_METRICS.QUERY_DURATION_MS)) {
      // Handle histogram (query_duration_ms_sum, query_duration_ms_count)
      if (name.endsWith('_sum')) {
        // Skip - we'll handle this when we see _count
      } else if (name.endsWith('_count')) {
        const sumName = name.replace('_count', '_sum')
        const sumLine = this.metrics
          .render()
          .split('\n')
          .find((line) => line.startsWith(sumName))
        if (sumLine) {
          const sum = parseFloat(sumLine.split(' ')[1] ?? '0')
          const count = value
          if (count > 0) {
            const avgMs = sum / count
            this.telemetry.reportPerformance('hub.query.duration', avgMs)
          }
        }
      }
    }

    // Rate limit metrics
    else if (name === HUB_METRICS.RATE_LIMIT_REJECTIONS) {
      const delta = this.getDelta(name, value)
      if (delta > 0) {
        this.telemetry.reportSecurityEvent('hub.rate_limit.rejections', 'medium', {
          actionTaken: 'request_rejected'
        })
      }
    }
  }

  /**
   * Calculate delta for counter metrics.
   * Counters only increase, so we track the last value and report the difference.
   */
  private getDelta(name: string, currentValue: number): number {
    const lastValue = this.lastCounters.get(name) ?? 0
    const delta = currentValue - lastValue
    this.lastCounters.set(name, currentValue)
    return delta
  }
}
