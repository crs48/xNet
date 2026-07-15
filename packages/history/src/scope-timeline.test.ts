/**
 * ScopeTimeline tests (exploration 0329): merged timeline over an arbitrary
 * node set, scrub-position frontiers, and seek caching.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import { HistoryEngine } from './engine'
import { materializeAtFrontier } from './frontier'
import { ScopeTimeline, ScopeScrubCache } from './scope-timeline'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'

const TASK: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI
const PAGE: SchemaIRI = 'xnet://xnet.fyi/Page' as SchemaIRI

async function setupScope() {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })

  // Cross-schema membership: a task and a page, interleaved edits.
  const task = await store.create({ schemaId: TASK, properties: { title: 'task-v1' } })
  const page = await store.create({ schemaId: PAGE, properties: { title: 'page-v1' } })
  await store.update(task.id, { properties: { title: 'task-v2' } })
  await store.update(page.id, { properties: { title: 'page-v2' } })
  await store.update(task.id, { properties: { title: 'task-v3' } })

  return { store, adapter, task, page }
}

describe('ScopeTimeline', () => {
  it('merges changes of an arbitrary node set in Lamport order', async () => {
    const { adapter, task, page } = await setupScope()
    const scope = new ScopeTimeline(adapter)
    const timeline = await scope.getMergedTimeline([task.id, page.id])

    expect(timeline.length).toBe(5)
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].lamport).toBeGreaterThanOrEqual(timeline[i - 1].lamport)
      expect(timeline[i].index).toBe(i)
    }
    expect(new Set(timeline.map((e) => e.nodeId))).toEqual(new Set([task.id, page.id]))
    expect(timeline[0].operation).toBe('create')
  })

  it('materializes the whole scope at a position', async () => {
    const { adapter, task, page } = await setupScope()
    const scope = new ScopeTimeline(adapter)
    const timeline = await scope.getMergedTimeline([task.id, page.id])

    // Position 2 = task created, page created, task updated once.
    const states = await scope.materializeScopeAt(timeline, 2)
    const byId = new Map(states.map((s) => [s.id, s]))
    expect(byId.get(task.id)?.properties.title).toBe('task-v2')
    expect(byId.get(page.id)?.properties.title).toBe('page-v1')
  })

  it('scrub positions convert to frontiers that materialize identically', async () => {
    const { adapter, task, page } = await setupScope()
    const scope = new ScopeTimeline(adapter)
    const timeline = await scope.getMergedTimeline([task.id, page.id])
    const engine = new HistoryEngine(
      adapter,
      new SnapshotCache(new MemorySnapshotStorage(), { interval: 100 })
    )

    for (const position of [0, 2, timeline.length - 1]) {
      const viaTimeline = await scope.materializeScopeAt(timeline, position)
      const frontier = scope.frontierAtPosition(timeline, position)
      const { states: viaFrontier, missing } = await materializeAtFrontier(engine, frontier)

      expect(missing).toEqual([])
      expect(new Set(viaFrontier.keys())).toEqual(new Set(viaTimeline.map((s) => s.id)))
      for (const state of viaTimeline) {
        expect(viaFrontier.get(state.id)?.node.properties).toEqual(state.properties)
      }
    }
  })

  it('frontier omits members that did not exist at the position', async () => {
    const { adapter, task, page } = await setupScope()
    const scope = new ScopeTimeline(adapter)
    const timeline = await scope.getMergedTimeline([task.id, page.id])

    const frontier = scope.frontierAtPosition(timeline, 0)
    expect(frontier[task.id]).toBeDefined()
    expect(frontier[page.id]).toBeUndefined()
  })
})

describe('ScopeScrubCache', () => {
  it('precomputes interval states and serves exact hits and fallbacks', async () => {
    const { store, adapter, task, page } = await setupScope()
    for (let i = 0; i < 20; i++) {
      await store.update(task.id, { properties: { title: `task-extra-${i}` } })
    }

    const scope = new ScopeTimeline(adapter)
    const cache = new ScopeScrubCache(10)
    await cache.precompute([task.id, page.id], scope)

    expect(cache.totalChanges).toBe(25)
    const atCached = await cache.getStatesAt(10, scope)
    const atUncached = await cache.getStatesAt(11, scope)
    expect(atCached.length).toBeGreaterThan(0)
    expect(atUncached.length).toBeGreaterThan(0)

    const direct = await scope.materializeScopeAt(cache.getTimeline(), 11)
    expect(new Map(atUncached.map((s) => [s.id, s.properties.title]))).toEqual(
      new Map(direct.map((s) => [s.id, s.properties.title]))
    )
  })
})
