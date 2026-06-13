import { describe, expect, it } from 'vitest'
import { isFullySynced, isReplicaFresh, replicaLagMs } from './freshness'

describe('replica freshness', () => {
  it('computes lag (0 when caught up)', () => {
    expect(replicaLagMs(1000, 1000)).toBe(0)
    expect(replicaLagMs(1000, 990)).toBe(10)
    expect(replicaLagMs(990, 1000)).toBe(0) // sync ahead of write → no lag
  })

  it('is fresh within the threshold, stale beyond it (the alert)', () => {
    expect(isReplicaFresh(1000, 999, 5)).toBe(true) // 1ms lag, 5ms allowed
    expect(isReplicaFresh(1000, 990, 5)).toBe(false) // 10ms lag, 5ms allowed → alert
  })

  it('is fully synced only when every write is durable (the demotion gate)', () => {
    expect(isFullySynced(1000, 1000)).toBe(true)
    expect(isFullySynced(1000, 1001)).toBe(true)
    expect(isFullySynced(1000, 999)).toBe(false) // unsynced write → do NOT destroy the DB
  })
})
