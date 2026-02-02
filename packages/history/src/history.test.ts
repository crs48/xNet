/**
 * Tests for @xnet/history
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateSigningKeyPair } from '@xnet/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnet/data'
import type { DID } from '@xnet/core'
import type { SchemaIRI } from '@xnet/data'
import type { NodeId, NodeStorageAdapter } from '@xnet/data'

import { HistoryEngine, createEmptyState, applyChangeToState, inferOperation } from './engine'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'
import { AuditIndex } from './audit-index'
import { UndoManager } from './undo-manager'
import { ScrubCache } from './scrub-cache'
import { PlaybackEngine } from './playback'
import { DiffEngine } from './diff'
import { BlameEngine } from './blame'
import { VerificationEngine } from './verification'
import { deepEqual } from './utils'

// ─── Test Fixtures ───────────────────────────────────────────

const TEST_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI
const TEST_SCHEMA_2: SchemaIRI = 'xnet://xnet.fyi/Page' as SchemaIRI

function createTestStore(): {
  store: NodeStore
  adapter: MemoryNodeStorageAdapter
  did: DID
  signingKey: Uint8Array
} {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  return { store, adapter, did, signingKey: keyPair.privateKey }
}

function createHistoryEngine(adapter: NodeStorageAdapter): {
  engine: HistoryEngine
  snapshots: SnapshotCache
  snapshotStorage: MemorySnapshotStorage
} {
  const snapshotStorage = new MemorySnapshotStorage()
  const snapshots = new SnapshotCache(snapshotStorage, { interval: 5 })
  const engine = new HistoryEngine(adapter, snapshots)
  return { engine, snapshots, snapshotStorage }
}

// ─── deepEqual Tests ─────────────────────────────────────────

describe('deepEqual', () => {
  it('compares primitives', () => {
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual(1, 2)).toBe(false)
    expect(deepEqual('a', 'a')).toBe(true)
    expect(deepEqual(true, false)).toBe(false)
  })

  it('handles null/undefined', () => {
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(undefined, undefined)).toBe(true)
    expect(deepEqual(null, undefined)).toBe(false)
    expect(deepEqual(null, 1)).toBe(false)
  })

  it('compares objects', () => {
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false)
  })

  it('compares arrays', () => {
    expect(deepEqual([1, 2], [1, 2])).toBe(true)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual([1], [1, 2])).toBe(false)
  })

  it('compares nested objects', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true)
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
  })
})

// ─── HistoryEngine Tests ─────────────────────────────────────

describe('HistoryEngine', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter
  let did: DID
  let engine: HistoryEngine
  let snapshots: SnapshotCache

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    did = test.did
    await store.initialize()

    const h = createHistoryEngine(adapter)
    engine = h.engine
    snapshots = h.snapshots
  })

  describe('materializeAt', () => {
    it('materializes at index 0 (creation state)', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Hello', count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })
      await store.update(node.id, { properties: { count: 3 } })

      const state = await engine.materializeAt(node.id, { type: 'index', index: 0 })
      expect(state.node.properties.title).toBe('Hello')
      expect(state.node.properties.count).toBe(1)
      expect(state.changeIndex).toBe(0)
      expect(state.totalChanges).toBe(3)
    })

    it('materializes at intermediate index', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Hello', count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })
      await store.update(node.id, { properties: { count: 3 } })

      const state = await engine.materializeAt(node.id, { type: 'index', index: 1 })
      expect(state.node.properties.count).toBe(2)
    })

    it('materializes at latest', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })
      await store.update(node.id, { properties: { count: 3 } })

      const state = await engine.materializeAt(node.id, { type: 'latest' })
      expect(state.node.properties.count).toBe(3)
      expect(state.changeIndex).toBe(2)
    })

    it('resolves wall time target to nearest change', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 1 }
      })
      // Get the creation time
      const changes = await adapter.getChanges(node.id)
      const wallTime = changes[0].wallTime

      const state = await engine.materializeAt(node.id, {
        type: 'wall',
        timestamp: wallTime + 1
      })
      expect(state.node.properties.count).toBe(1)
    })

    it('resolves lamport target correctly', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })

      const changes = await adapter.getChanges(node.id)
      const lamportTime = changes[0].lamport.time

      const state = await engine.materializeAt(node.id, {
        type: 'lamport',
        time: lamportTime
      })
      expect(state.node.properties.count).toBe(1)
    })

    it('resolves hash target correctly', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })

      const changes = await adapter.getChanges(node.id)
      const hash = changes[0].hash

      const state = await engine.materializeAt(node.id, {
        type: 'hash',
        hash
      })
      expect(state.node.properties.count).toBe(1)
    })

    it('throws on unknown node', async () => {
      await expect(engine.materializeAt('nonexistent', { type: 'latest' })).rejects.toThrow(
        'No changes found'
      )
    })

    it('throws on unknown hash target', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 1 }
      })
      await expect(
        engine.materializeAt(node.id, {
          type: 'hash',
          hash: 'cid:blake3:unknown' as any
        })
      ).rejects.toThrow('not found')
    })

    it('handles deleted nodes', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })
      await store.delete(node.id)

      const state = await engine.materializeAt(node.id, { type: 'latest' })
      expect(state.node.deleted).toBe(true)

      const beforeDelete = await engine.materializeAt(node.id, { type: 'index', index: 0 })
      expect(beforeDelete.node.deleted).toBe(false)
    })

    it('uses snapshots for faster reconstruction', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 0 }
      })

      // Create enough changes to trigger a snapshot (interval=5)
      for (let i = 1; i <= 10; i++) {
        await store.update(node.id, { properties: { count: i } })
      }

      // First access at index 5 should create a snapshot
      await engine.materializeAt(node.id, { type: 'index', index: 5 })

      // Check snapshot exists
      const snap = await snapshots.getNearestBefore(node.id, 5)
      expect(snap).not.toBeNull()
      expect(snap!.changeIndex).toBe(5)

      // Accessing index 7 should use snapshot at 5
      const state = await engine.materializeAt(node.id, { type: 'index', index: 7 })
      expect(state.node.properties.count).toBe(7)
    })
  })

  describe('materializeMultipleAt', () => {
    it('reconstructs multiple nodes', async () => {
      const node1 = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Node 1' }
      })
      const node2 = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Node 2' }
      })

      const results = await engine.materializeMultipleAt([node1.id, node2.id], { type: 'latest' })

      expect(results.size).toBe(2)
      expect(results.get(node1.id)!.node.properties.title).toBe('Node 1')
      expect(results.get(node2.id)!.node.properties.title).toBe('Node 2')
    })

    it('skips non-existent nodes', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Exists' }
      })

      const results = await engine.materializeMultipleAt([node.id, 'nonexistent'], {
        type: 'latest'
      })

      expect(results.size).toBe(1)
    })
  })

  describe('getTimeline', () => {
    it('returns timeline entries for all changes', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Hello', count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })
      await store.delete(node.id)

      const timeline = await engine.getTimeline(node.id)
      expect(timeline).toHaveLength(3)
      expect(timeline[0].operation).toBe('create')
      expect(timeline[1].operation).toBe('update')
      expect(timeline[2].operation).toBe('delete')
      expect(timeline[0].author).toBe(did)
    })

    it('includes property names in each entry', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Hello', count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })

      const timeline = await engine.getTimeline(node.id)
      expect(timeline[0].properties).toContain('title')
      expect(timeline[0].properties).toContain('count')
      expect(timeline[1].properties).toContain('count')
      expect(timeline[1].properties).not.toContain('title')
    })
  })

  describe('getTimelineRange', () => {
    it('returns subset of timeline', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 0 }
      })
      for (let i = 1; i <= 5; i++) {
        await store.update(node.id, { properties: { count: i } })
      }

      const range = await engine.getTimelineRange(
        node.id,
        { type: 'index', index: 1 },
        { type: 'index', index: 3 }
      )
      expect(range).toHaveLength(3)
      expect(range[0].index).toBe(1)
      expect(range[2].index).toBe(3)
    })
  })

  describe('diff', () => {
    it('diffs between two points', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Draft', count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })
      await store.update(node.id, { properties: { count: 3, status: 'done' } })

      const diffs = await engine.diff(
        node.id,
        { type: 'index', index: 0 },
        { type: 'index', index: 2 }
      )

      expect(diffs.length).toBeGreaterThanOrEqual(1)
      const countDiff = diffs.find((d) => d.property === 'count')
      expect(countDiff).toBeDefined()
      expect(countDiff!.before).toBe(1)
      expect(countDiff!.after).toBe(3)

      const statusDiff = diffs.find((d) => d.property === 'status')
      expect(statusDiff).toBeDefined()
      expect(statusDiff!.type).toBe('added')
    })

    it('returns empty for identical states', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Same' }
      })

      const diffs = await engine.diff(
        node.id,
        { type: 'index', index: 0 },
        { type: 'index', index: 0 }
      )
      expect(diffs).toHaveLength(0)
    })
  })

  describe('createRevertPayload', () => {
    it('creates correct revert payload', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 1, title: 'Original' }
      })
      await store.update(node.id, { properties: { count: 5 } })

      const current = await store.get(node.id)
      const payload = await engine.createRevertPayload(
        node.id,
        { type: 'index', index: 0 },
        current!
      )

      expect(payload.count).toBe(1)
      expect(payload.title).toBeUndefined() // unchanged
    })
  })

  describe('getChangeCount', () => {
    it('returns correct count', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })
      await store.update(node.id, { properties: { count: 3 } })

      const count = await engine.getChangeCount(node.id)
      expect(count).toBe(3)
    })
  })
})

// ─── SnapshotCache Tests ─────────────────────────────────────

describe('SnapshotCache', () => {
  let snapshotStorage: MemorySnapshotStorage
  let cache: SnapshotCache

  beforeEach(() => {
    snapshotStorage = new MemorySnapshotStorage()
    cache = new SnapshotCache(snapshotStorage, { interval: 100, maxPerNode: 5 })
  })

  it('returns null when no snapshots exist', async () => {
    const snap = await cache.getNearestBefore('node1', 50)
    expect(snap).toBeNull()
  })

  it('returns nearest snapshot before target', async () => {
    const state100 = {
      id: 'n1',
      schemaId: 'xnet://x/T' as SchemaIRI,
      properties: { v: 100 },
      timestamps: {},
      deleted: false,
      createdAt: 0,
      createdBy: 'did:key:z6Mk1' as DID,
      updatedAt: 0,
      updatedBy: 'did:key:z6Mk1' as DID
    }
    const state200 = { ...state100, properties: { v: 200 } }

    await cache.save('n1', 100, 'cid:blake3:hash100' as any, state100)
    await cache.save('n1', 200, 'cid:blake3:hash200' as any, state200)

    const snap = await cache.getNearestBefore('n1', 250)
    expect(snap).not.toBeNull()
    expect(snap!.changeIndex).toBe(200)
  })

  it('does not return snapshots after target', async () => {
    const state = {
      id: 'n1',
      schemaId: 'xnet://x/T' as SchemaIRI,
      properties: {},
      timestamps: {},
      deleted: false,
      createdAt: 0,
      createdBy: 'did:key:z6Mk1' as DID,
      updatedAt: 0,
      updatedBy: 'did:key:z6Mk1' as DID
    }
    await cache.save('n1', 200, 'cid:blake3:hash200' as any, state)

    const snap = await cache.getNearestBefore('n1', 150)
    expect(snap).toBeNull()
  })

  it('shouldSnapshot returns true at intervals', () => {
    expect(cache.shouldSnapshot(0)).toBe(false)
    expect(cache.shouldSnapshot(50)).toBe(false)
    expect(cache.shouldSnapshot(100)).toBe(true)
    expect(cache.shouldSnapshot(200)).toBe(true)
  })

  it('evicts oldest when per-node limit exceeded', async () => {
    const state = {
      id: 'n1',
      schemaId: 'xnet://x/T' as SchemaIRI,
      properties: {},
      timestamps: {},
      deleted: false,
      createdAt: 0,
      createdBy: 'did:key:z6Mk1' as DID,
      updatedAt: 0,
      updatedBy: 'did:key:z6Mk1' as DID
    }

    // Save 6 snapshots with maxPerNode=5
    for (let i = 1; i <= 6; i++) {
      await cache.save('n1', i * 100, `cid:blake3:hash${i}` as any, state)
    }

    const snaps = await snapshotStorage.getSnapshots('n1')
    expect(snaps.length).toBe(5)
    // Oldest (100) should be evicted
    expect(snaps.find((s) => s.changeIndex === 100)).toBeUndefined()
  })

  it('getStats returns correct counts', async () => {
    const state = {
      id: 'n1',
      schemaId: 'xnet://x/T' as SchemaIRI,
      properties: {},
      timestamps: {},
      deleted: false,
      createdAt: 0,
      createdBy: 'did:key:z6Mk1' as DID,
      updatedAt: 0,
      updatedBy: 'did:key:z6Mk1' as DID
    }

    await cache.save('n1', 100, 'cid:blake3:h1' as any, state)
    await cache.save('n2', 100, 'cid:blake3:h2' as any, { ...state, id: 'n2' })

    const stats = await cache.getStats()
    expect(stats.totalSnapshots).toBe(2)
    expect(stats.nodeCount).toBe(2)
  })

  it('clear removes all snapshots for a node', async () => {
    const state = {
      id: 'n1',
      schemaId: 'xnet://x/T' as SchemaIRI,
      properties: {},
      timestamps: {},
      deleted: false,
      createdAt: 0,
      createdBy: 'did:key:z6Mk1' as DID,
      updatedAt: 0,
      updatedBy: 'did:key:z6Mk1' as DID
    }

    await cache.save('n1', 100, 'cid:blake3:h1' as any, state)
    await cache.save('n1', 200, 'cid:blake3:h2' as any, state)
    await cache.clear('n1')

    const snap = await cache.getNearestBefore('n1', 999)
    expect(snap).toBeNull()
  })
})

// ─── AuditIndex Tests ────────────────────────────────────────

describe('AuditIndex', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter
  let did: DID
  let audit: AuditIndex

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    did = test.did
    await store.initialize()
    audit = new AuditIndex(adapter)
  })

  describe('query', () => {
    it('returns all changes for a node', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })
      await store.update(node.id, { properties: { title: 'Updated' } })

      const entries = await audit.query({ nodeId: node.id })
      expect(entries).toHaveLength(2)
    })

    it('filters by author', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })

      const entries = await audit.query({ author: did })
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every((e) => e.author === did)).toBe(true)
    })

    it('filters by time range', async () => {
      const before = Date.now()
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })
      const after = Date.now()

      const entries = await audit.query({
        fromWallTime: before - 1,
        toWallTime: after + 1
      })
      expect(entries.length).toBeGreaterThan(0)
    })

    it('filters by operation', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })
      await store.update(node.id, { properties: { title: 'Updated' } })
      await store.delete(node.id)

      const creates = await audit.query({ operations: ['create'] })
      expect(creates.length).toBe(1)

      const deletes = await audit.query({ operations: ['delete'] })
      expect(deletes.length).toBe(1)
    })

    it('filters by properties', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test', count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })

      const entries = await audit.query({ properties: ['count'] })
      expect(entries.length).toBe(2) // create + update both touch count
    })

    it('supports pagination', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { count: 0 }
      })
      for (let i = 1; i <= 5; i++) {
        await store.update(node.id, { properties: { count: i } })
      }

      const page1 = await audit.query({ nodeId: node.id, limit: 3, offset: 0 })
      const page2 = await audit.query({ nodeId: node.id, limit: 3, offset: 3 })

      expect(page1).toHaveLength(3)
      expect(page2).toHaveLength(3)
    })
  })

  describe('getNodeActivity', () => {
    it('returns activity summary', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test', count: 1 }
      })
      await store.update(node.id, { properties: { count: 2 } })
      await store.update(node.id, { properties: { count: 3 } })

      const activity = await audit.getNodeActivity(node.id)
      expect(activity.totalChanges).toBe(3)
      expect(activity.creates).toBe(1)
      expect(activity.updates).toBe(2)
      expect(activity.authors).toContain(did)
    })
  })

  describe('getChangesSince', () => {
    it('returns changes after timestamp', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })
      const afterCreate = Date.now()

      // Small delay to ensure wallTime difference
      await new Promise((r) => setTimeout(r, 5))
      await store.update(node.id, { properties: { title: 'Updated' } })

      const entries = await audit.getChangesSince(node.id, afterCreate)
      expect(entries.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('subscribe', () => {
    it('receives matching changes in real-time', async () => {
      const callback = vi.fn()
      const unsub = audit.subscribe({ operations: ['create'] }, store, callback)

      await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'New' }
      })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback.mock.calls[0][0].operation).toBe('create')

      unsub()
    })

    it('does not fire for non-matching changes', async () => {
      const callback = vi.fn()
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })

      const unsub = audit.subscribe({ operations: ['delete'] }, store, callback)
      await store.update(node.id, { properties: { title: 'Updated' } })

      expect(callback).not.toHaveBeenCalled()
      unsub()
    })
  })
})

// ─── UndoManager Tests ───────────────────────────────────────

describe('UndoManager', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter
  let did: DID
  let undo: UndoManager

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    did = test.did
    await store.initialize()
    undo = new UndoManager(store, did, { mergeInterval: 0 })
    undo.start()
  })

  it('can undo a single change', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })

    // Capture pre-change state before update
    const current = await store.get(node.id)
    undo.capturePreChangeState(node.id, current!.properties)
    await store.update(node.id, { properties: { count: 2 } })

    expect(undo.canUndo(node.id)).toBe(true)
    await undo.undo(node.id)

    const after = await store.get(node.id)
    expect(after!.properties.count).toBe(1)
  })

  it('can redo after undo', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })

    const current = await store.get(node.id)
    undo.capturePreChangeState(node.id, current!.properties)
    await store.update(node.id, { properties: { count: 2 } })

    await undo.undo(node.id)
    expect(undo.canRedo(node.id)).toBe(true)

    await undo.redo(node.id)
    const after = await store.get(node.id)
    expect(after!.properties.count).toBe(2)
  })

  it('returns false when nothing to undo', async () => {
    const result = await undo.undo('nonexistent')
    expect(result).toBe(false)
  })

  it('returns false when nothing to redo', async () => {
    const result = await undo.redo('nonexistent')
    expect(result).toBe(false)
  })

  it('clears redo stack on new change', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })

    const current = await store.get(node.id)
    undo.capturePreChangeState(node.id, current!.properties)
    await store.update(node.id, { properties: { count: 2 } })

    await undo.undo(node.id)
    expect(undo.canRedo(node.id)).toBe(true)

    // New change should clear redo
    const afterUndo = await store.get(node.id)
    undo.capturePreChangeState(node.id, afterUndo!.properties)
    await store.update(node.id, { properties: { count: 99 } })

    expect(undo.canRedo(node.id)).toBe(false)
  })

  it('clear removes all stacks for a node', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })
    const current = await store.get(node.id)
    undo.capturePreChangeState(node.id, current!.properties)
    await store.update(node.id, { properties: { count: 2 } })

    undo.clear(node.id)
    expect(undo.canUndo(node.id)).toBe(false)
    expect(undo.canRedo(node.id)).toBe(false)
  })

  it('stops tracking when stopped', async () => {
    undo.stop()

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })

    await store.update(node.id, { properties: { count: 2 } })
    expect(undo.canUndo(node.id)).toBe(false)
  })
})

// ─── ScrubCache Tests ────────────────────────────────────────

describe('ScrubCache', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    await store.initialize()
  })

  it('pre-computes states and allows fast seeking', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 0 }
    })
    for (let i = 1; i <= 20; i++) {
      await store.update(node.id, { properties: { count: i } })
    }

    const scrub = new ScrubCache(5)
    await scrub.precompute(node.id, adapter)

    expect(scrub.totalChanges).toBe(21)

    const stateAt0 = scrub.getStateAt(0)
    expect(stateAt0!.properties.count).toBe(0)

    const stateAt10 = scrub.getStateAt(10)
    expect(stateAt10!.properties.count).toBe(10)

    const stateAt20 = scrub.getStateAt(20)
    expect(stateAt20!.properties.count).toBe(20)
  })

  it('returns null for empty node', async () => {
    const scrub = new ScrubCache()
    await scrub.precompute('nonexistent', adapter)
    expect(scrub.getStateAt(0)).toBeNull()
  })

  it('clamps index to valid range', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })

    const scrub = new ScrubCache(5)
    await scrub.precompute(node.id, adapter)

    expect(scrub.getStateAt(-5)).not.toBeNull()
    expect(scrub.getStateAt(999)).not.toBeNull()
  })
})

// ─── PlaybackEngine Tests ────────────────────────────────────

describe('PlaybackEngine', () => {
  it('starts at position 0 in stopped state', () => {
    const pb = new PlaybackEngine(10)
    expect(pb.getPosition()).toBe(0)
    expect(pb.getState()).toBe('stopped')
  })

  it('seek changes position', () => {
    const pb = new PlaybackEngine(10)
    pb.seek(5)
    expect(pb.getPosition()).toBe(5)
  })

  it('seek clamps to valid range', () => {
    const pb = new PlaybackEngine(10)
    pb.seek(-5)
    expect(pb.getPosition()).toBe(0)
    pb.seek(999)
    expect(pb.getPosition()).toBe(9)
  })

  it('stepForward/stepBackward move by one', () => {
    const pb = new PlaybackEngine(10)
    pb.seek(5)
    pb.stepForward()
    expect(pb.getPosition()).toBe(6)
    pb.stepBackward()
    expect(pb.getPosition()).toBe(5)
  })

  it('jumpToStart and jumpToEnd work', () => {
    const pb = new PlaybackEngine(10)
    pb.seek(5)
    pb.jumpToStart()
    expect(pb.getPosition()).toBe(0)
    pb.jumpToEnd()
    expect(pb.getPosition()).toBe(9)
  })

  it('stop resets to position 0', () => {
    const pb = new PlaybackEngine(10)
    pb.seek(5)
    pb.stop()
    expect(pb.getPosition()).toBe(0)
    expect(pb.getState()).toBe('stopped')
  })

  it('onChange listener fires on position change', () => {
    const pb = new PlaybackEngine(10)
    const callback = vi.fn()
    pb.onChange(callback)
    pb.seek(5)
    expect(callback).toHaveBeenCalledWith(5, 'stopped')
  })

  it('setSpeed updates speed', () => {
    const pb = new PlaybackEngine(10)
    pb.setSpeed(5)
    expect(pb.getSpeed()).toBe(5)
  })

  it('dispose cleans up', () => {
    const pb = new PlaybackEngine(10)
    const callback = vi.fn()
    pb.onChange(callback)
    pb.dispose()
    pb.seek(5)
    expect(callback).not.toHaveBeenCalled()
  })
})

// ─── DiffEngine Tests ────────────────────────────────────────

describe('DiffEngine', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter
  let engine: HistoryEngine
  let diffEngine: DiffEngine

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    await store.initialize()

    const h = createHistoryEngine(adapter)
    engine = h.engine
    diffEngine = new DiffEngine(engine)
  })

  it('detects added properties', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Hello' }
    })
    await store.update(node.id, { properties: { status: 'done' } })

    const result = await diffEngine.diffNode(
      node.id,
      { type: 'index', index: 0 },
      { type: 'index', index: 1 }
    )
    const statusDiff = result.diffs.find((d) => d.property === 'status')
    expect(statusDiff).toBeDefined()
    expect(statusDiff!.type).toBe('added')
    expect(result.summary.added).toBe(1)
  })

  it('detects modified properties', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })
    await store.update(node.id, { properties: { count: 5 } })

    const result = await diffEngine.diffNode(
      node.id,
      { type: 'index', index: 0 },
      { type: 'index', index: 1 }
    )
    const countDiff = result.diffs.find((d) => d.property === 'count')
    expect(countDiff!.type).toBe('modified')
    expect(countDiff!.before).toBe(1)
    expect(countDiff!.after).toBe(5)
  })

  it('diffFromCurrent works', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })
    await store.update(node.id, { properties: { count: 2 } })
    await store.update(node.id, { properties: { count: 3 } })

    const result = await diffEngine.diffFromCurrent(node.id, 2)
    const countDiff = result.diffs.find((d) => d.property === 'count')
    expect(countDiff).toBeDefined()
  })
})

// ─── BlameEngine Tests ───────────────────────────────────────

describe('BlameEngine', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter
  let did: DID
  let blame: BlameEngine

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    did = test.did
    await store.initialize()
    blame = new BlameEngine(adapter)
  })

  it('tracks blame for each property', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Hello', count: 1 }
    })
    await store.update(node.id, { properties: { count: 2 } })
    await store.update(node.id, { properties: { count: 3 } })

    const result = await blame.getBlame(node.id)

    const titleBlame = result.find((b) => b.property === 'title')
    expect(titleBlame).toBeDefined()
    expect(titleBlame!.totalEdits).toBe(1)
    expect(titleBlame!.currentValue).toBe('Hello')

    const countBlame = result.find((b) => b.property === 'count')
    expect(countBlame).toBeDefined()
    expect(countBlame!.totalEdits).toBe(3) // create + 2 updates
    expect(countBlame!.currentValue).toBe(3)
    expect(countBlame!.history).toHaveLength(3)
  })

  it('getPropertyBlame returns single property', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Hello', count: 1 }
    })

    const titleBlame = await blame.getPropertyBlame(node.id, 'title')
    expect(titleBlame).not.toBeNull()
    expect(titleBlame!.property).toBe('title')

    const nonExistent = await blame.getPropertyBlame(node.id, 'nonexistent')
    expect(nonExistent).toBeNull()
  })

  it('getChangesSince returns recent activity', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Hello' }
    })
    const afterCreate = Date.now()
    await new Promise((r) => setTimeout(r, 5))
    await store.update(node.id, { properties: { title: 'Updated' } })

    const info = await blame.getChangesSince(node.id, afterCreate)
    expect(info.changeCount).toBeGreaterThanOrEqual(1)
    expect(info.properties).toContain('title')
    expect(info.authors).toContain(did)
  })
})

// ─── VerificationEngine Tests ────────────────────────────────

describe('VerificationEngine', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter
  let verifier: VerificationEngine

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    await store.initialize()
    verifier = new VerificationEngine(adapter)
  })

  it('passes for a valid chain of changes', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Hello' }
    })
    await store.update(node.id, { properties: { title: 'World' } })

    const result = await verifier.verifyNodeHistory(node.id, { skipSignatures: true })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.stats.totalChanges).toBe(2)
    expect(result.stats.verifiedHashes).toBe(2)
    expect(result.stats.validChainLinks).toBe(1)
    expect(result.stats.roots).toBe(1)
    expect(result.stats.heads).toBe(1)
  })

  it('quickCheck works', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Hello' }
    })

    const check = await verifier.quickCheck(node.id)
    expect(check.valid).toBe(true)
    expect(check.errors).toBe(0)
  })

  it('reports progress callback', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Hello' }
    })
    await store.update(node.id, { properties: { title: 'World' } })

    const progress: number[] = []
    await verifier.verifyNodeHistory(node.id, {
      skipSignatures: true,
      onProgress: (p) => progress.push(p)
    })

    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toBe(1)
  })
})

// ─── Integration Tests ───────────────────────────────────────

describe('Integration', () => {
  it('full workflow: create, update, timeline, materialize, diff, blame', async () => {
    const { store, adapter, did } = createTestStore()
    await store.initialize()

    const { engine } = createHistoryEngine(adapter)

    // Create a task
    const task = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Build feature', priority: 'high', status: 'todo' }
    })

    // Update it several times
    await store.update(task.id, { properties: { status: 'in-progress' } })
    await store.update(task.id, { properties: { priority: 'critical' } })
    await store.update(task.id, { properties: { status: 'done', notes: 'Shipped!' } })

    // Get timeline
    const timeline = await engine.getTimeline(task.id)
    expect(timeline).toHaveLength(4)

    // Materialize at creation
    const created = await engine.materializeAt(task.id, { type: 'index', index: 0 })
    expect(created.node.properties.status).toBe('todo')

    // Materialize midway
    const midway = await engine.materializeAt(task.id, { type: 'index', index: 2 })
    expect(midway.node.properties.status).toBe('in-progress')
    expect(midway.node.properties.priority).toBe('critical')

    // Diff start to end
    const diffs = await engine.diff(task.id, { type: 'index', index: 0 }, { type: 'latest' })
    expect(diffs.length).toBeGreaterThan(0)

    // Blame
    const blame = new BlameEngine(adapter)
    const blameInfo = await blame.getBlame(task.id)
    expect(blameInfo.find((b) => b.property === 'status')!.totalEdits).toBe(3)

    // Audit
    const audit = new AuditIndex(adapter)
    const activity = await audit.getNodeActivity(task.id)
    expect(activity.totalChanges).toBe(4)
  })
})
