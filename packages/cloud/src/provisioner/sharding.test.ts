import { describe, expect, it } from 'vitest'
import { ShardAllocator, placementFromSubstrateRef, projectForServiceIndex } from './sharding'

const R = 'us-central1'

describe('projectForServiceIndex', () => {
  const cfg = { projectPrefix: 'xnet-hub', servicesPerProject: 800 }

  it('keeps the first 800 services in shard 0 and rolls at the cap', () => {
    expect(projectForServiceIndex(0, cfg)).toBe('xnet-hub-0')
    expect(projectForServiceIndex(799, cfg)).toBe('xnet-hub-0')
    expect(projectForServiceIndex(800, cfg)).toBe('xnet-hub-1')
    expect(projectForServiceIndex(1599, cfg)).toBe('xnet-hub-1')
    expect(projectForServiceIndex(1600, cfg)).toBe('xnet-hub-2')
  })

  it('rejects bad input', () => {
    expect(() => projectForServiceIndex(-1, cfg)).toThrow()
    expect(() => projectForServiceIndex(1.5, cfg)).toThrow()
    expect(() => projectForServiceIndex(0, { projectPrefix: 'x', servicesPerProject: 0 })).toThrow()
  })
})

describe('ShardAllocator', () => {
  it('fills shard 0 then opens shard 1 at the cap', () => {
    const alloc = new ShardAllocator({ projectPrefix: 'xnet-hub', servicesPerProject: 2 })
    expect(alloc.allocate(R)).toBe('xnet-hub-0')
    expect(alloc.allocate(R)).toBe('xnet-hub-0')
    expect(alloc.allocate(R)).toBe('xnet-hub-1') // shard 0 full
    expect(alloc.countFor('xnet-hub-0', R)).toBe(2)
    expect(alloc.countFor('xnet-hub-1', R)).toBe(1)
  })

  it('reuses freed slots in the lowest shard after release', () => {
    const alloc = new ShardAllocator({ projectPrefix: 'xnet-hub', servicesPerProject: 2 })
    alloc.allocate(R) // hub-0 (1)
    alloc.allocate(R) // hub-0 (2, full)
    alloc.allocate(R) // hub-1 (1)
    alloc.release('xnet-hub-0', R) // hub-0 (1)
    expect(alloc.allocate(R)).toBe('xnet-hub-0') // refills the lowest open shard
  })

  it('never releases below zero', () => {
    const alloc = new ShardAllocator({ projectPrefix: 'x' })
    alloc.release('x-0', R)
    expect(alloc.countFor('x-0', R)).toBe(0)
  })

  // The Cloud Run cap is 1,000 services per project PER REGION. Counting one
  // number across regions rolls a shard that still has room in the region the
  // next tenant is actually going to (exploration 0436 G9).
  it('counts each region separately', () => {
    const alloc = new ShardAllocator({ projectPrefix: 'xnet-hub', servicesPerProject: 1 })
    expect(alloc.allocate('us-central1')).toBe('xnet-hub-0')
    expect(alloc.allocate('us-central1')).toBe('xnet-hub-1') // us shard 0 full
    expect(alloc.allocate('europe-west1')).toBe('xnet-hub-0') // eu shard 0 untouched
    expect(alloc.countFor('xnet-hub-0', 'us-central1')).toBe(1)
    expect(alloc.countFor('xnet-hub-0', 'europe-west1')).toBe(1)
  })

  // The restart bug: counts lived only in memory, so the next provision after a
  // deploy targeted shard 0 — already full — and failed AFTER Stripe had charged.
  it('resumes past a full shard after rehydrating from stored placements', () => {
    const alloc = new ShardAllocator({ projectPrefix: 'xnet-hub', servicesPerProject: 2 })
    alloc.rehydrate([
      { project: 'xnet-hub-0', region: R },
      { project: 'xnet-hub-0', region: R }
    ])
    expect(alloc.allocate(R)).toBe('xnet-hub-1')
  })

  it('rehydrate is idempotent, so re-running it cannot shrink capacity', () => {
    const alloc = new ShardAllocator({ projectPrefix: 'xnet-hub', servicesPerProject: 2 })
    const placements = [{ project: 'xnet-hub-0', region: R }]
    alloc.rehydrate(placements)
    alloc.rehydrate(placements)
    expect(alloc.countFor('xnet-hub-0', R)).toBe(1)
  })
})

describe('placementFromSubstrateRef', () => {
  it('reads a Cloud Run substrateRef', () => {
    expect(placementFromSubstrateRef('xnet-hub-3/europe-west1/t-abc')).toEqual({
      project: 'xnet-hub-3',
      region: 'europe-west1'
    })
  })

  // A malformed ref counted against the wrong shard silently shrinks capacity
  // nobody can see; null is the loud answer.
  it('returns null rather than guessing at a foreign ref shape', () => {
    expect(placementFromSubstrateRef('memory://xnet-hub-dev/t_abc')).toBeNull()
    expect(placementFromSubstrateRef('too/many/parts/here')).toBeNull()
    expect(placementFromSubstrateRef('')).toBeNull()
  })
})
