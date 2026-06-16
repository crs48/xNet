import type { TelemetryEventInput } from '../src/telemetry/normalize'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTelemetryStore, type TelemetryStore } from '../src/telemetry/store'
import { createTelemetryMaintenance, runTelemetryTiering } from '../src/telemetry/tiering'

const DAY = 24 * 60 * 60 * 1000

const ev = (ts: number): TelemetryEventInput => ({
  ts,
  producer: 'client',
  didHash: null,
  schemaId: 'xnet://xnet.fyi/telemetry/UsageMetric',
  kind: 'usage',
  name: 'editor.save',
  severity: null,
  valueBucket: '1-5',
  serviceName: null,
  serviceVersion: null,
  osType: null,
  traceId: null,
  spanId: null,
  attributes: null
})

describe('telemetry tiering / retention', () => {
  let store: TelemetryStore

  beforeEach(() => {
    store = createTelemetryStore(':memory:')
  })
  afterEach(() => {
    store.close()
  })

  it('prunes aged raw rows (prune-only when no cold bucket)', async () => {
    store.appendBatch([ev(Date.now() - 30 * DAY), ev(Date.now() - 1 * DAY), ev(Date.now())])
    const result = await runTelemetryTiering({ store, retentionMs: 7 * DAY })
    expect(result.mode).toBe('prune-only')
    expect(result.exported).toBe(0)
    expect(result.deleted).toBe(1)
    expect(store.count()).toBe(2)
  })

  it('keeps rollups after pruning raw rows', async () => {
    store.appendBatch([ev(Date.now() - 30 * DAY)])
    await runTelemetryTiering({ store, retentionMs: 7 * DAY })
    expect(store.count()).toBe(0)
    // rollup survives so the dashboard time-series does not lose history
    expect(store.kindCounts().reduce((s, k) => s + k.count, 0)).toBe(1)
  })

  it('stays prune-only for a memory store even if a cold bucket is set', async () => {
    store.appendBatch([ev(Date.now() - 30 * DAY)])
    const result = await runTelemetryTiering({
      store,
      retentionMs: 7 * DAY,
      coldBucket: 's3://example'
    })
    // ':memory:' can't be ATTACHed by DuckDB, so it never tries to export.
    expect(result.mode).toBe('prune-only')
    expect(result.deleted).toBe(1)
  })

  it('runOnce on the maintenance handle prunes', async () => {
    store.appendBatch([ev(Date.now() - 30 * DAY)])
    const maintenance = createTelemetryMaintenance({ store, retentionMs: 7 * DAY })
    const result = await maintenance.runOnce()
    expect(result.deleted).toBe(1)
    maintenance.stop() // safe even though never started
  })

  it('start/stop are idempotent', () => {
    const maintenance = createTelemetryMaintenance({
      store,
      retentionMs: 7 * DAY,
      intervalMs: 999_999
    })
    maintenance.start()
    maintenance.start()
    maintenance.stop()
    maintenance.stop()
    expect(true).toBe(true)
  })
})
