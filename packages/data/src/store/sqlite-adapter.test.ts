/**
 * Tests for SQLiteNodeStorageAdapter
 */

import type { NodeState, NodeChange, NodePayload } from './types'
import type { SchemaIRI } from '../schema/node'
import type { DID, ContentId } from '@xnetjs/core'
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SQLiteNodeStorageAdapter } from './sqlite-adapter'

describe('SQLiteNodeStorageAdapter', () => {
  let db: SQLiteAdapter
  let adapter: SQLiteNodeStorageAdapter

  const testDID = 'did:key:z6MkhaXgBZDvotDkL5LZnkwPDYr4E4Nfy5sQk5YJqRhEjLRs' as DID
  const testSchemaId = 'xnet://xnet.fyi/Page' as SchemaIRI

  beforeEach(async () => {
    db = await createMemorySQLiteAdapter()
    adapter = new SQLiteNodeStorageAdapter(db)
  })

  afterEach(async () => {
    await db.close()
  })

  // ─── Node CRUD Operations ────────────────────────────────────────────────────

  describe('Node CRUD', () => {
    it('creates and retrieves a node', async () => {
      const now = Date.now()
      const node: NodeState = {
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'Test Page' },
        timestamps: {
          title: { lamport: { time: 1, author: testDID }, wallTime: now }
        },
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      }

      await adapter.setNode(node)
      const retrieved = await adapter.getNode('node-1')

      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe('node-1')
      expect(retrieved!.schemaId).toBe(testSchemaId)
      expect(retrieved!.properties.title).toBe('Test Page')
    })

    it('returns null for non-existent node', async () => {
      const node = await adapter.getNode('nonexistent')
      expect(node).toBeNull()
    })

    it('updates existing node properties', async () => {
      const now = Date.now()

      const node: NodeState = {
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'Original' },
        timestamps: {
          title: { lamport: { time: 1, author: testDID }, wallTime: now }
        },
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      }

      await adapter.setNode(node)

      // Update with higher lamport time
      node.properties.title = 'Updated'
      node.timestamps.title = { lamport: { time: 2, author: testDID }, wallTime: now + 1000 }
      node.updatedAt = now + 1000

      await adapter.setNode(node)

      const retrieved = await adapter.getNode('node-1')
      expect(retrieved!.properties.title).toBe('Updated')
    })

    it('respects LWW for concurrent updates - higher lamport wins', async () => {
      const now = Date.now()

      // First write with higher lamport time
      await adapter.setNode({
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'First (higher lamport)' },
        timestamps: {
          title: { lamport: { time: 5, author: testDID }, wallTime: now }
        },
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      })

      // Second write with LOWER lamport time (should be ignored for that property)
      await adapter.setNode({
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'Second (lower lamport)' },
        timestamps: {
          title: { lamport: { time: 3, author: testDID }, wallTime: now + 1000 }
        },
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now + 1000,
        updatedBy: testDID
      })

      const retrieved = await adapter.getNode('node-1')
      expect(retrieved!.properties.title).toBe('First (higher lamport)')
    })

    it('allows new property with lower lamport if property is new', async () => {
      const now = Date.now()

      // First write with title
      await adapter.setNode({
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'Test' },
        timestamps: {
          title: { lamport: { time: 5, author: testDID }, wallTime: now }
        },
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      })

      // Add new property (description)
      await adapter.setNode({
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'Test', description: 'A description' },
        timestamps: {
          title: { lamport: { time: 5, author: testDID }, wallTime: now },
          description: { lamport: { time: 1, author: testDID }, wallTime: now + 1000 }
        },
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now + 1000,
        updatedBy: testDID
      })

      const retrieved = await adapter.getNode('node-1')
      expect(retrieved!.properties.title).toBe('Test')
      expect(retrieved!.properties.description).toBe('A description')
    })

    it('deletes a node', async () => {
      const now = Date.now()

      await adapter.setNode({
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'To Delete' },
        timestamps: {
          title: { lamport: { time: 1, author: testDID }, wallTime: now }
        },
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      })

      await adapter.deleteNode('node-1')
      const retrieved = await adapter.getNode('node-1')

      expect(retrieved).toBeNull()
    })

    it('handles soft-deleted nodes correctly', async () => {
      const now = Date.now()

      await adapter.setNode({
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'Soft Deleted' },
        timestamps: {
          title: { lamport: { time: 1, author: testDID }, wallTime: now }
        },
        deleted: true,
        deletedAt: { lamport: { time: 2, author: testDID }, wallTime: now + 1000 },
        createdAt: now,
        createdBy: testDID,
        updatedAt: now + 1000,
        updatedBy: testDID
      })

      const retrieved = await adapter.getNode('node-1')
      expect(retrieved).not.toBeNull()
      expect(retrieved!.deleted).toBe(true)
    })
  })

  // ─── List Nodes ──────────────────────────────────────────────────────────────

  describe('listNodes', () => {
    beforeEach(async () => {
      const now = Date.now()

      // Create test nodes
      for (let i = 0; i < 10; i++) {
        await adapter.setNode({
          id: `node-${i}`,
          schemaId: i % 2 === 0 ? testSchemaId : ('xnet://xnet.fyi/Database' as SchemaIRI),
          properties: { title: `Node ${i}` },
          timestamps: {
            title: { lamport: { time: i, author: testDID }, wallTime: now + i * 1000 }
          },
          deleted: i === 9, // Last one is soft-deleted
          deletedAt:
            i === 9 ? { lamport: { time: 10, author: testDID }, wallTime: now + 10000 } : undefined,
          createdAt: now,
          createdBy: testDID,
          updatedAt: now + i * 1000,
          updatedBy: testDID
        })
      }
    })

    it('lists all non-deleted nodes', async () => {
      const nodes = await adapter.listNodes()
      expect(nodes).toHaveLength(9)
    })

    it('includes deleted nodes when requested', async () => {
      const nodes = await adapter.listNodes({ includeDeleted: true })
      expect(nodes).toHaveLength(10)
    })

    it('filters by schemaId', async () => {
      const nodes = await adapter.listNodes({ schemaId: testSchemaId })
      // Even indices: 0, 2, 4, 6, 8 - but 8 is node-8 which is not deleted
      expect(nodes).toHaveLength(5)
      for (const node of nodes) {
        expect(node.schemaId).toBe(testSchemaId)
      }
    })

    it('supports pagination with limit', async () => {
      const page1 = await adapter.listNodes({ limit: 3 })
      expect(page1).toHaveLength(3)
    })

    it('supports pagination with offset', async () => {
      const page1 = await adapter.listNodes({ limit: 3, offset: 0 })
      const page2 = await adapter.listNodes({ limit: 3, offset: 3 })

      expect(page1).toHaveLength(3)
      expect(page2).toHaveLength(3)
      expect(page1[0].id).not.toBe(page2[0].id)
    })

    it('returns nodes ordered by updated_at descending', async () => {
      const nodes = await adapter.listNodes()
      // Most recently updated should be first
      for (let i = 0; i < nodes.length - 1; i++) {
        expect(nodes[i].updatedAt).toBeGreaterThanOrEqual(nodes[i + 1].updatedAt)
      }
    })
  })

  // ─── Count Nodes ─────────────────────────────────────────────────────────────

  describe('countNodes', () => {
    beforeEach(async () => {
      const now = Date.now()

      for (let i = 0; i < 5; i++) {
        await adapter.setNode({
          id: `node-${i}`,
          schemaId: i % 2 === 0 ? testSchemaId : ('xnet://xnet.fyi/Database' as SchemaIRI),
          properties: {},
          timestamps: {},
          deleted: i === 4, // Last one is soft-deleted
          deletedAt: i === 4 ? { lamport: { time: 5, author: testDID }, wallTime: now } : undefined,
          createdAt: now,
          createdBy: testDID,
          updatedAt: now,
          updatedBy: testDID
        })
      }
    })

    it('counts non-deleted nodes', async () => {
      const count = await adapter.countNodes()
      expect(count).toBe(4)
    })

    it('counts all nodes including deleted', async () => {
      const count = await adapter.countNodes({ includeDeleted: true })
      expect(count).toBe(5)
    })

    it('counts nodes by schema', async () => {
      const count = await adapter.countNodes({ schemaId: testSchemaId })
      expect(count).toBe(2) // 0, 2 (4 is deleted)
    })
  })

  // ─── Change Operations ───────────────────────────────────────────────────────

  describe('Changes', () => {
    const createTestChange = (
      hash: string,
      nodeId: string,
      lamportTime: number,
      properties: Record<string, unknown> = {}
    ): NodeChange => ({
      id: hash,
      type: 'node',
      hash: `cid:blake3:${hash}` as ContentId,
      payload: {
        nodeId,
        schemaId: testSchemaId,
        properties
      } as NodePayload,
      lamport: { time: lamportTime, author: testDID },
      wallTime: Date.now(),
      authorDID: testDID,
      parentHash: null,
      signature: new Uint8Array([1, 2, 3])
    })

    // Helper to create a node for FK constraints
    const createNodeForChange = async (nodeId: string) => {
      const now = Date.now()
      await adapter.setNode({
        id: nodeId,
        schemaId: testSchemaId,
        properties: {},
        timestamps: {},
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      })
    }

    it('appends and retrieves changes', async () => {
      await createNodeForChange('node-1')
      const change = createTestChange('hash-1', 'node-1', 1, { title: 'Test' })

      await adapter.appendChange(change)
      const changes = await adapter.getChanges('node-1')

      expect(changes).toHaveLength(1)
      expect(changes[0].hash).toBe('cid:blake3:hash-1')
      expect(changes[0].payload.properties).toEqual({ title: 'Test' })
    })

    it('getAllChanges returns all changes', async () => {
      await createNodeForChange('node-1')
      await createNodeForChange('node-2')

      await adapter.appendChange(createTestChange('hash-1', 'node-1', 1))
      await adapter.appendChange(createTestChange('hash-2', 'node-2', 2))
      await adapter.appendChange(createTestChange('hash-3', 'node-1', 3))

      const changes = await adapter.getAllChanges()
      expect(changes).toHaveLength(3)
    })

    it('getChangesSince returns changes after lamport time', async () => {
      await createNodeForChange('node-1')

      for (let i = 1; i <= 5; i++) {
        await adapter.appendChange(createTestChange(`hash-${i}`, 'node-1', i))
      }

      const changes = await adapter.getChangesSince(3)
      expect(changes).toHaveLength(2) // Changes 4 and 5
      expect(changes[0].lamport.time).toBe(4)
      expect(changes[1].lamport.time).toBe(5)
    })

    it('getChangeByHash returns specific change', async () => {
      await createNodeForChange('node-1')
      await adapter.appendChange(createTestChange('hash-1', 'node-1', 1))

      const change = await adapter.getChangeByHash('cid:blake3:hash-1' as ContentId)
      expect(change).not.toBeNull()
      expect(change!.hash).toBe('cid:blake3:hash-1')
    })

    it('getChangeByHash returns null for non-existent', async () => {
      const change = await adapter.getChangeByHash('cid:blake3:nonexistent' as ContentId)
      expect(change).toBeNull()
    })

    it('getLastChange returns most recent change for node', async () => {
      await createNodeForChange('node-1')

      await adapter.appendChange(createTestChange('hash-1', 'node-1', 1))
      await adapter.appendChange(createTestChange('hash-2', 'node-1', 5))
      await adapter.appendChange(createTestChange('hash-3', 'node-1', 3))

      const lastChange = await adapter.getLastChange('node-1')
      expect(lastChange).not.toBeNull()
      expect(lastChange!.lamport.time).toBe(5)
    })

    it('deduplicates changes by hash', async () => {
      await createNodeForChange('node-1')
      const change = createTestChange('same-hash', 'node-1', 1)

      await adapter.appendChange(change)
      await adapter.appendChange(change) // Duplicate

      const changes = await adapter.getAllChanges()
      expect(changes).toHaveLength(1)
    })

    it('preserves batch information', async () => {
      await createNodeForChange('node-1')
      const change: NodeChange = {
        ...createTestChange('hash-1', 'node-1', 1),
        batchId: 'batch-123',
        batchIndex: 0,
        batchSize: 2
      }

      await adapter.appendChange(change)
      const retrieved = await adapter.getChangeByHash(change.hash)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.batchId).toBe('batch-123')
    })
  })

  // ─── Sync State ──────────────────────────────────────────────────────────────

  describe('Sync State', () => {
    it('tracks lamport time', async () => {
      await adapter.setLastLamportTime(100)
      const time = await adapter.getLastLamportTime()

      expect(time).toBe(100)
    })

    it('returns 0 for unset lamport time', async () => {
      const time = await adapter.getLastLamportTime()
      expect(time).toBe(0)
    })

    it('updates lamport time', async () => {
      await adapter.setLastLamportTime(50)
      await adapter.setLastLamportTime(100)
      const time = await adapter.getLastLamportTime()

      expect(time).toBe(100)
    })
  })

  // ─── Document Content (Yjs) ──────────────────────────────────────────────────

  describe('Document Content', () => {
    // Helper to create a node for FK constraints
    const createNodeForYjs = async (nodeId: string) => {
      const now = Date.now()
      await adapter.setNode({
        id: nodeId,
        schemaId: testSchemaId,
        properties: {},
        timestamps: {},
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      })
    }

    it('stores and retrieves Yjs state', async () => {
      await createNodeForYjs('node-1')
      const content = new Uint8Array([1, 2, 3, 4, 5])

      await adapter.setDocumentContent('node-1', content)
      const retrieved = await adapter.getDocumentContent('node-1')

      expect(retrieved).toEqual(content)
    })

    it('returns null for non-existent document', async () => {
      const content = await adapter.getDocumentContent('nonexistent')
      expect(content).toBeNull()
    })

    it('updates existing document content', async () => {
      await createNodeForYjs('node-1')
      const content1 = new Uint8Array([1, 2, 3])
      const content2 = new Uint8Array([4, 5, 6, 7])

      await adapter.setDocumentContent('node-1', content1)
      await adapter.setDocumentContent('node-1', content2)
      const retrieved = await adapter.getDocumentContent('node-1')

      expect(retrieved).toEqual(content2)
    })
  })

  // ─── Yjs Snapshots ───────────────────────────────────────────────────────────

  describe('Yjs Snapshots', () => {
    // Helper to create a node for FK constraints
    const createNodeForSnapshots = async (nodeId: string) => {
      const now = Date.now()
      await adapter.setNode({
        id: nodeId,
        schemaId: testSchemaId,
        properties: {},
        timestamps: {},
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      })
    }

    it('saves and retrieves snapshots', async () => {
      await createNodeForSnapshots('node-1')
      const snapshot = {
        nodeId: 'node-1',
        timestamp: Date.now(),
        snapshot: new Uint8Array([1, 2, 3]),
        docState: new Uint8Array([4, 5, 6]),
        byteSize: 6
      }

      await adapter.saveYjsSnapshot(snapshot)
      const snapshots = await adapter.getYjsSnapshots('node-1')

      expect(snapshots).toHaveLength(1)
      expect(snapshots[0].snapshot).toEqual(new Uint8Array([1, 2, 3]))
      expect(snapshots[0].docState).toEqual(new Uint8Array([4, 5, 6]))
    })

    it('retrieves multiple snapshots in order', async () => {
      await createNodeForSnapshots('node-1')
      const now = Date.now()

      for (let i = 0; i < 3; i++) {
        await adapter.saveYjsSnapshot({
          nodeId: 'node-1',
          timestamp: now + i * 1000,
          snapshot: new Uint8Array([i]),
          docState: new Uint8Array([i + 10]),
          byteSize: 2
        })
      }

      const snapshots = await adapter.getYjsSnapshots('node-1')
      expect(snapshots).toHaveLength(3)
      // Should be ordered by timestamp ASC
      expect(snapshots[0].timestamp).toBeLessThan(snapshots[1].timestamp)
      expect(snapshots[1].timestamp).toBeLessThan(snapshots[2].timestamp)
    })

    it('deletes snapshots for a node', async () => {
      await createNodeForSnapshots('node-1')
      await adapter.saveYjsSnapshot({
        nodeId: 'node-1',
        timestamp: Date.now(),
        snapshot: new Uint8Array([1]),
        docState: new Uint8Array([2]),
        byteSize: 2
      })

      await adapter.deleteYjsSnapshots('node-1')
      const snapshots = await adapter.getYjsSnapshots('node-1')

      expect(snapshots).toHaveLength(0)
    })
  })

  // ─── Bulk Operations ─────────────────────────────────────────────────────────

  describe('Bulk Operations', () => {
    it('imports multiple nodes atomically', async () => {
      const now = Date.now()
      const nodes: NodeState[] = []

      for (let i = 0; i < 50; i++) {
        nodes.push({
          id: `node-${i}`,
          schemaId: testSchemaId,
          properties: { title: `Node ${i}` },
          timestamps: {
            title: { lamport: { time: i, author: testDID }, wallTime: now }
          },
          deleted: false,
          createdAt: now,
          createdBy: testDID,
          updatedAt: now,
          updatedBy: testDID
        })
      }

      await adapter.importNodes(nodes)

      const count = await adapter.countNodes()
      expect(count).toBe(50)
    })

    it('imports multiple changes atomically', async () => {
      // First create the nodes for FK constraints
      const now = Date.now()
      for (let i = 0; i < 5; i++) {
        await adapter.setNode({
          id: `node-${i}`,
          schemaId: testSchemaId,
          properties: {},
          timestamps: {},
          deleted: false,
          createdAt: now,
          createdBy: testDID,
          updatedAt: now,
          updatedBy: testDID
        })
      }

      const changes: NodeChange[] = []

      for (let i = 0; i < 20; i++) {
        changes.push({
          id: `change-${i}`,
          type: 'node',
          hash: `cid:blake3:hash-${i}` as ContentId,
          payload: {
            nodeId: `node-${i % 5}`,
            properties: { value: i }
          } as NodePayload,
          lamport: { time: i, author: testDID },
          wallTime: Date.now(),
          authorDID: testDID,
          parentHash: null,
          signature: new Uint8Array([i])
        })
      }

      await adapter.importChanges(changes)

      const allChanges = await adapter.getAllChanges()
      expect(allChanges).toHaveLength(20)
    })

    it('clears all data', async () => {
      const now = Date.now()

      // Create some data
      await adapter.setNode({
        id: 'node-1',
        schemaId: testSchemaId,
        properties: {},
        timestamps: {},
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      })
      await adapter.setDocumentContent('node-1', new Uint8Array([1, 2, 3]))
      await adapter.setLastLamportTime(100)

      await adapter.clear()

      const count = await adapter.countNodes({ includeDeleted: true })
      const lamport = await adapter.getLastLamportTime()

      expect(count).toBe(0)
      expect(lamport).toBe(0)
    })
  })

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('throws if database is not open', async () => {
      const closedDb = await createMemorySQLiteAdapter()
      await closedDb.close()

      const closedAdapter = new SQLiteNodeStorageAdapter(closedDb)

      await expect(closedAdapter.open()).rejects.toThrow('SQLiteAdapter must be opened before use')
    })

    it('open succeeds if database is already open', async () => {
      // db is already open from beforeEach
      await expect(adapter.open()).resolves.not.toThrow()
    })

    it('close does not close the shared database', async () => {
      await adapter.close()
      // The underlying db should still be open
      expect(db.isOpen()).toBe(true)
    })
  })
})
