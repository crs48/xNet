import type { TelemetryEventInput } from '../src/telemetry/normalize'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTelemetryStore, type TelemetryStore } from '../src/telemetry/store'

const HOUR = 3_600_000

const ev = (overrides: Partial<TelemetryEventInput> = {}): TelemetryEventInput => ({
  ts: Date.now(),
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
  attributes: null,
  ...overrides
})

describe('TelemetryStore', () => {
  let store: TelemetryStore

  beforeEach(() => {
    store = createTelemetryStore(':memory:')
  })
  afterEach(() => {
    store.close()
  })

  it('appends a batch and counts rows', () => {
    const n = store.appendBatch([ev(), ev({ name: 'app.open' })])
    expect(n).toBe(2)
    expect(store.count()).toBe(2)
  })

  it('returns 0 for an empty batch', () => {
    expect(store.appendBatch([])).toBe(0)
  })

  it('rolls up counts by kind', () => {
    store.appendBatch([
      ev({ kind: 'usage' }),
      ev({ kind: 'usage' }),
      ev({ kind: 'performance', name: 'sync.round_trip', valueBucket: '50-200ms' })
    ])
    const kinds = store.kindCounts()
    expect(kinds.find((k) => k.kind === 'usage')?.count).toBe(2)
    expect(kinds.find((k) => k.kind === 'performance')?.count).toBe(1)
  })

  it('ranks top names by count', () => {
    store.appendBatch([
      ev({ name: 'a' }),
      ev({ name: 'a' }),
      ev({ name: 'a' }),
      ev({ name: 'b' })
    ])
    const top = store.topNames()
    expect(top[0]).toMatchObject({ name: 'a', count: 3 })
    expect(top[1]).toMatchObject({ name: 'b', count: 1 })
  })

  it('buckets the time-series by hour', () => {
    const base = 100 * HOUR
    store.appendBatch([
      ev({ ts: base + 60_000 }),
      ev({ ts: base + 120_000 }),
      ev({ ts: base + HOUR + 60_000 })
    ])
    const series = store.timeseries()
    expect(series).toEqual([
      { bucket: base, count: 2 },
      { bucket: base + HOUR, count: 1 }
    ])
  })

  it('filters rollups by kind and window', () => {
    const base = 200 * HOUR
    store.appendBatch([
      ev({ ts: base, kind: 'usage' }),
      ev({ ts: base, kind: 'security', name: 'x', severity: 'high' }),
      ev({ ts: base - 10 * HOUR, kind: 'usage' })
    ])
    const recent = store.kindCounts({ sinceMs: base - HOUR })
    expect(recent.find((k) => k.kind === 'usage')?.count).toBe(1) // old one excluded
    const sec = store.kindCounts({ kind: 'security' })
    expect(sec).toEqual([{ kind: 'security', count: 1 }])
  })

  it('returns recent raw events newest-first', () => {
    store.appendBatch([ev({ ts: 1000, name: 'old' }), ev({ ts: 2000, name: 'new' })])
    const events = store.recentEvents()
    expect(events[0].name).toBe('new')
    expect(events[1].name).toBe('old')
  })

  it('prunes raw events older than the cutoff but keeps rollups', () => {
    const old = Date.now() - 30 * 24 * HOUR
    store.appendBatch([ev({ ts: old }), ev({ ts: Date.now() })])
    const deleted = store.pruneRaw(7 * 24 * HOUR)
    expect(deleted).toBe(1)
    expect(store.count()).toBe(1)
    // rollups are retained even after raw rows are pruned
    expect(store.kindCounts().reduce((sum, k) => sum + k.count, 0)).toBe(2)
  })

  it('stores a did hash when present', () => {
    store.appendBatch([ev({ didHash: 'abc123' })])
    expect(store.recentEvents()[0].didHash).toBe('abc123')
  })
})
