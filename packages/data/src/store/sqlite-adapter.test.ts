/**
 * Tests for SQLiteNodeStorageAdapter
 */

import type { NodeQueryDescriptor } from './query'
import type { NodeState, NodeChange, NodePayload } from './types'
import type { SchemaIRI } from '../schema/node'
import type { DID, ContentId } from '@xnetjs/core'
import type { SQLiteAdapter, SQLiteNodeBatchApplyInput } from '@xnetjs/sqlite'
import { randomUUID } from 'crypto'
import { existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createElectronSQLiteAdapter } from '@xnetjs/sqlite/electron'
import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
import { createChangeId, createUnsignedChange, signChange, verifyChangeHash } from '@xnetjs/sync'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SYSTEM_SCHEMA_BASE_IRIS } from '../schema/schemas/system'
import { encodeNodeQueryCursor } from './query'
import { SQLiteNodeStorageAdapter } from './sqlite-adapter'

function getTestDbPath(): string {
  return join(tmpdir(), `xnet-data-spatial-${randomUUID()}.db`)
}

function cleanupDb(path: string): void {
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch {
      // Ignore cleanup errors.
    }
  }
}

function isNativeSQLiteLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('better_sqlite3.node') ||
    message.includes('incompatible architecture') ||
    message.includes('Cannot find module')
  )
}

async function createNativeSQLiteAdapterOrNull(path: string): Promise<SQLiteAdapter | null> {
  try {
    return await createElectronSQLiteAdapter({ path })
  } catch (error) {
    cleanupDb(path)
    if (isNativeSQLiteLoadError(error)) {
      return null
    }
    throw error
  }
}

describe('SQLiteNodeStorageAdapter', () => {
  let db: SQLiteAdapter
  let adapter: SQLiteNodeStorageAdapter

  const testDID = 'did:key:z6MkhaXgBZDvotDkL5LZnkwPDYr4E4Nfy5sQk5YJqRhEjLRs' as DID
  const testSchemaId = 'xnet://xnet.fyi/Page' as SchemaIRI
  const taskSchemaId = 'xnet://xnet.fyi/Task' as SchemaIRI

  function createTestNode(input: {
    id: string
    schemaId?: SchemaIRI
    properties?: Record<string, unknown>
    deleted?: boolean
    createdAt?: number
    updatedAt?: number
  }): NodeState {
    const now = input.createdAt ?? Date.now()
    const properties = input.properties ?? {}

    return {
      id: input.id,
      schemaId: input.schemaId ?? testSchemaId,
      properties,
      timestamps: Object.fromEntries(
        Object.keys(properties).map((key, index) => [
          key,
          {
            lamport: index + 1,
            author: testDID,
            wallTime: input.updatedAt ?? now
          }
        ])
      ),
      deleted: input.deleted ?? false,
      deletedAt: input.deleted
        ? { lamport: 99, author: testDID, wallTime: input.updatedAt ?? now }
        : undefined,
      createdAt: now,
      createdBy: testDID,
      updatedAt: input.updatedAt ?? now,
      updatedBy: testDID
    }
  }

  function createTestChange(input: {
    id: string
    nodeId: string
    schemaId?: SchemaIRI
    properties?: Record<string, unknown>
    lamportTime: number
    batchId: string
  }): NodeChange {
    const now = Date.now()
    return {
      id: input.id,
      type: 'node',
      hash: `cid:blake3:${input.id}` as ContentId,
      payload: {
        nodeId: input.nodeId,
        ...(input.schemaId ? { schemaId: input.schemaId } : {}),
        properties: input.properties ?? {}
      } as NodePayload,
      lamport: input.lamportTime,
      wallTime: now,
      authorDID: testDID,
      parentHash: null,
      batchId: input.batchId,
      batchIndex: 0,
      batchSize: 1,
      signature: new Uint8Array([1, 2, 3])
    }
  }

  async function ensureFtsTable(): Promise<boolean> {
    try {
      await db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
        node_id,
        title,
        content,
        tokenize='porter unicode61'
      )`)
      return true
    } catch {
      return false
    }
  }

  beforeEach(async () => {
    db = await createMemorySQLiteAdapter()
    // Parity verification and plan diagnostics are off by default in
    // production; the test suite opts back in to keep the safety net.
    adapter = new SQLiteNodeStorageAdapter(db, {
      queryVerification: { enabled: true },
      queryDiagnostics: true
    })
  })

  /**
   * Pay a fresh adapter's one-time pre-v8 column repair (0305) — a PRAGMA on
   * the first node_properties read — then clear the query log, so RPC-count
   * assertions measure the steady state.
   */
  async function primeColumnRepair(
    target: SQLiteNodeStorageAdapter,
    queries: string[]
  ): Promise<void> {
    await target.getNode('prime-column-repair')
    queries.length = 0
  }

  afterEach(async () => {
    await db.close()
  })

  describe('sync cursor (0206)', () => {
    it('returns 0 for an unknown room', async () => {
      expect(await adapter.getSyncCursor('room-a')).toBe(0)
    })

    it('persists and reads back a per-room cursor', async () => {
      await adapter.setSyncCursor('room-a', 42)
      await adapter.setSyncCursor('room-b', 7)
      expect(await adapter.getSyncCursor('room-a')).toBe(42)
      expect(await adapter.getSyncCursor('room-b')).toBe(7)
    })

    it('is monotonic — never moves the cursor backwards', async () => {
      await adapter.setSyncCursor('room-a', 100)
      await adapter.setSyncCursor('room-a', 50) // stale ack must not regress
      expect(await adapter.getSyncCursor('room-a')).toBe(100)
      await adapter.setSyncCursor('room-a', 150)
      expect(await adapter.getSyncCursor('room-a')).toBe(150)
    })
  })

  describe('change-record envelope (0272)', () => {
    // The changes table has no columns for id/type/protocolVersion/batch
    // fields, yet they are hashed content: without the payload envelope a
    // re-read change can never pass verifyChangeHash, so the reload-resync
    // push (getChangesSince → hub) was rejected as INVALID_HASH and the 0224
    // breaker stranded offline edits.
    function makeRealSignedChange(): NodeChange {
      const { privateKey } = generateSigningKeyPair()
      const identity = identityFromPrivateKey(privateKey)
      const unsigned = createUnsignedChange({
        id: createChangeId(),
        type: 'node-change',
        payload: {
          nodeId: 'envelope-node',
          schemaId: testSchemaId,
          properties: { title: 'hello', count: 3 }
        } as NodePayload,
        parentHash: null,
        authorDID: identity.did as DID,
        lamport: 41,
        batchId: 'envelope-batch',
        batchIndex: 0,
        batchSize: 1
      })
      return signChange(unsigned, privateKey) as NodeChange
    }

    it('a change re-read from the log still passes verifyChangeHash', async () => {
      const change = makeRealSignedChange()
      expect(verifyChangeHash(change)).toBe(true)

      // changes.node_id has a FK to nodes(id) — materialize the node first.
      await adapter.setNode(createTestNode({ id: 'envelope-node' }))
      await adapter.appendChange(change)
      const [reread] = await adapter.getAllChanges()

      expect(reread.id).toBe(change.id)
      expect(reread.type).toBe('node-change')
      expect(reread.protocolVersion).toBe(change.protocolVersion)
      expect(reread.batchId).toBe('envelope-batch')
      expect(reread.batchIndex).toBe(0)
      expect(reread.batchSize).toBe(1)
      expect(reread.payload).toEqual(change.payload)
      expect(verifyChangeHash(reread)).toBe(true)
    })

    it('round-trips through the applyNodeBatch change path too', async () => {
      const change = makeRealSignedChange()
      await adapter.applyNodeBatch({
        batchId: 'envelope-batch',
        nodes: [
          createTestNode({
            id: 'envelope-node',
            properties: { title: 'hello', count: 3 }
          })
        ],
        changes: [change],
        lastLamportTime: change.lamport,
        affectedSchemaIds: [testSchemaId],
        indexMode: 'touched',
        indexProperties: true
      })
      const reread = await adapter.getLastChange('envelope-node')
      expect(reread).not.toBeNull()
      expect(verifyChangeHash(reread!)).toBe(true)
    })

    it('legacy rows (raw payload, no envelope) keep the historical fallback fields', async () => {
      const change = makeRealSignedChange()
      await adapter.setNode(createTestNode({ id: 'envelope-node' }))
      // Simulate a row written before the envelope existed: payload only.
      await db.run(
        `INSERT INTO changes
         (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          change.hash,
          change.payload.nodeId,
          new TextEncoder().encode(JSON.stringify(change.payload)),
          change.lamport,
          change.authorDID,
          change.wallTime,
          change.authorDID,
          null,
          null,
          change.signature
        ]
      )
      const [reread] = await adapter.getAllChanges()
      // Identity fields were never persisted, so the fallback fabricates them
      // (hash-as-id, type 'node') exactly as before the envelope…
      expect(reread.id).toBe(change.hash)
      expect(reread.type).toBe('node')
      expect(reread.payload).toEqual(change.payload)
      // …which is precisely why legacy rows cannot re-verify.
      expect(verifyChangeHash(reread)).toBe(false)
    })
  })

  describe('app state (0227)', () => {
    it('returns null for an unknown key', async () => {
      expect(await adapter.getAppState('_xnet_tracked_nodes')).toBeNull()
    })

    it('round-trips a value under a synthetic (non-node) key without an FK error', async () => {
      // The sync registry persists under `_xnet_tracked_nodes`, which is not a
      // real node — the old setDocumentContent path failed yjs_state's FK.
      const json = JSON.stringify([{ nodeId: 'n1', schemaId: 's', pinned: false }])
      await adapter.setAppState('_xnet_tracked_nodes', json)
      expect(await adapter.getAppState('_xnet_tracked_nodes')).toBe(json)
    })

    it('overwrites on repeated set', async () => {
      await adapter.setAppState('k', 'first')
      await adapter.setAppState('k', 'second')
      expect(await adapter.getAppState('k')).toBe('second')
    })

    it('does not collide with sync cursors using a similar key', async () => {
      await adapter.setSyncCursor('k', 99)
      await adapter.setAppState('k', 'value')
      expect(await adapter.getAppState('k')).toBe('value')
      expect(await adapter.getSyncCursor('k')).toBe(99)
    })
  })

  describe('change-log compaction (0254)', () => {
    // Materialize a node whose current LWW winners are the given per-property
    // { value, lamport } pairs, so `node_properties` provenance is exact.
    async function materialize(
      id: string,
      props: Record<string, { value: unknown; lamport: number }>
    ): Promise<void> {
      const now = Date.now()
      await adapter.setNode({
        id,
        schemaId: testSchemaId,
        properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.value])),
        timestamps: Object.fromEntries(
          Object.entries(props).map(([k, v]) => [
            k,
            { lamport: v.lamport, author: testDID, wallTime: now }
          ])
        ),
        deleted: false,
        createdAt: now,
        createdBy: testDID,
        updatedAt: now,
        updatedBy: testDID
      })
    }

    async function appendHistory(
      nodeId: string,
      rows: Array<{ id: string; property: string; value: unknown; lamport: number }>
    ): Promise<void> {
      for (const r of rows) {
        await adapter.appendChange(
          createTestChange({
            id: r.id,
            nodeId,
            properties: { [r.property]: r.value },
            lamportTime: r.lamport,
            batchId: 'compact'
          })
        )
      }
    }

    it('prunes superseded history but keeps per-node tips and live-value backers', async () => {
      const N = 'compact-N'
      // Current winners: q@1 (a NON-tip winner) and p@3 (the tip).
      await materialize(N, { q: { value: 'qv', lamport: 1 }, p: { value: 'p-final', lamport: 3 } })
      await appendHistory(N, [
        { id: 'cN-q1', property: 'q', value: 'qv', lamport: 1 }, // winner for q, non-tip
        { id: 'cN-p2', property: 'p', value: 'p-old', lamport: 2 }, // superseded
        { id: 'cN-p3', property: 'p', value: 'p-final', lamport: 3 } // winner for p, tip
      ])

      const { deleted } = await adapter.pruneSupersededChanges(100)

      // Only the superseded p@2 goes; the still-winning non-tip q@1 stays (K3),
      // and the tip p@3 stays (K2) — so reads and re-push remain intact.
      expect(deleted).toBe(1)
      const remaining = (await adapter.getChanges(N)).map((c) => c.hash)
      expect(remaining).toEqual(['cid:blake3:cN-q1', 'cid:blake3:cN-p3'])
      // The tip getLastChange returns is unchanged, so parentHash chaining holds.
      expect((await adapter.getLastChange(N))?.hash).toBe('cid:blake3:cN-p3')
    })

    it('never drops the unconfirmed tail (rows at/above wsafe), even if superseded', async () => {
      const T = 'compact-T'
      await materialize(T, { p: { value: 'p12', lamport: 12 } })
      await appendHistory(T, [
        { id: 'cT-10', property: 'p', value: 'p10', lamport: 10 }, // superseded, below floor
        { id: 'cT-11', property: 'p', value: 'p11', lamport: 11 }, // superseded, IN the tail
        { id: 'cT-12', property: 'p', value: 'p12', lamport: 12 } // winner + tip
      ])

      const { deleted } = await adapter.pruneSupersededChanges(11)

      // p@10 is superseded and below the floor → pruned. p@11 is superseded but
      // >= wsafe → kept (outbound sync may still owe it). p@12 is the tip.
      expect(deleted).toBe(1)
      expect((await adapter.getChanges(T)).map((c) => c.hash)).toEqual([
        'cid:blake3:cT-11',
        'cid:blake3:cT-12'
      ])
    })

    it('chunks a large delete and removes every superseded row', async () => {
      const B = 'compact-B'
      await materialize(B, { p: { value: 'p6', lamport: 6 } })
      await appendHistory(B, [
        { id: 'cB-1', property: 'p', value: 'p1', lamport: 1 },
        { id: 'cB-2', property: 'p', value: 'p2', lamport: 2 },
        { id: 'cB-3', property: 'p', value: 'p3', lamport: 3 },
        { id: 'cB-4', property: 'p', value: 'p4', lamport: 4 },
        { id: 'cB-5', property: 'p', value: 'p5', lamport: 5 },
        { id: 'cB-6', property: 'p', value: 'p6', lamport: 6 } // winner + tip
      ])

      const { deleted } = await adapter.pruneSupersededChanges(100, { chunk: 2 })

      expect(deleted).toBe(5) // 1..5 superseded, across 3 chunks
      expect((await adapter.getChanges(B)).map((c) => c.hash)).toEqual(['cid:blake3:cB-6'])
    })

    it('respects maxRows and no-ops on a non-positive watermark', async () => {
      const M = 'compact-M'
      await materialize(M, { p: { value: 'p3', lamport: 3 } })
      await appendHistory(M, [
        { id: 'cM-1', property: 'p', value: 'p1', lamport: 1 },
        { id: 'cM-2', property: 'p', value: 'p2', lamport: 2 },
        { id: 'cM-3', property: 'p', value: 'p3', lamport: 3 }
      ])

      expect((await adapter.pruneSupersededChanges(0)).deleted).toBe(0)
      expect((await adapter.pruneSupersededChanges(-5)).deleted).toBe(0)
      // maxRows caps the pass even when more is prunable.
      expect((await adapter.pruneSupersededChanges(100, { maxRows: 1 })).deleted).toBe(1)
    })

    it('getMinConfirmedSyncCursor is the MIN over rooms, null when none confirmed', async () => {
      expect(await adapter.getMinConfirmedSyncCursor()).toBeNull()
      await adapter.setSyncCursor('room-a', 100)
      await adapter.setSyncCursor('room-b', 40)
      await adapter.setAppState('k', 'v') // app-state keys must not be counted
      expect(await adapter.getMinConfirmedSyncCursor()).toBe(40)
    })
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
          title: { lamport: 1, author: testDID, wallTime: now }
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
          title: { lamport: 1, author: testDID, wallTime: now }
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
      node.timestamps.title = { lamport: 2, author: testDID, wallTime: now + 1000 }
      node.updatedAt = now + 1000

      await adapter.setNode(node)

      const retrieved = await adapter.getNode('node-1')
      expect(retrieved!.properties.title).toBe('Updated')
    })

    it('returns existing node ids in input order without duplicates', async () => {
      const now = Date.now()
      await adapter.setNode(
        createTestNode({
          id: 'existing-node-1',
          properties: { title: 'Existing 1' },
          createdAt: now,
          updatedAt: now
        })
      )
      await adapter.setNode(
        createTestNode({
          id: 'existing-node-2',
          properties: { title: 'Existing 2' },
          createdAt: now + 1,
          updatedAt: now + 1
        })
      )

      await expect(
        adapter.getExistingNodeIds([
          'existing-node-2',
          'missing-node',
          'existing-node-1',
          'existing-node-2'
        ])
      ).resolves.toEqual(['existing-node-2', 'existing-node-1'])
    })

    it('returns existing nodes in input order without duplicates', async () => {
      const now = Date.now()
      await adapter.importNodes([
        createTestNode({
          id: 'bulk-node-1',
          properties: { title: 'Bulk 1' },
          createdAt: now,
          updatedAt: now
        }),
        createTestNode({
          id: 'bulk-node-2',
          properties: { title: 'Bulk 2' },
          createdAt: now + 1,
          updatedAt: now + 1
        })
      ])

      const nodes = await adapter.getNodes([
        'bulk-node-2',
        'missing-node',
        'bulk-node-1',
        'bulk-node-2'
      ])

      expect(nodes.map((node) => node.id)).toEqual(['bulk-node-2', 'bulk-node-1'])
      expect(nodes.map((node) => node.properties.title)).toEqual(['Bulk 2', 'Bulk 1'])
    })

    it('defers scalar index writes until schema indexes are rebuilt', async () => {
      await adapter.importNodes(
        [
          createTestNode({
            id: 'deferred-node-1',
            properties: { title: 'Deferred Node', status: 'queued' }
          })
        ],
        { deferIndexes: true }
      )

      const beforeRebuild = await db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM node_property_scalars
         WHERE node_id = ?`,
        ['deferred-node-1']
      )
      expect(beforeRebuild?.count).toBe(0)

      await adapter.rebuildIndexesForSchemas([testSchemaId])

      const afterRebuild = await db.query<{ property_key: string; value_text: string | null }>(
        `SELECT property_key, value_text
         FROM node_property_scalars
         WHERE node_id = ?
         ORDER BY property_key ASC`,
        ['deferred-node-1']
      )
      expect(afterRebuild).toEqual([
        { property_key: 'status', value_text: 'queued' },
        { property_key: 'title', value_text: 'Deferred Node' }
      ])
    })

    it('rebuilds stale scalar rows after deferred updates', async () => {
      await adapter.importNodes([
        createTestNode({
          id: 'deferred-node-2',
          properties: { title: 'Deferred Node', status: 'queued' }
        })
      ])

      const updated = createTestNode({
        id: 'deferred-node-2',
        properties: { title: 'Deferred Node', status: 'done' },
        updatedAt: Date.now() + 1000
      })
      updated.timestamps.status.lamport = 10
      await adapter.importNodes([updated], { deferIndexes: true })

      const beforeRebuild = await db.queryOne<{ value_text: string | null }>(
        `SELECT value_text
         FROM node_property_scalars
         WHERE node_id = ? AND property_key = ?`,
        ['deferred-node-2', 'status']
      )
      expect(beforeRebuild?.value_text).toBe('queued')

      await adapter.rebuildIndexesForSchemas([testSchemaId])

      const afterRebuild = await db.queryOne<{ value_text: string | null }>(
        `SELECT value_text
         FROM node_property_scalars
         WHERE node_id = ? AND property_key = ?`,
        ['deferred-node-2', 'status']
      )
      expect(afterRebuild?.value_text).toBe('done')
    })

    it('uses transactionBatch for trusted materialized imports when available', async () => {
      const batchDb = db as SQLiteAdapter & {
        batchCalls: number
        transactionBatch: NonNullable<SQLiteAdapter['transactionBatch']>
      }
      batchDb.batchCalls = 0
      batchDb.transactionBatch = async (operations) => {
        batchDb.batchCalls += 1
        await db.transaction(async () => {
          for (const operation of operations) {
            await db.run(operation.sql, operation.params)
          }
        })
      }

      const batchAdapter = new SQLiteNodeStorageAdapter(batchDb)
      await batchAdapter.importNodes(
        [
          createTestNode({
            id: 'batch-import-node',
            properties: { title: 'Batch Import', status: 'indexed' }
          })
        ],
        { trustMaterializedState: true }
      )

      expect(batchDb.batchCalls).toBe(1)
      await expect(batchAdapter.getNode('batch-import-node')).resolves.toMatchObject({
        id: 'batch-import-node',
        properties: { title: 'Batch Import', status: 'indexed' }
      })

      const scalarRows = await db.query<{ property_key: string; value_text: string | null }>(
        `SELECT property_key, value_text
         FROM node_property_scalars
         WHERE node_id = ?
         ORDER BY property_key ASC`,
        ['batch-import-node']
      )
      expect(scalarRows).toEqual([
        { property_key: 'status', value_text: 'indexed' },
        { property_key: 'title', value_text: 'Batch Import' }
      ])
    })

    it('applies node batches with changes, sync time, and touched scalar indexes', async () => {
      const now = Date.now()
      const node = createTestNode({
        id: 'batch-apply-node',
        properties: { title: 'Batch Apply', status: 'indexed' },
        createdAt: now,
        updatedAt: now
      })
      const change: NodeChange = {
        id: 'batch-apply-change',
        type: 'node',
        hash: 'cid:blake3:batch-apply-change' as ContentId,
        payload: {
          nodeId: node.id,
          schemaId: node.schemaId,
          properties: node.properties
        } as NodePayload,
        lamport: 12,
        wallTime: now,
        authorDID: testDID,
        parentHash: null,
        batchId: 'batch-apply-1',
        batchIndex: 0,
        batchSize: 1,
        signature: new Uint8Array([1, 2, 3])
      }

      const result = await adapter.applyNodeBatch({
        batchId: 'batch-apply-1',
        nodes: [node],
        changes: [change],
        lastLamportTime: 12,
        affectedSchemaIds: [testSchemaId],
        indexMode: 'touched',
        indexProperties: true
      })

      expect(result).toMatchObject({
        nodeRowsWritten: 1,
        propertyRowsWritten: 2,
        changeRowsWritten: 1,
        scalarRowsWritten: 2
      })
      await expect(adapter.getNode('batch-apply-node')).resolves.toMatchObject({
        id: 'batch-apply-node',
        properties: { title: 'Batch Apply', status: 'indexed' }
      })
      await expect(adapter.getLastLamportTime()).resolves.toBe(12)
      await expect(adapter.getChanges('batch-apply-node')).resolves.toHaveLength(1)

      const scalarRows = await db.query<{ property_key: string; value_text: string | null }>(
        `SELECT property_key, value_text
         FROM node_property_scalars
         WHERE node_id = ?
         ORDER BY property_key ASC`,
        ['batch-apply-node']
      )
      expect(scalarRows).toEqual([
        { property_key: 'status', value_text: 'indexed' },
        { property_key: 'title', value_text: 'Batch Apply' }
      ])
    })

    it('uses typed SQLite node batch apply when available', async () => {
      const batchDb = db as SQLiteAdapter & {
        typedBatchInput: SQLiteNodeBatchApplyInput | null
        transactionBatchCalls: number
      }
      batchDb.typedBatchInput = null
      batchDb.transactionBatchCalls = 0
      batchDb.applyNodeBatch = async (input) => {
        batchDb.typedBatchInput = input
        await db.transaction(async () => {
          for (const node of input.nodes) {
            await db.run(
              `INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                node.id,
                node.schemaId,
                node.createdAt,
                node.updatedAt,
                node.createdBy,
                node.deletedAt
              ]
            )
          }
          for (const property of input.properties) {
            await db.run(
              `INSERT INTO node_properties
                  (node_id, property_key, value, lamport_time, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
              [
                property.nodeId,
                property.propertyKey,
                property.value,
                property.lamportTime,
                property.updatedBy,
                property.updatedAt
              ]
            )
          }
          for (const change of input.changes) {
            await db.run(
              `INSERT OR IGNORE INTO changes
                (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                change.hash,
                change.nodeId,
                change.payload,
                change.lamportTime,
                change.lamportPeer,
                change.wallTime,
                change.author,
                change.parentHash,
                change.batchId,
                change.signature
              ]
            )
          }
          await db.run(
            `INSERT INTO sync_state (key, value) VALUES ('lastLamportTime', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [String(input.lastLamportTime)]
          )
        })

        return {
          nodeRowsWritten: input.nodes.length,
          propertyRowsWritten: input.properties.length,
          changeRowsWritten: input.changes.length,
          scalarRowsWritten: input.scalarIndexRows.length,
          ftsRowsWritten: input.ftsRows.length
        }
      }
      batchDb.transactionBatch = async () => {
        batchDb.transactionBatchCalls += 1
      }

      const batchAdapter = new SQLiteNodeStorageAdapter(batchDb)
      const now = Date.now()
      const node = createTestNode({
        id: 'typed-batch-node',
        properties: { title: 'Typed Batch', status: 'queued' },
        createdAt: now,
        updatedAt: now
      })
      const change: NodeChange = {
        id: 'typed-batch-change',
        type: 'node',
        hash: 'cid:blake3:typed-batch-change' as ContentId,
        payload: {
          nodeId: node.id,
          schemaId: node.schemaId,
          properties: node.properties
        } as NodePayload,
        lamport: 21,
        wallTime: now,
        authorDID: testDID,
        parentHash: null,
        batchId: 'typed-batch-1',
        batchIndex: 0,
        batchSize: 1,
        signature: new Uint8Array([4, 5, 6])
      }

      const result = await batchAdapter.applyNodeBatch({
        batchId: 'typed-batch-1',
        nodes: [node],
        changes: [change],
        lastLamportTime: 21,
        affectedSchemaIds: [testSchemaId],
        indexMode: 'touched',
        indexProperties: true
      })

      expect(batchDb.transactionBatchCalls).toBe(0)
      expect(batchDb.typedBatchInput).toMatchObject({
        indexMode: 'touched',
        lastLamportTime: 21,
        nodes: [{ id: 'typed-batch-node', propertyKeys: ['title', 'status'] }],
        properties: [
          { nodeId: 'typed-batch-node', propertyKey: 'title' },
          { nodeId: 'typed-batch-node', propertyKey: 'status' }
        ],
        changes: [{ nodeId: 'typed-batch-node', batchId: 'typed-batch-1' }],
        affectedSchemaIds: [testSchemaId]
      })
      expect(result).toMatchObject({
        nodeRowsWritten: 1,
        propertyRowsWritten: 2,
        changeRowsWritten: 1,
        scalarRowsWritten: 2
      })
      await expect(batchAdapter.getNode('typed-batch-node')).resolves.toMatchObject({
        properties: { title: 'Typed Batch', status: 'queued' }
      })
      await expect(batchAdapter.getLastLamportTime()).resolves.toBe(21)
    })

    it('rolls back partial node, property, scalar, FTS, change, and sync writes when batch apply fails', async () => {
      let hasFts = true
      try {
        await db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
          node_id,
          title,
          content,
          tokenize='porter unicode61'
        )`)
      } catch {
        hasFts = false
      }

      const now = Date.now()
      const node = createTestNode({
        id: 'rollback-batch-node',
        properties: { title: 'Rollback Title', status: 'queued' },
        createdAt: now,
        updatedAt: now
      })
      const badChange: NodeChange = {
        id: 'rollback-batch-change',
        type: 'node',
        hash: 'cid:blake3:rollback-batch-change' as ContentId,
        payload: {
          nodeId: 'missing-rollback-node',
          schemaId: node.schemaId,
          properties: { title: 'Should fail' }
        } as NodePayload,
        lamport: 44,
        wallTime: now,
        authorDID: testDID,
        parentHash: null,
        batchId: 'rollback-batch-1',
        batchIndex: 0,
        batchSize: 1,
        signature: new Uint8Array([7, 8, 9])
      }

      await expect(
        adapter.applyNodeBatch({
          batchId: 'rollback-batch-1',
          nodes: [node],
          changes: [badChange],
          lastLamportTime: 44,
          affectedSchemaIds: [node.schemaId],
          indexMode: 'eager',
          indexProperties: true
        })
      ).rejects.toThrow()

      await expect(adapter.getNode(node.id)).resolves.toBeNull()
      await expect(adapter.getLastLamportTime()).resolves.toBe(0)

      const nodeRow = await db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM nodes WHERE id = ?',
        [node.id]
      )
      const propertyRows = await db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM node_properties WHERE node_id = ?',
        [node.id]
      )
      const scalarRows = await db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM node_property_scalars WHERE node_id = ?',
        [node.id]
      )
      const ftsRows = hasFts
        ? await db.queryOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM nodes_fts WHERE node_id = ?',
            [node.id]
          )
        : { count: 0 }
      const changeRows = await db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM changes WHERE hash = ?',
        [badChange.hash]
      )

      expect(nodeRow?.count).toBe(0)
      expect(propertyRows?.count).toBe(0)
      expect(scalarRows?.count).toBe(0)
      expect(ftsRows?.count).toBe(0)
      expect(changeRows?.count).toBe(0)
    })

    it('serializes concurrent transaction-backed node writes', async () => {
      const now = Date.now()
      const nodes = Array.from({ length: 8 }, (_, index) =>
        createTestNode({
          id: `queued-node-${index}`,
          properties: { title: `Queued ${index}` },
          createdAt: now + index,
          updatedAt: now + index
        })
      )

      await expect(Promise.all(nodes.map((node) => adapter.setNode(node)))).resolves.toHaveLength(
        nodes.length
      )

      const stored = await Promise.all(nodes.map((node) => adapter.getNode(node.id)))
      expect(stored.map((node) => node?.id).sort()).toEqual(nodes.map((node) => node.id).sort())
    })

    it('runs repeated transaction-scoped writes without nested transactions', async () => {
      const now = Date.now()

      await adapter.withTransaction(async (tx) => {
        await tx.setNode(
          createTestNode({
            id: 'tx-node-1',
            properties: { title: 'Transaction node 1' },
            createdAt: now,
            updatedAt: now
          })
        )
        await tx.setNode(
          createTestNode({
            id: 'tx-node-2',
            properties: { title: 'Transaction node 2' },
            createdAt: now + 1,
            updatedAt: now + 1
          })
        )
        await tx.setLastLamportTime(42)
      })

      await expect(adapter.getNode('tx-node-1')).resolves.toMatchObject({
        id: 'tx-node-1',
        properties: { title: 'Transaction node 1' }
      })
      await expect(adapter.getNode('tx-node-2')).resolves.toMatchObject({
        id: 'tx-node-2',
        properties: { title: 'Transaction node 2' }
      })
      await expect(adapter.getLastLamportTime()).resolves.toBe(42)
    })

    it('rolls back transaction-scoped writes on failure', async () => {
      await expect(
        adapter.withTransaction(async (tx) => {
          await tx.setNode(
            createTestNode({
              id: 'rolled-back-node',
              properties: { title: 'Rolled back' }
            })
          )
          throw new Error('rollback sentinel')
        })
      ).rejects.toThrow('rollback sentinel')

      await expect(adapter.getNode('rolled-back-node')).resolves.toBeNull()
    })

    it('respects LWW for concurrent updates - higher lamport wins', async () => {
      const now = Date.now()

      // First write with higher lamport time
      await adapter.setNode({
        id: 'node-1',
        schemaId: testSchemaId,
        properties: { title: 'First (higher lamport)' },
        timestamps: {
          title: { lamport: 5, author: testDID, wallTime: now }
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
          title: { lamport: 3, author: testDID, wallTime: now + 1000 }
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
          title: { lamport: 5, author: testDID, wallTime: now }
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
          title: { lamport: 5, author: testDID, wallTime: now },
          description: { lamport: 1, author: testDID, wallTime: now + 1000 }
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
          title: { lamport: 1, author: testDID, wallTime: now }
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
          title: { lamport: 1, author: testDID, wallTime: now }
        },
        deleted: true,
        deletedAt: { lamport: 2, author: testDID, wallTime: now + 1000 },
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
            title: { lamport: i, author: testDID, wallTime: now + i * 1000 }
          },
          deleted: i === 9, // Last one is soft-deleted
          deletedAt: i === 9 ? { lamport: 10, author: testDID, wallTime: now + 10000 } : undefined,
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
          deletedAt: i === 4 ? { lamport: 5, author: testDID, wallTime: now } : undefined,
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

  // ─── Scalar Property Index And Query Planning ──────────────────────────────

  describe('scalar property index', () => {
    it('indexes text, number, boolean, and null scalar values', async () => {
      await adapter.setNode(
        createTestNode({
          id: 'task-1',
          schemaId: taskSchemaId,
          properties: {
            title: 'Indexed task',
            priority: 3,
            done: false,
            dueDate: null,
            tags: ['not-indexed']
          }
        })
      )

      const rows = await db.query<{
        property_key: string
        value_type: string
        value_text: string | null
        value_number: number | null
        value_boolean: number | null
      }>(
        `SELECT property_key, value_type, value_text, value_number, value_boolean
         FROM node_property_scalars
         WHERE node_id = ?
         ORDER BY property_key ASC`,
        ['task-1']
      )

      expect(rows).toEqual([
        {
          property_key: 'done',
          value_type: 'boolean',
          value_text: null,
          value_number: null,
          value_boolean: 0
        },
        {
          property_key: 'dueDate',
          value_type: 'null',
          value_text: null,
          value_number: null,
          value_boolean: null
        },
        {
          property_key: 'priority',
          value_type: 'number',
          value_text: null,
          value_number: 3,
          value_boolean: null
        },
        {
          property_key: 'title',
          value_type: 'text',
          value_text: 'Indexed task',
          value_number: null,
          value_boolean: null
        }
      ])
    })

    it('removes stale property and scalar rows when materialized properties are deleted', async () => {
      await adapter.setNode(
        createTestNode({
          id: 'task-1',
          schemaId: taskSchemaId,
          properties: { title: 'Task', status: 'open' }
        })
      )
      await adapter.setNode(
        createTestNode({
          id: 'task-1',
          schemaId: taskSchemaId,
          properties: { title: 'Task' }
        })
      )

      const node = await adapter.getNode('task-1')
      const scalarRows = await db.query<{ property_key: string }>(
        `SELECT property_key FROM node_property_scalars WHERE node_id = ? ORDER BY property_key`,
        ['task-1']
      )

      expect(node?.properties).toEqual({ title: 'Task' })
      expect(scalarRows.map((row) => row.property_key)).toEqual(['title'])
    })

    it('can rebuild scalar rows from materialized node properties', async () => {
      await adapter.setNode(
        createTestNode({
          id: 'task-1',
          schemaId: taskSchemaId,
          properties: { title: 'Task', priority: 4, done: true }
        })
      )
      await db.run('DELETE FROM node_property_scalars')

      const result = await adapter.rebuildScalarIndex()
      const scalarRows = await db.query<{ property_key: string }>(
        `SELECT property_key FROM node_property_scalars WHERE node_id = ? ORDER BY property_key`,
        ['task-1']
      )

      expect(result).toEqual({ nodesScanned: 1, scalarRowsWritten: 3 })
      expect(scalarRows.map((row) => row.property_key)).toEqual(['done', 'priority', 'title'])
    })

    it('keeps touched-node scalar rows identical to a whole-schema rebuild', async () => {
      const now = Date.now()
      await adapter.importNodes([
        createTestNode({
          id: 'touched-scalar-updated',
          schemaId: taskSchemaId,
          properties: { title: 'Before', status: 'open', priority: 1 },
          createdAt: now,
          updatedAt: now
        }),
        createTestNode({
          id: 'touched-scalar-unchanged',
          schemaId: taskSchemaId,
          properties: { title: 'Unchanged', status: 'open', done: false },
          createdAt: now + 1,
          updatedAt: now + 1
        })
      ])

      const updatedNode = createTestNode({
        id: 'touched-scalar-updated',
        schemaId: taskSchemaId,
        properties: { title: 'After', priority: 5, done: true },
        createdAt: now,
        updatedAt: now + 2
      })
      Object.values(updatedNode.timestamps).forEach((timestamp, index) => {
        timestamp.lamport = 80 + index
      })

      await adapter.applyNodeBatch({
        batchId: 'touched-scalar-parity',
        nodes: [updatedNode],
        changes: [
          createTestChange({
            id: 'touched-scalar-parity-change',
            nodeId: 'touched-scalar-updated',
            properties: { title: 'After', priority: 5, done: true },
            lamportTime: 80,
            batchId: 'touched-scalar-parity'
          })
        ],
        lastLamportTime: 80,
        affectedSchemaIds: [taskSchemaId],
        indexMode: 'touched',
        indexProperties: true
      })

      const readScalarRows = () =>
        db.query<{
          node_id: string
          property_key: string
          value_type: string
          value_text: string | null
          value_number: number | null
          value_boolean: number | null
        }>(
          `SELECT node_id, property_key, value_type, value_text, value_number, value_boolean
           FROM node_property_scalars
           WHERE schema_id = ?
           ORDER BY node_id ASC, property_key ASC`,
          [taskSchemaId]
        )

      const touchedRows = await readScalarRows()
      await db.run('DELETE FROM node_property_scalars WHERE schema_id = ?', [taskSchemaId])
      await adapter.rebuildIndexesForSchemas([taskSchemaId])
      const rebuiltRows = await readScalarRows()

      expect(touchedRows).toEqual(rebuiltRows)
    })

    it('skips plaintext scalar rows when indexing is disabled', async () => {
      await adapter.setNode(
        createTestNode({
          id: 'encrypted-task',
          schemaId: taskSchemaId,
          properties: { title: 'Encrypted task', status: 'open' }
        }),
        { indexProperties: false }
      )

      const count = await db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM node_property_scalars WHERE node_id = ?`,
        ['encrypted-task']
      )

      expect(count?.count).toBe(0)
    })
  })

  describe('full-text index', () => {
    it('keeps touched-node FTS rows identical to a whole-schema rebuild', async () => {
      if (!(await ensureFtsTable())) return

      const now = Date.now()
      await adapter.importNodes([
        createTestNode({
          id: 'touched-fts-updated',
          schemaId: taskSchemaId,
          properties: { title: 'Before roadmap', body: 'Draft content' },
          createdAt: now,
          updatedAt: now
        }),
        createTestNode({
          id: 'touched-fts-unchanged',
          schemaId: taskSchemaId,
          properties: { title: 'Stable note', body: 'Kept content' },
          createdAt: now + 1,
          updatedAt: now + 1
        })
      ])

      const updatedNode = createTestNode({
        id: 'touched-fts-updated',
        schemaId: taskSchemaId,
        properties: { title: 'After roadmap', body: 'Published content' },
        createdAt: now,
        updatedAt: now + 2
      })
      Object.values(updatedNode.timestamps).forEach((timestamp, index) => {
        timestamp.lamport = 81 + index
      })

      await adapter.applyNodeBatch({
        batchId: 'touched-fts-parity',
        nodes: [updatedNode],
        changes: [
          createTestChange({
            id: 'touched-fts-parity-change',
            nodeId: 'touched-fts-updated',
            properties: { title: 'After roadmap', body: 'Published content' },
            lamportTime: 81,
            batchId: 'touched-fts-parity'
          })
        ],
        lastLamportTime: 81,
        affectedSchemaIds: [taskSchemaId],
        indexMode: 'touched',
        indexProperties: true
      })

      const readFtsRows = () =>
        db.query<{ node_id: string; title: string; content: string }>(
          `SELECT node_id, title, content
           FROM nodes_fts
           ORDER BY node_id ASC`,
          []
        )

      const touchedRows = await readFtsRows()
      await db.run('DELETE FROM nodes_fts')
      await adapter.rebuildIndexesForSchemas([taskSchemaId])
      const rebuiltRows = await readFtsRows()

      expect(touchedRows).toEqual(rebuiltRows)
    })
  })

  describe('queryNodes', () => {
    beforeEach(async () => {
      const now = Date.now()
      await adapter.importNodes([
        createTestNode({
          id: 'task-open-high',
          schemaId: taskSchemaId,
          properties: { title: 'Open high', status: 'open', priority: 10, done: false },
          createdAt: now,
          updatedAt: now + 3000
        }),
        createTestNode({
          id: 'task-open-low',
          schemaId: taskSchemaId,
          properties: { title: 'Open low', status: 'open', priority: 1, done: false },
          createdAt: now + 100,
          updatedAt: now + 2000
        }),
        createTestNode({
          id: 'task-done',
          schemaId: taskSchemaId,
          properties: { title: 'Done', status: 'done', priority: 4, done: true },
          createdAt: now + 200,
          updatedAt: now + 1000
        }),
        createTestNode({
          id: 'task-null-status',
          schemaId: taskSchemaId,
          properties: { title: 'No status', status: null, done: false },
          createdAt: now + 300,
          updatedAt: now + 500
        }),
        createTestNode({
          id: 'task-deleted',
          schemaId: taskSchemaId,
          properties: { title: 'Deleted', status: 'open', done: false },
          deleted: true,
          createdAt: now + 400,
          updatedAt: now + 4000
        })
      ])
    })

    it('pushes down scalar equality while preserving descriptor results', async () => {
      const descriptor: NodeQueryDescriptor = {
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        limit: 1,
        count: 'exact'
      }

      const result = await adapter.queryNodes(descriptor)

      expect(result.nodes.map((node) => node.id)).toEqual(['task-open-high'])
      expect(result.totalCount).toBe(2)
      expect(result.plan.strategy).toBe('storage-query')
      expect(result.plan.candidateNodeCount).toBe(1)
      expect(result.plan.postFilterReason).toBe('pagination-pushed-down')
      expect(result.plan.parityCheck).toMatchObject({
        strategy: 'exact',
        valid: true,
        comparedNodeCount: 4,
        expectedNodeCount: 1
      })
      expect(result.plan.candidateQueryDurationMs).toEqual(expect.any(Number))
      expect(result.plan.usedIndexNames).toContain('idx_prop_scalars_text')
      expect(
        result.plan.queryPlanDetails?.some((detail) => detail.includes('idx_prop_scalars_text'))
      ).toBe(true)
      expect(result.plan.availableIndexCount).toBeGreaterThan(0)
      expect(result.plan.adaptiveIndexCount).toBe(0)
      expect(result.plan.diagnosticsError).toBeUndefined()
      expect(result.plan.storageCapabilities).toEqual({
        fullTextSearch: expect.any(Boolean),
        rtree: expect.any(Boolean)
      })
    })

    it('matches null and boolean scalar equality without matching missing values', async () => {
      const nullStatus = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: null }
      })
      const priority = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { priority: 10 }
      })
      const unchecked = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { done: false },
        orderBy: { updatedAt: 'desc' }
      })

      expect(nullStatus.nodes.map((node) => node.id)).toEqual(['task-null-status'])
      expect(priority.nodes.map((node) => node.id)).toEqual(['task-open-high'])
      expect(unchecked.nodes.map((node) => node.id)).toEqual([
        'task-open-high',
        'task-open-low',
        'task-null-status'
      ])
    })

    it('falls back to full list semantics for unsupported object equality', async () => {
      await adapter.setNode(
        createTestNode({
          id: 'task-object',
          schemaId: taskSchemaId,
          properties: { title: 'Object', metadata: { nested: true } }
        })
      )

      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { metadata: { nested: true } }
      })

      expect(result.nodes).toEqual([])
      expect(result.plan.strategy).toBe('list-fallback')
    })

    it('pushes down limit and offset for system-field ordering', async () => {
      // `count: 'exact'` opts in to the COUNT(*) total (exploration 0184); by
      // default it is skipped to avoid an index-wide scan per list read.
      const byCreatedAt = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { createdAt: 'asc' },
        limit: 2,
        offset: 1,
        count: 'exact'
      })
      const byUpdatedAt = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { updatedAt: 'desc' },
        limit: 2,
        count: 'exact'
      })

      expect(byCreatedAt.nodes.map((node) => node.id)).toEqual(['task-open-low', 'task-done'])
      expect(byUpdatedAt.nodes.map((node) => node.id)).toEqual(['task-open-high', 'task-open-low'])
      expect(byCreatedAt.totalCount).toBe(4)
      expect(byUpdatedAt.totalCount).toBe(4)
      expect(byCreatedAt.plan.postFilterReason).toBe('pagination-pushed-down')
      expect(byUpdatedAt.plan.postFilterReason).toBe('pagination-pushed-down')
    })

    it('skips the COUNT(*) total unless an exact count is requested', async () => {
      // Default list read: total is left undefined so the bridge derives a
      // cheap value; the expensive per-list COUNT scan is avoided (0184).
      const withoutCount = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { updatedAt: 'desc' },
        limit: 2
      })
      expect(withoutCount.nodes).toHaveLength(2)
      expect(withoutCount.totalCount).toBeUndefined()
    })

    it('uses node ID as the cursor tie-breaker for duplicate sort values', async () => {
      const tieUpdatedAt = Date.now() + 20_000
      const cursorSource = createTestNode({
        id: 'task-open-low',
        schemaId: taskSchemaId,
        properties: { title: 'Open low', status: 'open', priority: 1, done: false },
        updatedAt: tieUpdatedAt
      })
      const descriptor: NodeQueryDescriptor = {
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { done: false },
        orderBy: { updatedAt: 'desc' },
        limit: 2
      }
      const cursor = encodeNodeQueryCursor(descriptor, cursorSource)

      await adapter.setNode(cursorSource)
      await adapter.setNode(
        createTestNode({
          id: 'task-open-mid',
          schemaId: taskSchemaId,
          properties: { title: 'Open mid', status: 'open', priority: 2, done: false },
          updatedAt: tieUpdatedAt
        })
      )

      const result = await adapter.queryNodes({
        ...descriptor,
        after: cursor
      })

      expect(result.nodes.map((node) => node.id)).toEqual(['task-open-mid', 'task-open-high'])
      expect(result.plan.postFilterReason).toBe('verified-in-js')
    })

    it('keeps search queries on the JS-verified path when FTS is unavailable', async () => {
      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { updatedAt: 'desc' },
        limit: 1,
        search: { text: 'open' }
      })

      expect(result.nodes.map((node) => node.id)).toEqual(['task-open-high'])
      expect(result.totalCount).toBe(2)
      expect(result.plan.storageCapabilities?.fullTextSearch).toBe(false)
      expect(result.plan.candidateAccelerators).toBeUndefined()
      expect(result.plan.fullTextSearchQuery).toBeUndefined()
      expect(result.plan.postFilterReason).toBe('verified-in-js')
    })

    it('materializes stable view result IDs and refreshes after invalidation', async () => {
      const firstPage = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        limit: 1,
        materializedView: { viewId: 'task-table-open' }
      })
      const secondPage = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        limit: 2,
        materializedView: { viewId: 'task-table-open' }
      })

      expect(firstPage.nodes.map((node) => node.id)).toEqual(['task-open-high'])
      expect(firstPage.plan.postFilterReason).toBe('materialized-view-refreshed')
      expect(firstPage.plan.materializedCacheHit).toBe(false)
      expect(firstPage.plan.materializedRefreshReason).toBe('missing')
      expect(firstPage.plan.materializedViewId).toBe('task-table-open')
      expect(firstPage.plan.materializedRowCount).toBe(2)
      expect(secondPage.nodes.map((node) => node.id)).toEqual(['task-open-high', 'task-open-low'])
      expect(secondPage.plan.postFilterReason).toBe('materialized-view-cache-hit')
      expect(secondPage.plan.materializedCacheHit).toBe(true)

      const updatedLow = createTestNode({
        id: 'task-open-low',
        schemaId: taskSchemaId,
        properties: { title: 'Open low', status: 'done', priority: 1, done: false },
        updatedAt: Date.now() + 10_000
      })
      Object.values(updatedLow.timestamps).forEach((timestamp, index) => {
        timestamp.lamport = 100 + index
      })
      await adapter.setNode(updatedLow)

      const invalidated = await db.queryOne<{ invalidated_at: number | null }>(
        `SELECT invalidated_at
         FROM node_query_materializations
         WHERE view_id = ?`,
        ['task-table-open']
      )
      expect(invalidated?.invalidated_at).toEqual(expect.any(Number))

      const afterInvalidation = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        limit: 2,
        materializedView: { viewId: 'task-table-open' }
      })

      expect(afterInvalidation.nodes.map((node) => node.id)).toEqual(['task-open-high'])
      expect(afterInvalidation.plan.postFilterReason).toBe('materialized-view-refreshed')
      expect(afterInvalidation.plan.materializedCacheHit).toBe(false)
      expect(afterInvalidation.plan.materializedRefreshReason).toBe('invalidated')
      expect(afterInvalidation.plan.materializedInvalidatedAt).toBe(invalidated?.invalidated_at)
      expect(afterInvalidation.plan.materializedRowCount).toBe(1)
      expect(afterInvalidation.plan.parityCheck).toMatchObject({
        strategy: 'exact',
        valid: true,
        expectedNodeCount: 1
      })
    })

    it('serves a materialized view from persisted SQLite after a reload (0226)', async () => {
      const base = {
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' as const },
        materializedView: { viewId: 'reload-view' }
      }

      const first = await adapter.queryNodes(base)
      expect(first.plan.materializedCacheHit).toBe(false)
      expect(first.nodes.map((node) => node.id)).toEqual(['task-open-high', 'task-open-low'])

      // A fresh adapter on the SAME database holds no in-memory state — a cache
      // hit proves the materialization was read back from persisted SQLite,
      // exactly as it would be after a page reload.
      const reloaded = new SQLiteNodeStorageAdapter(db, {
        queryVerification: { enabled: true },
        queryDiagnostics: true
      })
      const afterReload = await reloaded.queryNodes(base)
      expect(afterReload.plan.materializedCacheHit).toBe(true)
      expect(afterReload.nodes.map((node) => node.id)).toEqual(['task-open-high', 'task-open-low'])
    })

    it('authorizes the id list once and re-materializes when the auth fingerprint shifts (0226)', async () => {
      let allowLow = true
      const authorize = vi.fn(async (nodes: NodeState[]) =>
        nodes.filter((node) => allowLow || node.id !== 'task-open-low')
      )
      adapter.setNodeReadAuthorizer(authorize)

      const base = {
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' as const },
        materializedView: { viewId: 'authz-view' }
      }

      // Materialize under fingerprint A: both open rows are readable.
      const first = await adapter.queryNodes({ ...base, authFingerprint: 'authz:A' })
      expect(first.nodes.map((node) => node.id)).toEqual(['task-open-high', 'task-open-low'])
      expect(first.plan.materializedCacheHit).toBe(false)
      expect(first.plan.materializedRefreshReason).toBe('missing')
      expect(first.plan.materializedRowCount).toBe(2)
      expect(authorize).toHaveBeenCalledTimes(1)

      // Same fingerprint → cache hit served from the persisted id list, with NO
      // per-row re-authorization (the performance win).
      const second = await adapter.queryNodes({ ...base, authFingerprint: 'authz:A' })
      expect(second.nodes.map((node) => node.id)).toEqual(['task-open-high', 'task-open-low'])
      expect(second.plan.materializedCacheHit).toBe(true)
      expect(authorize).toHaveBeenCalledTimes(1)

      // Revoke read on task-open-low and shift the fingerprint: the cache must
      // NOT serve the now-unreadable row.
      allowLow = false
      const third = await adapter.queryNodes({ ...base, authFingerprint: 'authz:B' })
      expect(third.plan.materializedCacheHit).toBe(false)
      expect(third.plan.materializedRefreshReason).toBe('authz-changed')
      expect(third.nodes.map((node) => node.id)).toEqual(['task-open-high'])
      expect(third.plan.materializedRowCount).toBe(1)
      expect(authorize).toHaveBeenCalledTimes(2)

      // The persisted fingerprint now matches B → cache hit again, still excluded.
      const fourth = await adapter.queryNodes({ ...base, authFingerprint: 'authz:B' })
      expect(fourth.nodes.map((node) => node.id)).toEqual(['task-open-high'])
      expect(fourth.plan.materializedCacheHit).toBe(true)
      expect(authorize).toHaveBeenCalledTimes(2)

      // Authorized materializations skip the JS parity audit (it is authz-blind).
      expect(third.plan.parityCheck).toMatchObject({
        strategy: 'skipped',
        reason: 'authorized-materialization'
      })
    })

    it('versions authorization state from grants and /sys/authz, not ordinary writes (0226)', async () => {
      const initial = await adapter.getAuthorizationStateVersion()

      // An ordinary data write leaves the authorization-state version untouched.
      await adapter.setNode(
        createTestNode({
          id: 'task-extra',
          schemaId: taskSchemaId,
          properties: { title: 'Extra', status: 'open', done: false },
          updatedAt: Date.now() + 50_000
        })
      )
      expect(await adapter.getAuthorizationStateVersion()).toEqual(initial)

      // A grant write bumps the count.
      await adapter.setNode(
        createTestNode({
          id: 'grant-1',
          schemaId: SYSTEM_SCHEMA_BASE_IRIS.Grant as SchemaIRI,
          properties: { role: 'viewer' },
          updatedAt: Date.now() + 60_000
        })
      )
      const afterGrant = await adapter.getAuthorizationStateVersion()
      expect(afterGrant.count).toBe(initial.count + 1)
      expect(afterGrant.maxUpdatedAt).toBeGreaterThan(initial.maxUpdatedAt)

      // A /sys/authz namespace resource bumps it too.
      await adapter.setNode(
        createTestNode({
          id: 'xnet://did:key:z6MkAuthzSubject/sys/authz/role-1',
          schemaId: taskSchemaId,
          properties: { title: 'authz', done: false },
          updatedAt: Date.now() + 70_000
        })
      )
      expect((await adapter.getAuthorizationStateVersion()).count).toBe(initial.count + 2)
    })

    it('coalesces touched batch materialized-view invalidation to once per schema', async () => {
      let invalidationStatements = 0
      const countingDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property === 'run') {
            return async (sql: string, params?: Parameters<SQLiteAdapter['run']>[1]) => {
              if (
                sql.includes('UPDATE node_query_materializations') &&
                sql.includes('invalidated_at')
              ) {
                invalidationStatements += 1
              }
              return target.run(sql, params)
            }
          }

          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        }
      }) as SQLiteAdapter
      const countingAdapter = new SQLiteNodeStorageAdapter(countingDb)

      await countingAdapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        materializedView: { viewId: 'task-table-coalesced' }
      })

      invalidationStatements = 0
      const now = Date.now() + 20_000
      const updatedHigh = createTestNode({
        id: 'task-open-high',
        schemaId: taskSchemaId,
        properties: { title: 'Open high updated', status: 'open', priority: 11, done: false },
        updatedAt: now
      })
      const updatedLow = createTestNode({
        id: 'task-open-low',
        schemaId: taskSchemaId,
        properties: { title: 'Open low updated', status: 'open', priority: 2, done: false },
        updatedAt: now + 1
      })
      for (const [nodeIndex, node] of [updatedHigh, updatedLow].entries()) {
        Object.values(node.timestamps).forEach((timestamp, propertyIndex) => {
          timestamp.lamport = 90 + nodeIndex * 10 + propertyIndex
        })
      }

      await countingAdapter.applyNodeBatch({
        batchId: 'materialized-coalesced-batch',
        nodes: [updatedHigh, updatedLow],
        changes: [
          createTestChange({
            id: 'materialized-coalesced-high',
            nodeId: updatedHigh.id,
            properties: updatedHigh.properties,
            lamportTime: 120,
            batchId: 'materialized-coalesced-batch'
          }),
          createTestChange({
            id: 'materialized-coalesced-low',
            nodeId: updatedLow.id,
            properties: updatedLow.properties,
            lamportTime: 120,
            batchId: 'materialized-coalesced-batch'
          })
        ],
        lastLamportTime: 120,
        affectedSchemaIds: [taskSchemaId, taskSchemaId],
        indexMode: 'touched',
        indexProperties: true
      })

      const invalidated = await db.queryOne<{ invalidated_at: number | null }>(
        `SELECT invalidated_at
         FROM node_query_materializations
         WHERE view_id = ?`,
        ['task-table-coalesced']
      )

      expect(invalidationStatements).toBe(1)
      expect(invalidated?.invalidated_at).toEqual(expect.any(Number))
    })

    it('refreshes materialized views when maxAgeMs expires or forceRefresh is requested', async () => {
      await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        materializedView: { viewId: 'task-table-expiring' }
      })
      await db.run(
        `UPDATE node_query_materializations
         SET generated_at = ?
         WHERE view_id = ?`,
        [Date.now() - 10_000, 'task-table-expiring']
      )

      const expired = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        materializedView: { viewId: 'task-table-expiring', maxAgeMs: 1 }
      })
      const forced = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        materializedView: { viewId: 'task-table-expiring', forceRefresh: true }
      })

      expect(expired.plan.materializedCacheHit).toBe(false)
      expect(expired.plan.materializedRefreshReason).toBe('expired')
      expect(forced.plan.materializedCacheHit).toBe(false)
      expect(forced.plan.materializedRefreshReason).toBe('force-refresh')
    })

    it('supports materialized offset and cursor pages across reloads', async () => {
      const baseDescriptor: NodeQueryDescriptor = {
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        materializedView: { viewId: 'task-table-pages' }
      }
      const offsetPage = await adapter.queryNodes({
        ...baseDescriptor,
        limit: 1,
        offset: 1
      })
      const firstPage = await adapter.queryNodes({
        ...baseDescriptor,
        limit: 1
      })
      const cursor = encodeNodeQueryCursor(baseDescriptor, firstPage.nodes[0]!)
      const cursorPage = await adapter.queryNodes({
        ...baseDescriptor,
        limit: 1,
        after: cursor
      })

      expect(offsetPage.nodes.map((node) => node.id)).toEqual(['task-open-low'])
      expect(offsetPage.plan.materializedRefreshReason).toBe('missing')
      expect(firstPage.plan.materializedCacheHit).toBe(true)
      expect(cursorPage.nodes.map((node) => node.id)).toEqual(['task-open-low'])
      expect(cursorPage.plan.materializedCacheHit).toBe(true)

      await adapter.setNode(
        createTestNode({
          id: 'task-open-new-top',
          schemaId: taskSchemaId,
          properties: { title: 'Open newest', status: 'open', priority: 99, done: false },
          updatedAt: Date.now() + 50_000
        })
      )

      const shiftedOffsetPage = await adapter.queryNodes({
        ...baseDescriptor,
        limit: 1,
        offset: 1
      })

      expect(shiftedOffsetPage.nodes.map((node) => node.id)).toEqual(['task-open-high'])
      expect(shiftedOffsetPage.plan.materializedCacheHit).toBe(false)
      expect(shiftedOffsetPage.plan.materializedRefreshReason).toBe('invalidated')
      expect(shiftedOffsetPage.totalCount).toBe(3)
    })

    it('keeps spatial queries on the JS-verified path when R-Tree is unavailable', async () => {
      await adapter.importNodes([
        createTestNode({
          id: 'spatial-near',
          schemaId: taskSchemaId,
          properties: { title: 'Near', x: 10, y: 10, width: 20, height: 20 }
        }),
        createTestNode({
          id: 'spatial-far',
          schemaId: taskSchemaId,
          properties: { title: 'Far', x: 500, y: 500, width: 20, height: 20 }
        })
      ])

      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        spatial: {
          kind: 'window',
          rect: { x: 0, y: 0, width: 100, height: 100 },
          fields: { x: 'x', y: 'y', width: 'width', height: 'height' }
        }
      })

      expect(result.nodes.map((node) => node.id)).toEqual(['spatial-near'])
      expect(result.plan.storageCapabilities?.rtree).toBe(false)
      expect(result.plan.candidateAccelerators).toBeUndefined()
      expect(result.plan.spatialIndexKey).toBeUndefined()
      expect(result.plan.postFilterReason).toBe('verified-in-js')
    })

    it('collects plan diagnostics when the xnet:query:debug flag is set', async () => {
      const debugAdapter = new SQLiteNodeStorageAdapter(db)
      const globalWithStorage = globalThis as {
        localStorage?: { getItem: (key: string) => string | null }
      }
      const previousLocalStorage = globalWithStorage.localStorage
      globalWithStorage.localStorage = {
        getItem: (key: string) => (key === 'xnet:query:debug' ? 'true' : null)
      }
      const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

      try {
        const result = await debugAdapter.queryNodes({
          schemaId: taskSchemaId,
          includeDeleted: false,
          where: { status: 'open' }
        })

        expect(result.plan.usedIndexNames).toBeDefined()
        expect(result.plan.availableIndexCount).toBeGreaterThan(0)
      } finally {
        consoleDebug.mockRestore()
        if (previousLocalStorage === undefined) {
          delete globalWithStorage.localStorage
        } else {
          globalWithStorage.localStorage = previousLocalStorage
        }
      }
    })

    it('throttles plan diagnostics to one collection per compiled SQL shape (2026-07-05 convoy)', async () => {
      // Pre-fix, EVERY debug-mode execution issued EXPLAIN QUERY PLAN +
      // PRAGMA schema_version + the index inventory as separate round-trips
      // on the single serial worker — hundreds per boot, delaying the very
      // queries being measured by 18-20s. Diagnostics must be collected once
      // per unique compiled SQL shape and served from the session memo after.
      const throttledAdapter = new SQLiteNodeStorageAdapter(db, { queryDiagnostics: true })
      const querySpy = vi.spyOn(db, 'query')
      const explainCount = () =>
        querySpy.mock.calls.filter(([sql]) => String(sql).startsWith('EXPLAIN QUERY PLAN')).length

      const descriptor = {
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      }

      const first = await throttledAdapter.queryNodes(descriptor)
      expect(first.plan.usedIndexNames).toBeDefined()
      expect(first.plan.availableIndexCount).toBeGreaterThan(0)
      expect(explainCount()).toBe(1)

      // Same shape again — and the same shape with different bound values
      // (values are `?` params, so the compiled SQL is identical): both are
      // served from the memo, with diagnostics still present on every plan.
      const second = await throttledAdapter.queryNodes(descriptor)
      const third = await throttledAdapter.queryNodes({
        ...descriptor,
        where: { status: 'done' }
      })
      expect(second.plan.usedIndexNames).toBeDefined()
      expect(third.plan.usedIndexNames).toBeDefined()
      expect(explainCount()).toBe(1)

      // Concurrent cold executions (the boot pattern) share one in-flight
      // collection instead of each enqueueing their own.
      const coldAdapter = new SQLiteNodeStorageAdapter(db, { queryDiagnostics: true })
      const before = explainCount()
      const results = await Promise.all(
        Array.from({ length: 8 }, () => coldAdapter.queryNodes(descriptor))
      )
      for (const result of results) {
        expect(result.plan.usedIndexNames).toBeDefined()
      }
      expect(explainCount()).toBe(before + 1)

      querySpy.mockRestore()
    })

    it('skips plan diagnostics by default', async () => {
      const defaultAdapter = new SQLiteNodeStorageAdapter(db)

      const result = await defaultAdapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })

      expect(result.plan.usedIndexNames).toBeUndefined()
      expect(result.plan.parityCheck).toMatchObject({ strategy: 'skipped', reason: 'disabled' })
    })

    it('skips parity checks when the descriptor scope exceeds the configured cap', async () => {
      adapter = new SQLiteNodeStorageAdapter(db, {
        queryVerification: { enabled: true, maxNodes: 1 }
      })

      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })

      expect(result.plan.parityCheck).toEqual({
        strategy: 'skipped',
        reason: 'scope-too-large',
        comparedNodeCount: 4
      })
    })

    it('logs high-severity diagnostics when SQL candidates miss JS descriptor results', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      try {
        await db.run('DELETE FROM node_property_scalars WHERE node_id = ?', ['task-open-high'])

        const result = await adapter.queryNodes({
          schemaId: taskSchemaId,
          includeDeleted: false,
          where: { status: 'open' },
          orderBy: { updatedAt: 'desc' }
        })

        expect(result.nodes.map((node) => node.id)).toEqual(['task-open-low'])
        expect(result.plan.parityCheck).toMatchObject({
          strategy: 'exact',
          valid: false,
          comparedNodeCount: 4,
          expectedNodeCount: 2,
          missingNodeIds: ['task-open-high']
        })
        expect(consoleError).toHaveBeenCalledWith(
          '[SQLiteNodeStorageAdapter] Node query parity failure',
          expect.objectContaining({
            descriptor: expect.objectContaining({ where: { status: 'open' } }),
            parityCheck: expect.objectContaining({
              valid: false,
              missingNodeIds: ['task-open-high']
            })
          })
        )
      } finally {
        consoleError.mockRestore()
      }
    })

    it('uses composite node and scalar indexes in query plans', async () => {
      const defaultListPlan = await db.query<{ detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT id FROM nodes
         WHERE schema_id = ? AND deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT 2`,
        [taskSchemaId]
      )
      const propertyFilterPlan = await db.query<{ detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT n.id
         FROM nodes n
         JOIN node_property_scalars p0
           ON p0.node_id = n.id
          AND p0.schema_id = n.schema_id
          AND p0.property_key = ?
          AND p0.value_type = ?
         WHERE n.schema_id = ?
           AND n.deleted_at IS NULL
           AND p0.value_text = ?
         ORDER BY n.updated_at DESC
         LIMIT 2`,
        ['status', 'text', taskSchemaId, 'open']
      )

      expect(
        defaultListPlan.some(
          (row) =>
            row.detail.includes('idx_nodes_live_schema_updated') ||
            row.detail.includes('idx_nodes_all_schema_updated')
        )
      ).toBe(true)
      expect(propertyFilterPlan.some((row) => row.detail.includes('idx_prop_scalars_text'))).toBe(
        true
      )
    })

    it('uses FTS candidates for search queries when SQLite supports it', async () => {
      const dbPath = getTestDbPath()
      const nativeDb = await createNativeSQLiteAdapterOrNull(dbPath)
      if (!nativeDb) return

      const nativeAdapter = new SQLiteNodeStorageAdapter(nativeDb, {
        queryVerification: { enabled: true }
      })
      const now = Date.now()

      try {
        await nativeAdapter.importNodes([
          createTestNode({
            id: 'fts-content-match',
            schemaId: taskSchemaId,
            properties: { title: 'Notes', body: 'Project roadmap details' },
            updatedAt: now + 3
          }),
          createTestNode({
            id: 'fts-title-match',
            schemaId: taskSchemaId,
            properties: { title: 'Project roadmap', description: 'Kickoff' },
            updatedAt: now + 2
          }),
          createTestNode({
            id: 'fts-miss',
            schemaId: taskSchemaId,
            properties: { title: 'Project status', description: 'Weekly update' },
            updatedAt: now + 1
          })
        ])

        const result = await nativeAdapter.queryNodes({
          schemaId: taskSchemaId,
          includeDeleted: false,
          orderBy: { updatedAt: 'desc' },
          search: { text: 'proj road' }
        })

        expect(result.nodes.map((node) => node.id)).toEqual([
          'fts-content-match',
          'fts-title-match'
        ])
        expect(result.plan.strategy).toBe('storage-query')
        expect(result.plan.postFilterReason).toBe('fts-verified-in-js')
        expect(result.plan.candidateAccelerators).toEqual(['fts'])
        expect(result.plan.fullTextSearchQuery).toBe('proj* AND road*')
        expect(result.plan.sql).toContain('nodes_fts')
        expect(result.plan.candidateNodeCount).toBe(2)
        expect(result.plan.parityCheck).toMatchObject({
          strategy: 'exact',
          valid: true,
          expectedNodeCount: 2
        })

        const titleOnly = await nativeAdapter.queryNodes({
          schemaId: taskSchemaId,
          includeDeleted: false,
          search: { text: 'proj road', fields: ['title'] }
        })
        expect(titleOnly.nodes.map((node) => node.id)).toEqual(['fts-title-match'])
        expect(titleOnly.plan.candidateNodeCount).toBe(2)

        const updatedContentMatch = createTestNode({
          id: 'fts-content-match',
          schemaId: taskSchemaId,
          properties: { title: 'Notes', body: 'Archive details' },
          updatedAt: now + 4
        })
        updatedContentMatch.timestamps.title.lamport = 10
        updatedContentMatch.timestamps.body.lamport = 11
        await nativeAdapter.setNode(updatedContentMatch)

        const afterUpdate = await nativeAdapter.queryNodes({
          schemaId: taskSchemaId,
          includeDeleted: false,
          orderBy: { updatedAt: 'desc' },
          search: { text: 'proj road' }
        })
        expect(afterUpdate.nodes.map((node) => node.id)).toEqual(['fts-title-match'])
      } finally {
        if (nativeDb.isOpen()) {
          await nativeDb.close()
        }
        cleanupDb(dbPath)
      }
    })

    it('uses R-Tree candidates for spatial queries when SQLite supports it', async () => {
      const dbPath = getTestDbPath()
      const nativeDb = await createNativeSQLiteAdapterOrNull(dbPath)
      if (!nativeDb) return

      const nativeAdapter = new SQLiteNodeStorageAdapter(nativeDb, {
        queryVerification: { enabled: true }
      })
      const now = Date.now()

      try {
        await nativeAdapter.importNodes([
          createTestNode({
            id: 'rtree-near-large',
            schemaId: taskSchemaId,
            properties: { title: 'Near large', x: 10, y: 10, width: 20, height: 20 },
            updatedAt: now + 1
          }),
          createTestNode({
            id: 'rtree-near-point',
            schemaId: taskSchemaId,
            properties: { title: 'Near point', x: 40, y: 40 },
            updatedAt: now + 2
          }),
          createTestNode({
            id: 'rtree-far',
            schemaId: taskSchemaId,
            properties: { title: 'Far', x: 500, y: 500, width: 20, height: 20 },
            updatedAt: now + 3
          })
        ])

        const spatial = {
          kind: 'window' as const,
          rect: { x: 0, y: 0, width: 100, height: 100 },
          fields: { x: 'x', y: 'y', width: 'width', height: 'height' }
        }
        const initial = await nativeAdapter.queryNodes({
          schemaId: taskSchemaId,
          includeDeleted: false,
          orderBy: { updatedAt: 'desc' },
          spatial
        })

        expect(initial.nodes.map((node) => node.id)).toEqual([
          'rtree-near-point',
          'rtree-near-large'
        ])
        expect(initial.plan.strategy).toBe('storage-query')
        expect(initial.plan.postFilterReason).toBe('spatial-rtree-verified-in-js')
        expect(initial.plan.candidateAccelerators).toEqual(['rtree'])
        expect(initial.plan.spatialIndexKey).toEqual(expect.any(String))
        expect(initial.plan.sql).toContain('node_spatial_rtree')
        expect(initial.plan.candidateNodeCount).toBe(2)
        expect(initial.plan.parityCheck).toMatchObject({
          strategy: 'exact',
          valid: true,
          expectedNodeCount: 2
        })

        await nativeAdapter.setNode(
          createTestNode({
            id: 'rtree-new',
            schemaId: taskSchemaId,
            properties: { title: 'New', x: 12, y: 12, width: 4, height: 4 },
            updatedAt: now + 4
          })
        )

        const afterInsert = await nativeAdapter.queryNodes({
          schemaId: taskSchemaId,
          includeDeleted: false,
          orderBy: { updatedAt: 'desc' },
          spatial
        })
        expect(afterInsert.nodes.map((node) => node.id)).toEqual([
          'rtree-new',
          'rtree-near-point',
          'rtree-near-large'
        ])

        await nativeAdapter.deleteNode('rtree-near-point')
        const afterDelete = await nativeAdapter.queryNodes({
          schemaId: taskSchemaId,
          includeDeleted: false,
          orderBy: { updatedAt: 'desc' },
          spatial
        })
        expect(afterDelete.nodes.map((node) => node.id)).toEqual(['rtree-new', 'rtree-near-large'])
      } finally {
        if (nativeDb.isOpen()) {
          await nativeDb.close()
        }
        cleanupDb(dbPath)
      }
    })
  })

  describe('adaptive index advisor', () => {
    it('records query descriptor stats without creating indexes by default', async () => {
      await adapter.importNodes([
        createTestNode({
          id: 'task-open',
          schemaId: taskSchemaId,
          properties: { status: 'open' }
        }),
        createTestNode({
          id: 'task-done',
          schemaId: taskSchemaId,
          properties: { status: 'done' }
        })
      ])

      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })
      await adapter.flushQueryTelemetry()
      const stats = await db.queryOne<{
        descriptor_hash: string
        hits: number
        descriptor_json: string
      }>(
        `SELECT descriptor_hash, hits, descriptor_json
         FROM query_descriptor_stats
         WHERE schema_id = ?`,
        [taskSchemaId]
      )
      const adaptiveIndexes = await db.query<{ name: string }>(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'index' AND name LIKE 'idx_auto_prop_%'`
      )

      expect(result.plan.descriptorHash).toBe(stats?.descriptor_hash)
      expect(stats?.hits).toBe(1)
      expect(stats?.descriptor_json).toContain('"where":{"status":"open"}')
      expect(adaptiveIndexes).toEqual([])
    })

    it('creates bounded partial scalar indexes for hot descriptors when enabled', async () => {
      adapter = new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: {
          enabled: true,
          minHits: 1,
          minDurationMs: 0,
          minCandidates: 0,
          maxIndexesPerSchema: 8
        }
      })
      await adapter.importNodes([
        createTestNode({
          id: 'task-open',
          schemaId: taskSchemaId,
          properties: { status: 'open' }
        }),
        createTestNode({
          id: 'task-done',
          schemaId: taskSchemaId,
          properties: { status: 'done' }
        })
      ])

      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })
      const candidates = await db.query<{
        index_name: string
        property_key: string
        value_type: string
        ddl: string
        estimated_bytes: number
        estimated_rows: number
      }>(
        `SELECT index_name, property_key, value_type, ddl, estimated_bytes, estimated_rows
         FROM query_index_candidates
         ORDER BY index_name ASC`
      )
      const adaptiveIndexes = await db.query<{ name: string }>(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'index' AND name LIKE 'idx_auto_prop_%'
         ORDER BY name ASC`
      )

      expect(result.plan.adaptiveIndexNames).toEqual([candidates[0]?.index_name])
      expect(candidates).toHaveLength(1)
      expect(candidates[0].property_key).toBe('status')
      expect(candidates[0].value_type).toBe('text')
      expect(candidates[0].ddl).toContain("property_key = 'status'")
      expect(candidates[0].estimated_bytes).toBeGreaterThan(0)
      expect(candidates[0].estimated_rows).toBe(2)
      expect(adaptiveIndexes.map((row) => row.name)).toEqual([candidates[0].index_name])
    })

    it('enforces the per-schema adaptive index budget', async () => {
      adapter = new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: {
          enabled: true,
          minHits: 1,
          minDurationMs: 0,
          minCandidates: 0,
          maxIndexesPerSchema: 1
        }
      })
      await adapter.importNodes([
        createTestNode({
          id: 'task-open',
          schemaId: taskSchemaId,
          properties: { status: 'open', priority: 1 }
        })
      ])

      await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open', priority: 1 }
      })
      const budgetedIndexes = await db.query<{ index_name: string }>(
        `SELECT index_name
         FROM query_index_candidates
         WHERE schema_id = ?`,
        [taskSchemaId]
      )

      expect(budgetedIndexes).toHaveLength(1)
    })

    it('replaces the least-recently-used adaptive index when the count budget is full', async () => {
      adapter = new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: {
          enabled: true,
          minHits: 1,
          minDurationMs: 0,
          minCandidates: 0,
          maxIndexesPerSchema: 1
        }
      })
      await adapter.importNodes([
        createTestNode({
          id: 'task-open',
          schemaId: taskSchemaId,
          properties: { status: 'open', priority: 1 }
        })
      ])

      await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })
      await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { priority: 1 }
      })
      const candidates = await db.query<{ property_key: string }>(
        `SELECT property_key
         FROM query_index_candidates
         WHERE schema_id = ?
         ORDER BY property_key ASC`,
        [taskSchemaId]
      )

      expect(candidates).toEqual([{ property_key: 'priority' }])
    })

    it('drops stale adaptive indexes before creating new ones', async () => {
      adapter = new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: {
          enabled: true,
          minHits: 1,
          minDurationMs: 0,
          minCandidates: 0,
          maxIndexesPerSchema: 8,
          dropUnusedAfterMs: 1
        }
      })
      await adapter.importNodes([
        createTestNode({
          id: 'task-open',
          schemaId: taskSchemaId,
          properties: { status: 'open', priority: 1 }
        })
      ])

      await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })
      await db.run('UPDATE query_index_candidates SET last_used_at = 0')
      await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { priority: 1 }
      })
      const candidates = await db.query<{ property_key: string }>(
        `SELECT property_key
         FROM query_index_candidates
         WHERE schema_id = ?
         ORDER BY property_key ASC`,
        [taskSchemaId]
      )

      expect(candidates).toEqual([{ property_key: 'priority' }])
    })

    it('skips adaptive indexes that exceed the estimated byte budget', async () => {
      adapter = new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: {
          enabled: true,
          minHits: 1,
          minDurationMs: 0,
          minCandidates: 0,
          maxIndexesPerSchema: 8,
          maxEstimatedBytesPerSchema: 1,
          maxIndexedRowsPerSchema: 10_000
        }
      })
      await adapter.importNodes([
        createTestNode({
          id: 'task-open',
          schemaId: taskSchemaId,
          properties: { status: 'open' }
        })
      ])

      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })
      const candidates = await db.query<{ index_name: string }>(
        'SELECT index_name FROM query_index_candidates'
      )

      expect(result.plan.adaptiveIndexNames).toBeUndefined()
      expect(candidates).toEqual([])
    })

    it('skips adaptive indexes that exceed the indexed-row write budget', async () => {
      adapter = new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: {
          enabled: true,
          minHits: 1,
          minDurationMs: 0,
          minCandidates: 0,
          maxIndexesPerSchema: 8,
          maxEstimatedBytesPerSchema: 10_000,
          maxIndexedRowsPerSchema: 1
        }
      })
      await adapter.importNodes([
        createTestNode({
          id: 'task-open',
          schemaId: taskSchemaId,
          properties: { status: 'open' }
        }),
        createTestNode({
          id: 'task-done',
          schemaId: taskSchemaId,
          properties: { status: 'done' }
        })
      ])

      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })
      const candidates = await db.query<{ index_name: string }>(
        'SELECT index_name FROM query_index_candidates'
      )

      expect(result.plan.adaptiveIndexNames).toBeUndefined()
      expect(candidates).toEqual([])
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
      lamport: lamportTime,
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
      expect(changes[0].lamport).toBe(4)
      expect(changes[1].lamport).toBe(5)
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
      expect(lastChange!.lamport).toBe(5)
    })

    it('getLastChangesByNodeId returns latest changes for multiple nodes', async () => {
      await createNodeForChange('node-1')
      await createNodeForChange('node-2')

      await adapter.appendChanges([
        createTestChange('hash-1', 'node-1', 1),
        createTestChange('hash-2', 'node-1', 5),
        createTestChange('hash-3', 'node-2', 3),
        createTestChange('hash-4', 'node-2', 9)
      ])

      const lastChanges = await adapter.getLastChangesByNodeId([
        'node-2',
        'missing-node',
        'node-1',
        'node-2'
      ])

      expect(Array.from(lastChanges.keys())).toEqual(['node-2', 'node-1'])
      expect(lastChanges.get('node-1')?.hash).toBe('cid:blake3:hash-2')
      expect(lastChanges.get('node-2')?.hash).toBe('cid:blake3:hash-4')
    })

    it('appends multiple changes in one bulk write', async () => {
      await createNodeForChange('node-1')
      await createNodeForChange('node-2')

      await adapter.appendChanges([
        createTestChange('bulk-hash-1', 'node-1', 1),
        createTestChange('bulk-hash-2', 'node-2', 2),
        createTestChange('bulk-hash-3', 'node-1', 3)
      ])

      const changes = await adapter.getAllChanges()
      expect(changes.map((change) => change.hash)).toEqual([
        'cid:blake3:bulk-hash-1',
        'cid:blake3:bulk-hash-2',
        'cid:blake3:bulk-hash-3'
      ])
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
            title: { lamport: i, author: testDID, wallTime: now }
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
          lamport: i,
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

  // ─── Property-sort pushdown + deferred adaptive indexes (0264 W2) ────────────

  describe('property-sort pushdown (0264)', () => {
    beforeEach(async () => {
      const now = Date.now()
      await adapter.importNodes([
        createTestNode({
          id: 'sort-high',
          schemaId: taskSchemaId,
          properties: { title: 'High', priority: 10, done: false },
          updatedAt: now
        }),
        createTestNode({
          id: 'sort-low',
          schemaId: taskSchemaId,
          properties: { title: 'Low', priority: 1, done: false },
          updatedAt: now + 1
        }),
        createTestNode({
          id: 'sort-mid',
          schemaId: taskSchemaId,
          properties: { title: 'Mid', priority: 5, done: false },
          updatedAt: now + 2
        }),
        createTestNode({
          id: 'sort-none',
          schemaId: taskSchemaId,
          properties: { title: 'No priority', done: false },
          updatedAt: now + 3
        })
      ])
    })

    function pushdownAdapter(): SQLiteNodeStorageAdapter {
      return new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: { enabled: true, minHits: 999_999 },
        queryVerification: { enabled: true }
      })
    }

    it('pushes a single custom-property sort down to SQL pagination', async () => {
      const result = await pushdownAdapter().queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { priority: 'desc' },
        limit: 2
      })

      expect(result.plan.strategy).toBe('storage-query')
      expect(result.plan.postFilterReason).toBe('pagination-pushed-down')
      // JS comparator semantics: missing properties sort FIRST descending.
      expect(result.nodes.map((n) => n.id)).toEqual(['sort-none', 'sort-high'])
      // Only the page was hydrated — the pre-0264 shape hydrated ALL rows.
      expect(result.plan.candidateNodeCount).toBe(2)
    })

    it('places missing properties last ascending, first descending (JS parity)', async () => {
      const asc = await pushdownAdapter().queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { priority: 'asc' },
        limit: 4
      })
      expect(asc.nodes.map((n) => n.id)).toEqual(['sort-low', 'sort-mid', 'sort-high', 'sort-none'])

      const desc = await pushdownAdapter().queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { priority: 'desc' },
        limit: 4
      })
      expect(desc.nodes.map((n) => n.id)).toEqual([
        'sort-none',
        'sort-high',
        'sort-mid',
        'sort-low'
      ])
    })

    it('without the flag, property sorts hydrate everything and sort in JS', async () => {
      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { priority: 'desc' },
        limit: 2
      })
      // Same rows, but the whole schema was hydrated to sort a page of 2.
      expect(result.nodes.map((n) => n.id)).toEqual(['sort-none', 'sort-high'])
      expect(result.plan.postFilterReason).not.toBe('pagination-pushed-down')
      expect(result.plan.candidateNodeCount).toBe(4)
    })

    it('multi-key property sorts keep the JS-sorted shape (unsupported for pushdown)', async () => {
      const result = await pushdownAdapter().queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { priority: 'desc', title: 'asc' },
        limit: 2
      })
      expect(result.plan.postFilterReason).not.toBe('pagination-pushed-down')
      expect(result.plan.candidateNodeCount).toBe(4)
    })
  })

  describe('deferred adaptive-index creation (0264)', () => {
    it('routes index creation through the maintenance scheduler', async () => {
      const scheduled: Array<() => Promise<void> | void> = []
      const deferredAdapter = new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: { enabled: true, minHits: 1, minDurationMs: 0, minCandidates: 0 },
        scheduleMaintenance: (task) => {
          scheduled.push(task)
        }
      })
      await deferredAdapter.importNodes([
        createTestNode({
          id: 'defer-open',
          schemaId: taskSchemaId,
          properties: { status: 'open' }
        })
      ])

      const result = await deferredAdapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' }
      })

      // Not created inline: the query's plan carries no names yet…
      expect(result.plan.adaptiveIndexNames).toBeUndefined()
      const before = await db.query<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_auto_prop_%'`
      )
      expect(before).toHaveLength(0)
      expect(scheduled.length).toBeGreaterThan(0)

      // …the idle task creates it.
      for (const task of scheduled) {
        await task()
      }
      const after = await db.query<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_auto_prop_%'`
      )
      expect(after).toHaveLength(1)
    })
  })

  // ─── Fused single-RPC queries (exploration 0264) ─────────────────────────────

  describe('fused single-RPC queries (0264)', () => {
    beforeEach(async () => {
      const now = Date.now()
      await adapter.importNodes(
        Array.from({ length: 5 }, (_, i) =>
          createTestNode({
            id: `fused-${i}`,
            schemaId: taskSchemaId,
            properties: { title: `Fused ${i}`, status: i % 2 === 0 ? 'open' : 'done', done: false },
            createdAt: now + i,
            updatedAt: now + i * 1000
          })
        )
      )
    })

    function countingAdapter(): { db: SQLiteAdapter; queries: string[] } {
      const queries: string[] = []
      const counting = new Proxy(db, {
        get(target, property, receiver) {
          if (property === 'query') {
            return async (sql: string, params?: unknown[]) => {
              queries.push(sql)
              return target.query(sql, params as never)
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        }
      }) as SQLiteAdapter
      return { db: counting, queries }
    }

    it('answers a pushed-down descriptor in ONE query RPC', async () => {
      const { db: counting, queries } = countingAdapter()
      const fusedAdapter = new SQLiteNodeStorageAdapter(counting)
      await primeColumnRepair(fusedAdapter, queries)

      const result = await fusedAdapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { updatedAt: 'desc' },
        limit: 3
      })

      expect(result.nodes).toHaveLength(3)
      expect(result.nodes[0].properties.title).toBe('Fused 4')
      expect(result.plan.postFilterReason).toBe('pagination-pushed-down')
      // ONE round-trip: the candidate CTE feeds the hydrate join directly.
      expect(queries).toHaveLength(1)
      expect(queries[0]).toContain('WITH candidates')
    })

    it('folds count:exact into the same single RPC via COUNT(*) OVER ()', async () => {
      const { db: counting, queries } = countingAdapter()
      const fusedAdapter = new SQLiteNodeStorageAdapter(counting)
      await primeColumnRepair(fusedAdapter, queries)

      const result = await fusedAdapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { updatedAt: 'desc' },
        limit: 2,
        count: 'exact'
      })

      expect(result.nodes).toHaveLength(2)
      expect(result.totalCount).toBe(5)
      expect(queries).toHaveLength(1)
      expect(queries[0]).toContain('COUNT(*) OVER ()')
    })

    it('scalar-where descriptors fuse too, with correct membership', async () => {
      const { db: counting, queries } = countingAdapter()
      const fusedAdapter = new SQLiteNodeStorageAdapter(counting)
      await primeColumnRepair(fusedAdapter, queries)

      const result = await fusedAdapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        limit: 10,
        count: 'exact'
      })

      expect(result.nodes.map((n) => n.id).sort()).toEqual(['fused-0', 'fused-2', 'fused-4'])
      expect(result.totalCount).toBe(3)
      expect(queries).toHaveLength(1)
    })

    it('an empty page at offset 0 reports totalCount 0 without a count RPC', async () => {
      const { db: counting, queries } = countingAdapter()
      const fusedAdapter = new SQLiteNodeStorageAdapter(counting)
      await primeColumnRepair(fusedAdapter, queries)

      const result = await fusedAdapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        where: { status: 'missing-status' },
        orderBy: { updatedAt: 'desc' },
        limit: 5,
        count: 'exact'
      })

      expect(result.nodes).toHaveLength(0)
      expect(result.totalCount).toBe(0)
      expect(queries).toHaveLength(1)
    })

    it('a zero-row page at a deep offset falls back to a real count', async () => {
      const result = await adapter.queryNodes({
        schemaId: taskSchemaId,
        includeDeleted: false,
        orderBy: { updatedAt: 'desc' },
        limit: 2,
        offset: 50,
        count: 'exact'
      })

      expect(result.nodes).toHaveLength(0)
      expect(result.totalCount).toBe(5)
    })
  })

  // ─── Arity padding (exploration 0264) ────────────────────────────────────────

  describe('arity padding for statement-cache hits (0264)', () => {
    beforeEach(async () => {
      await adapter.importNodes(
        Array.from({ length: 9 }, (_, i) =>
          createTestNode({ id: `pad-${i}`, properties: { title: `Pad ${i}` } })
        )
      )
    })

    function capturingAdapter(): { db: SQLiteAdapter; queries: string[] } {
      const queries: string[] = []
      const capturing = new Proxy(db, {
        get(target, property, receiver) {
          if (property === 'query') {
            return async (sql: string, params?: unknown[]) => {
              queries.push(sql)
              return target.query(sql, params as never)
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        }
      }) as SQLiteAdapter
      return { db: capturing, queries }
    }

    it('different-sized hydrates share ONE SQL string (same bucket)', async () => {
      const { db: capturing, queries } = capturingAdapter()
      const padAdapter = new SQLiteNodeStorageAdapter(capturing)
      await primeColumnRepair(padAdapter, queries)

      const three = await padAdapter.getNodes(['pad-0', 'pad-1', 'pad-2'])
      const seven = await padAdapter.getNodes([
        'pad-0',
        'pad-1',
        'pad-2',
        'pad-3',
        'pad-4',
        'pad-5',
        'pad-6'
      ])

      expect(three).toHaveLength(3)
      expect(seven).toHaveLength(7)
      // Both sizes pad to the 10-bucket → identical SQL → stmt-cache hit.
      expect(queries).toHaveLength(2)
      expect(queries[0]).toBe(queries[1])
    })

    it('padding never fabricates rows', async () => {
      const nodes = await adapter.getNodes(['pad-3', 'pad-8', 'ghost-id'])
      expect(nodes.map((n) => n.id).sort()).toEqual(['pad-3', 'pad-8'])
    })

    it('getExistingNodeIds shares SQL across sizes and stays correct', async () => {
      const { db: capturing, queries } = capturingAdapter()
      const padAdapter = new SQLiteNodeStorageAdapter(capturing)

      const two = await padAdapter.getExistingNodeIds(['pad-0', 'ghost'])
      const nine = await padAdapter.getExistingNodeIds(
        Array.from({ length: 9 }, (_, i) => `pad-${i}`)
      )

      expect(two).toEqual(['pad-0'])
      expect(nine).toHaveLength(9)
      expect(queries).toHaveLength(2)
      expect(queries[0]).toBe(queries[1])
    })
  })

  // ─── Hydrate batching (exploration 0263) ─────────────────────────────────────

  describe('hydrate batching (0263)', () => {
    it('sends a multi-chunk hydrate as ONE queryBatch call', async () => {
      // 460 nodes > SQLITE_HYDRATE_NODE_BATCH_SIZE (450) → exactly 2 chunks.
      const bulkNodes = Array.from({ length: 460 }, (_, i) =>
        createTestNode({
          id: `bulk-${String(i).padStart(3, '0')}`,
          properties: { title: `Bulk ${i}` }
        })
      )
      await adapter.importNodes(bulkNodes)

      let queryBatchCalls = 0
      let batchedReadCount = 0
      const countingDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property === 'queryBatch') {
            return async (reads: Array<{ sql: string; params?: unknown[] }>) => {
              queryBatchCalls += 1
              batchedReadCount += reads.length
              return target.queryBatch!(reads as never)
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        }
      }) as SQLiteAdapter
      const batchAdapter = new SQLiteNodeStorageAdapter(countingDb)

      const result = await batchAdapter.queryNodes({
        schemaId: testSchemaId,
        includeDeleted: false
      })

      expect(result.nodes).toHaveLength(460)
      expect(queryBatchCalls).toBe(1)
      expect(batchedReadCount).toBe(2)
    })

    it('keeps single-chunk hydrates on query() so read coalescing still applies', async () => {
      await adapter.importNodes([createTestNode({ id: 'solo-1', properties: { title: 'Solo' } })])

      let queryBatchCalls = 0
      const countingDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property === 'queryBatch') {
            return async (reads: Array<{ sql: string; params?: unknown[] }>) => {
              queryBatchCalls += 1
              return target.queryBatch!(reads as never)
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        }
      }) as SQLiteAdapter
      const soloAdapter = new SQLiteNodeStorageAdapter(countingDb)

      const result = await soloAdapter.queryNodes({
        schemaId: testSchemaId,
        includeDeleted: false
      })

      expect(result.nodes.length).toBeGreaterThan(0)
      expect(queryBatchCalls).toBe(0)
    })
  })

  // ─── Pre-v8 database repair (0305) ─────────────────────────────────────────

  describe('pre-v8 database repair (0305 tiebreak_key)', () => {
    // A database created by a pre-v8 build has no `tiebreak_key` column, and
    // the runtime upgrade path (full DDL re-exec via `CREATE TABLE IF NOT
    // EXISTS`) cannot add it. The repair guard must run before the FIRST
    // node_properties read — a fresh browser session opens a /doc/ page (pure
    // reads) long before any write would have triggered the lazy guard.
    beforeEach(async () => {
      await db.exec(`
        DROP TABLE node_properties;
        CREATE TABLE node_properties (
            node_id TEXT NOT NULL,
            property_key TEXT NOT NULL,
            value BLOB,
            lamport_time INTEGER NOT NULL,
            updated_by TEXT NOT NULL,
            updated_at INTEGER NOT NULL,

            PRIMARY KEY (node_id, property_key),
            FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
        );
      `)
      await db.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['legacy-node', testSchemaId, 1, 1, testDID]
      )
      await db.run(
        `INSERT INTO node_properties (node_id, property_key, value, lamport_time, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['legacy-node', 'title', new TextEncoder().encode(JSON.stringify('Legacy')), 1, testDID, 1]
      )
    })

    it('getNode repairs the missing column instead of throwing', async () => {
      const node = await adapter.getNode('legacy-node')
      expect(node?.properties.title).toBe('Legacy')

      const columns = await db.query<{ name: string }>('PRAGMA table_info(node_properties)')
      expect(columns.some((column) => column.name === 'tiebreak_key')).toBe(true)
    })

    it('listNodes and queryNodes repair the missing column instead of throwing', async () => {
      const listed = await adapter.listNodes({ schemaId: testSchemaId })
      expect(listed.map((node) => node.id)).toContain('legacy-node')

      const queried = await adapter.queryNodes({ schemaId: testSchemaId, includeDeleted: false })
      expect(queried.nodes.map((node) => node.id)).toContain('legacy-node')
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
