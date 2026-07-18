/**
 * Tests for the SQLite diagnostics quarantine (exploration 0341).
 *
 * Runs on `:memory:` (the 0294 preference for unit-shaped store tests). Covers
 * the round-trip field mapping, pending ordering, ack/prune retention, the
 * summary rollup, and the row-cap eviction invariant: oldest DRAINED rows are
 * evicted first and PENDING rows never are.
 */

import type { DebugReportRecord } from '@xnetjs/telemetry/inbox'
import { describe, expect, it } from 'vitest'
import { createSqliteDebugReportStore } from './store'

const record = (over: Partial<DebugReportRecord> = {}): DebugReportRecord => ({
  id: `dr_${over.fingerprint ?? 'abc'}`,
  lane: 'auto',
  fingerprint: 'abc',
  errorName: 'TypeError',
  message: 'boom',
  stack: 'at explode (app.js:1:2)',
  release: 'web-1.42',
  surface: 'web',
  breadcrumbs: ['a', 'b'],
  occurrences: 1,
  status: 'pending',
  firstSeenMs: 1_000,
  lastSeenMs: 1_000,
  ...over
})

describe('createSqliteDebugReportStore', () => {
  it('round-trips every field through the row mapping', async () => {
    const store = createSqliteDebugReportStore(':memory:')
    const original = record({
      lane: 'user',
      id: 'dr_u_1',
      bootStage: 'render',
      uaFamily: 'Chrome 140 / macOS',
      userDescription: 'it broke',
      didHash: 'h4sh'
    })
    await store.put(original)
    expect(await store.get('dr_u_1')).toEqual(original)
    expect(await store.get('missing')).toBeNull()
    store.close()
  })

  it('upserts on id, lists pending oldest-first, acks, and prunes drained only', async () => {
    const store = createSqliteDebugReportStore(':memory:')
    await store.put(record({ id: 'a', fingerprint: 'fa', firstSeenMs: 2_000, lastSeenMs: 2_000 }))
    await store.put(record({ id: 'b', fingerprint: 'fb', firstSeenMs: 1_000, lastSeenMs: 1_000 }))
    expect((await store.listPending()).map((r) => r.id)).toEqual(['b', 'a'])

    // Upsert bumps occurrences/status in place.
    await store.put(record({ id: 'a', fingerprint: 'fa', occurrences: 5, lastSeenMs: 3_000 }))
    expect((await store.get('a'))?.occurrences).toBe(5)

    expect(await store.ack(['a', 'nope'])).toBe(1)
    expect((await store.listPending()).map((r) => r.id)).toEqual(['b'])

    // Prune removes only long-drained rows, never pending ones.
    expect(await store.prune(0, 10_000)).toBe(1)
    expect(await store.get('a')).toBeNull()
    expect(await store.get('b')).not.toBeNull()
    store.close()
  })

  it('summarizes counts and top issues without payload fields', async () => {
    const store = createSqliteDebugReportStore(':memory:')
    await store.put(record({ id: 'a', fingerprint: 'fa', occurrences: 7, lastSeenMs: 5_000 }))
    await store.put(record({ id: 'b', fingerprint: 'fb', errorName: 'RangeError' }))
    await store.ack(['b'])

    const summary = await store.summary(1)
    expect(summary).toMatchObject({ pending: 1, drained: 1, total: 2, lastSeenMs: 5_000 })
    expect(summary.topIssues).toHaveLength(1)
    expect(summary.topIssues[0]).toMatchObject({
      fingerprint: 'fa',
      errorName: 'TypeError',
      occurrences: 7
    })
    expect(JSON.stringify(summary)).not.toContain('boom')
    store.close()
  })

  it('enforces the row cap by evicting oldest DRAINED rows, never pending', async () => {
    const store = createSqliteDebugReportStore(':memory:', { maxRows: 3 })
    await store.put(record({ id: 'old-drained', fingerprint: 'f1', lastSeenMs: 100 }))
    await store.put(record({ id: 'new-drained', fingerprint: 'f2', lastSeenMs: 200 }))
    await store.ack(['old-drained', 'new-drained'])
    await store.put(record({ id: 'pending-1', fingerprint: 'f3', lastSeenMs: 50 }))

    // 4th row crosses the cap → the OLDEST drained row goes; pending survives
    // even though it is the oldest row overall.
    await store.put(record({ id: 'pending-2', fingerprint: 'f4', lastSeenMs: 300 }))
    expect(await store.get('old-drained')).toBeNull()
    expect(await store.get('new-drained')).not.toBeNull()
    expect(await store.get('pending-1')).not.toBeNull()
    expect(await store.get('pending-2')).not.toBeNull()

    // All-pending overflow: nothing is evicted (backpressure happens upstream).
    await store.put(record({ id: 'pending-3', fingerprint: 'f5' }))
    await store.put(record({ id: 'pending-4', fingerprint: 'f6' }))
    expect(await store.pendingCount()).toBe(4)
    store.close()
  })
})
