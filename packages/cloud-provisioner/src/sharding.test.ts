import { describe, expect, it } from 'vitest'
import { ShardAllocator, projectForServiceIndex } from './sharding'

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
    expect(alloc.allocate()).toBe('xnet-hub-0')
    expect(alloc.allocate()).toBe('xnet-hub-0')
    expect(alloc.allocate()).toBe('xnet-hub-1') // shard 0 full
    expect(alloc.countFor('xnet-hub-0')).toBe(2)
    expect(alloc.countFor('xnet-hub-1')).toBe(1)
  })

  it('reuses freed slots in the lowest shard after release', () => {
    const alloc = new ShardAllocator({ projectPrefix: 'xnet-hub', servicesPerProject: 2 })
    alloc.allocate() // hub-0 (1)
    alloc.allocate() // hub-0 (2, full)
    alloc.allocate() // hub-1 (1)
    alloc.release('xnet-hub-0') // hub-0 (1)
    expect(alloc.allocate()).toBe('xnet-hub-0') // refills the lowest open shard
  })

  it('never releases below zero', () => {
    const alloc = new ShardAllocator({ projectPrefix: 'x' })
    alloc.release('x-0')
    expect(alloc.countFor('x-0')).toBe(0)
  })
})
