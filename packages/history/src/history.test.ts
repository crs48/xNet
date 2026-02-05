/**
 * Tests for @xnet/history
 */

import type { PrunableStorageAdapter } from './pruning'
import type { DID } from '@xnet/core'
import type { SchemaIRI, NodeStorageAdapter, NodeChange } from '@xnet/data'
import { generateSigningKeyPair } from '@xnet/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnet/data'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AuditIndex } from './audit-index'
import { BlameEngine } from './blame'
import { DiffEngine } from './diff'
import { HistoryEngine } from './engine'
import { PlaybackEngine } from './playback'
import { PruningEngine, DEFAULT_POLICY, MOBILE_POLICY } from './pruning'
import { SchemaScrubCache } from './schema-scrub-cache'
import { SchemaTimeline, restoreSchemaAt } from './schema-timeline'
import { ScrubCache } from './scrub-cache'
import { SnapshotCache, MemorySnapshotStorage, setupAutoSnapshots } from './snapshot-cache'
import { UndoManager } from './undo-manager'
import { deepEqual } from './utils'
import { VerificationEngine } from './verification'

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
      await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })

      const entries = await audit.query({ author: did })
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every((e) => e.author === did)).toBe(true)
    })

    it('filters by time range', async () => {
      const before = Date.now()
      await store.create({
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
  let did: DID
  let undo: UndoManager

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
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
    const { store, adapter } = createTestStore()
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

// ─── setupAutoSnapshots Tests ─────────────────────────────────

describe('setupAutoSnapshots', () => {
  it('automatically creates snapshots at interval boundaries', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const snapshotStorage = new MemorySnapshotStorage()
    const cache = new SnapshotCache(snapshotStorage, { interval: 3 })

    const unsub = setupAutoSnapshots(store, cache)

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 0 }
    })

    // Create changes to pass interval boundary (interval=3, count goes 1,2,3,4)
    for (let i = 1; i <= 5; i++) {
      await store.update(node.id, { properties: { count: i } })
    }

    unsub()

    // Should have created a snapshot at count=3 (change count 3)
    const snaps = await snapshotStorage.getSnapshots(node.id)
    expect(snaps.length).toBeGreaterThan(0)
    // At least one snapshot should exist at interval boundary
    expect(snaps.some((s) => s.changeIndex === 3 || s.changeIndex === 6)).toBe(true)
  })

  it('returns unsubscribe function that stops snapshotting', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const snapshotStorage = new MemorySnapshotStorage()
    const cache = new SnapshotCache(snapshotStorage, { interval: 2 })

    const unsub = setupAutoSnapshots(store, cache)
    unsub()

    await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 0 }
    })

    const allSnaps = await snapshotStorage.getAllSnapshots()
    expect(allSnaps).toHaveLength(0)
  })
})

// ─── UndoManager undoBatch Tests ──────────────────────────────

describe('UndoManager - undoBatch', () => {
  let store: NodeStore
  let did: DID
  let undo: UndoManager

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    did = test.did
    await store.initialize()
    undo = new UndoManager(store, did, { mergeInterval: 0 })
    undo.start()
  })

  it('undoes all changes in a batch', async () => {
    // Create two nodes, then batch-update them
    const node1 = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })
    const node2 = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 10 }
    })

    // Capture pre-change states
    const n1 = await store.get(node1.id)
    const n2 = await store.get(node2.id)
    undo.capturePreChangeState(node1.id, n1!.properties)
    undo.capturePreChangeState(node2.id, n2!.properties)

    // Execute a transaction (batch update)
    const result = await store.transaction([
      { type: 'update', nodeId: node1.id, options: { properties: { count: 99 } } },
      { type: 'update', nodeId: node2.id, options: { properties: { count: 99 } } }
    ])

    const batchId = result.batchId

    // Both should be 99 now
    expect((await store.get(node1.id))!.properties.count).toBe(99)
    expect((await store.get(node2.id))!.properties.count).toBe(99)

    // Undo the batch
    const undone = await undo.undoBatch(batchId)
    expect(undone).toBe(true)

    // Both should be reverted
    expect((await store.get(node1.id))!.properties.count).toBe(1)
    expect((await store.get(node2.id))!.properties.count).toBe(10)
  })

  it('returns false when batchId not found', async () => {
    const result = await undo.undoBatch('nonexistent-batch')
    expect(result).toBe(false)
  })
})

// ─── UndoManager delete/restore edge cases ────────────────────

describe('UndoManager - delete/restore', () => {
  let store: NodeStore
  let did: DID
  let undo: UndoManager

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    did = test.did
    await store.initialize()
    undo = new UndoManager(store, did, { mergeInterval: 0 })
    undo.start()
  })

  it('can undo a delete (restores the node)', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Keep Me' }
    })

    // Delete the node (soft delete)
    await store.delete(node.id)

    // Node should be soft-deleted
    const deleted = await store.get(node.id)
    expect(deleted!.deleted).toBe(true)

    // Undo the delete
    const undone = await undo.undo(node.id)
    expect(undone).toBe(true)

    // Node should be restored
    const restored = await store.get(node.id)
    expect(restored).not.toBeNull()
    expect(restored!.deleted).toBe(false)
    expect(restored!.properties.title).toBe('Keep Me')
  })

  it('can redo a delete after undoing it', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Test' }
    })

    await store.delete(node.id)
    await undo.undo(node.id)

    // Redo the delete
    await undo.redo(node.id)
    const result = await store.get(node.id)
    expect(result!.deleted).toBe(true)
  })
})

// ─── SchemaTimeline Tests ─────────────────────────────────────

describe('SchemaTimeline', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    await store.initialize()
  })

  it('merges timelines from multiple nodes of the same schema', async () => {
    const node1 = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Row 1' }
    })
    await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Row 2' }
    })
    await store.update(node1.id, { properties: { title: 'Row 1 updated' } })

    const schemaTimeline = new SchemaTimeline(adapter)
    const timeline = await schemaTimeline.getMergedTimeline(TEST_SCHEMA)

    // 3 total changes: 2 creates + 1 update
    expect(timeline).toHaveLength(3)
    // Should be sorted by lamport time
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].lamport.time).toBeGreaterThanOrEqual(timeline[i - 1].lamport.time)
    }
  })

  it('includes nodeId in each entry', async () => {
    const node1 = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Row 1' }
    })
    const node2 = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Row 2' }
    })

    const schemaTimeline = new SchemaTimeline(adapter)
    const timeline = await schemaTimeline.getMergedTimeline(TEST_SCHEMA)

    const nodeIds = new Set(timeline.map((e) => e.nodeId))
    expect(nodeIds.size).toBe(2)
    expect(nodeIds.has(node1.id)).toBe(true)
    expect(nodeIds.has(node2.id)).toBe(true)
  })

  it('returns empty for unknown schema', async () => {
    const schemaTimeline = new SchemaTimeline(adapter)
    const timeline = await schemaTimeline.getMergedTimeline(
      'xnet://xnet.fyi/NonExistent' as SchemaIRI
    )
    expect(timeline).toHaveLength(0)
  })

  it('does not mix schemas', async () => {
    await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Task' }
    })
    await store.create({
      schemaId: TEST_SCHEMA_2,
      properties: { title: 'Page' }
    })

    const schemaTimeline = new SchemaTimeline(adapter)
    const timeline = await schemaTimeline.getMergedTimeline(TEST_SCHEMA)
    expect(timeline).toHaveLength(1)
  })

  describe('materializeSchemaAt', () => {
    it('reconstructs all rows at a specific point', async () => {
      const node1 = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Row 1', count: 1 }
      })
      await store.update(node1.id, { properties: { count: 2 } })

      await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Row 2' }
      })

      const schemaTimeline = new SchemaTimeline(adapter)
      const timeline = await schemaTimeline.getMergedTimeline(TEST_SCHEMA)

      // At the end, both rows should exist
      const endRows = await schemaTimeline.materializeSchemaAt(timeline, timeline.length - 1)
      expect(endRows).toHaveLength(2)

      // At index 0 (first create), only one row should exist
      const startRows = await schemaTimeline.materializeSchemaAt(timeline, 0)
      expect(startRows).toHaveLength(1)
      expect(startRows[0].properties.title).toBe('Row 1')
    })

    it('handles deleted nodes (hides them)', async () => {
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Will delete' }
      })
      await store.delete(node.id)

      const schemaTimeline = new SchemaTimeline(adapter)
      const timeline = await schemaTimeline.getMergedTimeline(TEST_SCHEMA)

      // At the end (after delete), no rows visible
      const endRows = await schemaTimeline.materializeSchemaAt(timeline, timeline.length - 1)
      expect(endRows).toHaveLength(0)

      // At index 0 (before delete), row is visible
      const startRows = await schemaTimeline.materializeSchemaAt(timeline, 0)
      expect(startRows).toHaveLength(1)
    })

    it('returns empty for empty timeline', async () => {
      const schemaTimeline = new SchemaTimeline(adapter)
      const rows = await schemaTimeline.materializeSchemaAt([], 0)
      expect(rows).toHaveLength(0)
    })

    it('returns empty for out of range index', async () => {
      const schemaTimeline = new SchemaTimeline(adapter)
      const rows = await schemaTimeline.materializeSchemaAt([], -1)
      expect(rows).toHaveLength(0)
    })
  })
})

// ─── SchemaScrubCache Tests ───────────────────────────────────

describe('SchemaScrubCache', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    await store.initialize()
  })

  it('pre-computes and allows fast seeking', async () => {
    const node1 = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 1 }
    })
    await store.update(node1.id, { properties: { count: 2 } })
    await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 10 }
    })

    const schemaTimeline = new SchemaTimeline(adapter)
    const scrubCache = new SchemaScrubCache(2)
    await scrubCache.precompute(TEST_SCHEMA, schemaTimeline)

    expect(scrubCache.totalChanges).toBe(3)

    // At the end, both rows should exist
    const endRows = await scrubCache.getRowsAt(2, schemaTimeline)
    expect(endRows).toHaveLength(2)

    // At index 0, only one row
    const startRows = await scrubCache.getRowsAt(0, schemaTimeline)
    expect(startRows).toHaveLength(1)
  })

  it('returns empty for schema with no history', async () => {
    const schemaTimeline = new SchemaTimeline(adapter)
    const scrubCache = new SchemaScrubCache()
    await scrubCache.precompute('xnet://xnet.fyi/Empty' as SchemaIRI, schemaTimeline)

    expect(scrubCache.totalChanges).toBe(0)
    const rows = await scrubCache.getRowsAt(0, schemaTimeline)
    expect(rows).toHaveLength(0)
  })
})

// ─── restoreSchemaAt Tests ────────────────────────────────────

describe('restoreSchemaAt', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    await store.initialize()
  })

  it('restores schema state to a historical point', async () => {
    // Create and update rows
    const node1 = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Row 1', count: 1 }
    })
    const node2 = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Row 2', count: 10 }
    })

    // Update values
    await store.update(node1.id, { properties: { count: 99 } })
    await store.update(node2.id, { properties: { count: 99 } })

    // Get timeline
    const schemaTimeline = new SchemaTimeline(adapter)
    const timeline = await schemaTimeline.getMergedTimeline(TEST_SCHEMA)

    // Find the index right after both creates but before updates
    // Timeline: create node1, create node2, update node1, update node2
    const lastCreateIdx = timeline.findIndex(
      (e) => e.operation === 'create' && e.nodeId === node2.id
    )
    expect(lastCreateIdx).toBeGreaterThanOrEqual(0)

    // Restore to after both creates
    await restoreSchemaAt(store, schemaTimeline, timeline, lastCreateIdx, TEST_SCHEMA)

    // Values should be reverted
    const n1 = await store.get(node1.id)
    const n2 = await store.get(node2.id)
    expect(n1!.properties.count).toBe(1)
    expect(n2!.properties.count).toBe(10)
  })

  it('returns 0 when nothing to restore', async () => {
    const schemaTimeline = new SchemaTimeline(adapter)
    const timeline = await schemaTimeline.getMergedTimeline(TEST_SCHEMA)

    // Empty timeline - nothing to do
    const ops = await restoreSchemaAt(store, schemaTimeline, timeline, 0, TEST_SCHEMA)
    expect(ops).toBe(0)
  })
})

// ─── PruningEngine Tests ──────────────────────────────────────

describe('PruningEngine', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter & PrunableStorageAdapter
  let snapshotStorage: MemorySnapshotStorage
  let snapshotCache: SnapshotCache
  let verifier: VerificationEngine

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    // Add deleteChange method to the adapter for pruning
    const baseAdapter = test.adapter as MemoryNodeStorageAdapter
    const prunableAdapter = baseAdapter as MemoryNodeStorageAdapter & PrunableStorageAdapter
    prunableAdapter.deleteChange = async (hash: string) => {
      // Access internal changes map and filter out the hash from all nodes
      const changesMap = (baseAdapter as any).changes as Map<string, NodeChange[]>
      for (const [nodeId, changes] of changesMap) {
        const filtered = changes.filter((c: NodeChange) => c.hash !== hash)
        changesMap.set(nodeId, filtered)
      }
      // Also remove from hash index
      const hashMap = (baseAdapter as any).changesByHash as Map<string, NodeChange>
      hashMap.delete(hash)
    }
    adapter = prunableAdapter
    await store.initialize()

    snapshotStorage = new MemorySnapshotStorage()
    snapshotCache = new SnapshotCache(snapshotStorage, { interval: 5 })
    verifier = new VerificationEngine(adapter)
  })

  it('identifies candidates above threshold with snapshots', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 0 }
    })

    // Create many changes with old timestamps
    for (let i = 1; i <= 10; i++) {
      await store.update(node.id, { properties: { count: i } })
    }

    // Create a snapshot at index 5
    const changes = await adapter.getChanges(node.id)
    const { engine } = createHistoryEngine(adapter)
    const state = await engine.materializeAt(node.id, { type: 'index', index: 5 })
    await snapshotCache.save(node.id, 5, changes[5].hash, state.node)

    const pruner = new PruningEngine(adapter, snapshotCache, verifier, {
      ...DEFAULT_POLICY,
      pruneThreshold: 5,
      keepRecentChanges: 3,
      minAge: 0 // allow pruning immediately for testing
    })

    const candidates = await pruner.findCandidates()
    expect(candidates.length).toBeGreaterThanOrEqual(1)
    expect(candidates[0].nodeId).toBe(node.id)
    expect(candidates[0].prunableChanges).toBeGreaterThan(0)
  })

  it('skips nodes below pruneThreshold', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 0 }
    })
    await store.update(node.id, { properties: { count: 1 } })

    const pruner = new PruningEngine(adapter, snapshotCache, verifier, {
      ...DEFAULT_POLICY,
      pruneThreshold: 100
    })

    const candidates = await pruner.findCandidates()
    expect(candidates).toHaveLength(0)
  })

  it('skips protected schemas', async () => {
    const protectedSchema = 'xnet://xnet.fyi/Audit' as SchemaIRI
    const node = await store.create({
      schemaId: protectedSchema,
      properties: { count: 0 }
    })

    for (let i = 1; i <= 10; i++) {
      await store.update(node.id, { properties: { count: i } })
    }

    // Create snapshot
    const changes = await adapter.getChanges(node.id)
    const { engine } = createHistoryEngine(adapter)
    const state = await engine.materializeAt(node.id, { type: 'index', index: 5 })
    await snapshotCache.save(node.id, 5, changes[5].hash, state.node)

    const pruner = new PruningEngine(adapter, snapshotCache, verifier, {
      ...DEFAULT_POLICY,
      pruneThreshold: 5,
      minAge: 0,
      protectedSchemas: [protectedSchema]
    })

    const candidates = await pruner.findCandidates()
    expect(candidates).toHaveLength(0)
  })

  it('refuses to prune without snapshot', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 0 }
    })

    for (let i = 1; i <= 10; i++) {
      await store.update(node.id, { properties: { count: i } })
    }

    const pruner = new PruningEngine(adapter, snapshotCache, verifier, {
      ...DEFAULT_POLICY,
      pruneThreshold: 5,
      minAge: 0
    })

    await expect(pruner.pruneNode(node.id)).rejects.toThrow('no snapshot')
  })

  it('dryRun returns correct counts without deleting', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 0 }
    })

    for (let i = 1; i <= 10; i++) {
      await store.update(node.id, { properties: { count: i } })
    }

    // Create a snapshot
    const { engine } = createHistoryEngine(adapter)
    const state = await engine.materializeAt(node.id, { type: 'index', index: 5 })
    const changes = await adapter.getChanges(node.id)
    await snapshotCache.save(node.id, 5, changes[5].hash, state.node)

    const pruner = new PruningEngine(adapter, snapshotCache, verifier, {
      ...DEFAULT_POLICY,
      pruneThreshold: 5,
      keepRecentChanges: 3,
      minAge: 0,
      requireVerifiedSnapshot: false
    })

    const beforeCount = (await adapter.getAllChanges()).length
    const result = await pruner.pruneNode(node.id, { dryRun: true })

    expect(result.deletedChanges).toBeGreaterThan(0)
    // Verify nothing was actually deleted
    const afterCount = (await adapter.getAllChanges()).length
    expect(afterCount).toBe(beforeCount)
  })

  it('getStorageMetrics returns accurate counts', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { count: 0 }
    })

    for (let i = 1; i <= 5; i++) {
      await store.update(node.id, { properties: { count: i } })
    }

    const pruner = new PruningEngine(adapter, snapshotCache, verifier)
    const metrics = await pruner.getStorageMetrics(node.id)

    expect(metrics.totalChanges).toBe(6) // create + 5 updates
    expect(metrics.estimatedSize).toBe(6 * 512)
    expect(metrics.hasSnapshot).toBe(false)
  })

  it('policies have correct defaults', () => {
    expect(DEFAULT_POLICY.keepRecentChanges).toBe(200)
    expect(DEFAULT_POLICY.minAge).toBe(30 * 24 * 60 * 60 * 1000)
    expect(MOBILE_POLICY.keepRecentChanges).toBe(50)
    expect(MOBILE_POLICY.storageBudget).toBe(50 * 1024 * 1024)
  })
})

// ─── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter

  beforeEach(async () => {
    const test = createTestStore()
    store = test.store
    adapter = test.adapter
    await store.initialize()
  })

  it('handles empty timeline in getTimeline', async () => {
    const { engine } = createHistoryEngine(adapter)
    // A nonexistent node returns empty array
    const timeline = await engine.getTimeline('nonexistent')
    expect(timeline).toHaveLength(0)
  })

  it('handles single change in timeline', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Single' }
    })

    const { engine } = createHistoryEngine(adapter)
    const timeline = await engine.getTimeline(node.id)
    expect(timeline).toHaveLength(1)
    expect(timeline[0].operation).toBe('create')
  })

  it('handles schema with no nodes', async () => {
    const schemaTimeline = new SchemaTimeline(adapter)
    const timeline = await schemaTimeline.getMergedTimeline('xnet://xnet.fyi/Empty' as SchemaIRI)
    expect(timeline).toHaveLength(0)
  })

  it('ScrubCache handles empty node', async () => {
    const scrub = new ScrubCache()
    await scrub.precompute('nonexistent', adapter)
    expect(scrub.totalChanges).toBe(0)
    expect(scrub.getStateAt(0)).toBeNull()
  })

  it('PlaybackEngine handles 0 changes', () => {
    const pb = new PlaybackEngine(0)
    expect(pb.getPosition()).toBe(0)
    pb.stepForward()
    expect(pb.getPosition()).toBe(0)
  })

  it('PlaybackEngine handles 1 change', () => {
    const pb = new PlaybackEngine(1)
    expect(pb.getPosition()).toBe(0)
    pb.stepForward()
    expect(pb.getPosition()).toBe(0)
    pb.jumpToEnd()
    expect(pb.getPosition()).toBe(0)
  })

  it('DiffEngine handles diffing identical states', async () => {
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Same' }
    })

    const { engine } = createHistoryEngine(adapter)
    const diffEngine = new DiffEngine(engine)
    const result = await diffEngine.diffNode(
      node.id,
      { type: 'index', index: 0 },
      { type: 'index', index: 0 }
    )
    expect(result.diffs).toHaveLength(0)
    expect(result.summary.added).toBe(0)
    expect(result.summary.modified).toBe(0)
    expect(result.summary.removed).toBe(0)
  })
})
