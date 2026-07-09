import { describe, expect, it } from 'vitest'
import {
  litestreamWalPragmas,
  parseLitestreamOperationTotal,
  LitestreamSyncTracker,
  isBackupFresh,
  readLitestreamMetrics
} from './litestream'

describe('litestreamWalPragmas', () => {
  it('disables WAL autocheckpoint only when running under Litestream', () => {
    expect(litestreamWalPragmas({ LITESTREAM: '1' })).toEqual(['wal_autocheckpoint = 0'])
  })

  it('returns nothing for self-host (keeps SQLite default autocheckpoint)', () => {
    expect(litestreamWalPragmas({})).toEqual([])
    expect(litestreamWalPragmas({ LITESTREAM: '0' })).toEqual([])
  })
})

const metrics = (opTotal: number): string =>
  [
    '# HELP litestream_replica_operation_total Number of replica operations',
    '# TYPE litestream_replica_operation_total counter',
    `litestream_replica_operation_total{db="/data/hub.db",replica="r2",operation="PUT"} ${opTotal}`,
    'litestream_replica_operation_total{db="/data/hub.db",replica="r2",operation="LIST"} 3',
    'some_other_metric 999'
  ].join('\n')

describe('parseLitestreamOperationTotal', () => {
  it('sums the operation counter across label sets', () => {
    expect(parseLitestreamOperationTotal(metrics(10))).toBe(13) // 10 PUT + 3 LIST
  })

  it('returns null when the metric is absent', () => {
    expect(parseLitestreamOperationTotal('some_other_metric 1\n# a comment')).toBeNull()
    expect(parseLitestreamOperationTotal('')).toBeNull()
  })
})

describe('LitestreamSyncTracker', () => {
  it('stamps a sync time on the first observation, then only when ops advance', () => {
    const t = new LitestreamSyncTracker()
    expect(t.value).toBeNull()
    expect(t.observe(metrics(5), 1_000)).toBe(1_000) // first observation = baseline/liveness
    expect(t.observe(metrics(5), 2_000)).toBe(1_000) // no advance → unchanged
    expect(t.observe(metrics(9), 3_000)).toBe(3_000) // counter advanced → re-stamp
  })

  it('keeps the last known value when a scrape is missing the metric', () => {
    const t = new LitestreamSyncTracker()
    t.observe(metrics(5), 1_000)
    expect(t.observe('garbage', 2_000)).toBe(1_000)
  })
})

describe('isBackupFresh', () => {
  it('fails closed when the sync time is unknown', () => {
    expect(isBackupFresh(1_000, null)).toBe(false)
  })

  it('is fresh when nothing has been written', () => {
    expect(isBackupFresh(null, 5_000)).toBe(true)
  })

  it('is fresh within the lag budget and stale beyond it', () => {
    expect(isBackupFresh(1_000_000, 1_000_000 - 60_000)).toBe(true) // 1 min lag
    expect(isBackupFresh(1_000_000, 1_000_000 - 10 * 60_000)).toBe(false) // 10 min lag
  })
})

describe('readLitestreamMetrics', () => {
  it('returns the body on 200 and null on error/non-ok', async () => {
    const ok = (async () => ({ ok: true, text: async () => 'body' })) as unknown as typeof fetch
    expect(await readLitestreamMetrics('http://x/metrics', ok)).toBe('body')
    const bad = (async () => ({ ok: false, text: async () => '' })) as unknown as typeof fetch
    expect(await readLitestreamMetrics('http://x/metrics', bad)).toBeNull()
    const threw = (async () => {
      throw new Error('conn refused')
    }) as unknown as typeof fetch
    expect(await readLitestreamMetrics('http://x/metrics', threw)).toBeNull()
  })
})
