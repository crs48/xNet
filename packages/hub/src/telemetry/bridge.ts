/**
 * @xnetjs/hub - Hub-side telemetry producer (exploration 0187).
 *
 * Turns the hub's own Prometheus metrics into telemetry rows in telemetry.db so
 * the same dashboard that shows client usage also shows server health (sync,
 * backup, query latency, rate-limit rejections). It reuses the existing
 * TelemetryBridge by giving its TelemetryCollector a write-through buffer that
 * lands records in the store as `producer='hub'` events.
 *
 * The hub is the operator's own server, so consent is implicit ('anonymous'
 * tier) — but only the hub's own aggregate metrics are recorded, never user
 * content, and DIDs are never attached.
 */

import type { TelemetryStore } from './store'
import type { Metrics } from '../middleware/metrics'
import type { TelemetryBufferStore, TelemetryRecord } from '@xnetjs/telemetry'
import { ConsentManager, MemoryConsentStorage, TelemetryCollector } from '@xnetjs/telemetry'
import { TelemetryBridge } from '../middleware/telemetry-bridge'
import { normalizeRecord } from './normalize'

/**
 * A write-only TelemetryBufferStore that funnels collected hub records straight
 * into the telemetry store as server-side events. Read/mutate operations are
 * no-ops — the hub collector never hydrates or re-syncs.
 */
class TelemetryStoreBuffer implements TelemetryBufferStore {
  constructor(private store: TelemetryStore) {}

  append(record: TelemetryRecord): Promise<void> {
    const row = normalizeRecord(record, { didHash: null, producer: 'hub', now: Date.now() })
    if (row) this.store.appendBatch([row])
    return Promise.resolve()
  }

  all(): Promise<TelemetryRecord[]> {
    return Promise.resolve([])
  }
  setStatus(): Promise<void> {
    return Promise.resolve()
  }
  remove(): Promise<void> {
    return Promise.resolve()
  }
  clear(): Promise<void> {
    return Promise.resolve()
  }
  prune(): Promise<void> {
    return Promise.resolve()
  }
}

export interface HubTelemetry {
  /** Start flushing hub metrics into the store. */
  start(): void
  /** Stop flushing. */
  stop(): void
}

export interface HubTelemetryOptions {
  store: TelemetryStore
  metrics: Metrics
  /** Whether to actually flush. Default: true (it's the operator's own hub). */
  enabled?: boolean
  /** Flush interval (ms). Default: 60s. */
  flushIntervalMs?: number
}

/**
 * Wire the hub's metrics → telemetry store bridge. Returns a handle the server
 * lifecycle can start on boot and stop on shutdown.
 */
export function createHubTelemetry({
  store,
  metrics,
  enabled = true,
  flushIntervalMs
}: HubTelemetryOptions): HubTelemetry {
  const consent = new ConsentManager({ storage: new MemoryConsentStorage(), autoLoad: false })
  // Hub metrics need 'anonymous' to flow through reportUsage/reportPerformance.
  void consent.setTier('anonymous')

  const collector = new TelemetryCollector({
    consent,
    buffer: new TelemetryStoreBuffer(store)
  })
  const bridge = new TelemetryBridge(metrics, collector, { enabled, flushIntervalMs })

  return {
    start: () => bridge.start(),
    stop: () => bridge.stop()
  }
}
