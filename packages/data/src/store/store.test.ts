/**
 * Tests for NodeStore
 */

import type { NodeQueryDescriptor, NodeQueryResult } from './query'
import type {
  ApplyNodeBatchInput,
  ApplyNodeBatchResult,
  ContentKeyCache,
  ImportNodesOptions,
  NodeChange,
  NodeContentCipher,
  NodeState,
  NodeStorageAdapter
} from './types'
import type { StoreAuthAPI } from '../auth/store-auth'
import type { SchemaIRI } from '../schema/node'
import type { AuthCheckInput, AuthDecision, DID, PolicyEvaluator, LwwStamp } from '@xnetjs/core'
import { LWW_TIEBREAK_KEY_VERSION, compareLwwStamps, computeLwwTiebreakKey } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
import { describe, it, expect, vi } from 'vitest'
import {
  LensRegistry,
  SchemaDefinitionSchema,
  composeLens,
  rename,
  addDefault,
  convert
} from '../schema'
import { SYSTEM_SCHEMA_BASE_IRIS } from '../schema/schemas/system'
import { MemoryNodeStorageAdapter } from './memory-adapter'
import { PermissionError } from './permission-error'
import { applyNodeQueryDescriptor } from './query'
import { SQLiteNodeStorageAdapter } from './sqlite-adapter'
import { NodeStore } from './store'

// Test fixtures
const TEST_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task'
const TEST_SCHEMA_2: SchemaIRI = 'xnet://xnet.fyi/Page'
const TEST_SOURCE_RECORD_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/social/SourceRecord'

function createTestStore(): {
  store: NodeStore
  adapter: MemoryNodeStorageAdapter
  did: DID
  privateKey: Uint8Array
} {
  const keyPair = generateSigningKeyPair()
  // Use proper did:key encoding with base58btc and Ed25519 multicodec prefix
  const did = createDID(keyPair.publicKey) as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  return { store, adapter, did, privateKey: keyPair.privateKey }
}

function createAuthDecision(input: AuthCheckInput, allowed: boolean): AuthDecision {
  return {
    allowed,
    action: input.action,
    subject: input.subject,
    resource: input.nodeId,
    roles: allowed ? ['owner'] : [],
    grants: [],
    reasons: allowed ? [] : ['DENY_NO_ROLE_MATCH'],
    cached: false,
    evaluatedAt: Date.now(),
    duration: 0
  }
}

function createPairedTestStores(): {
  transactionStore: NodeStore
  importStore: NodeStore
  transactionAdapter: MemoryNodeStorageAdapter
  importAdapter: MemoryNodeStorageAdapter
} {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  const transactionAdapter = new MemoryNodeStorageAdapter()
  const importAdapter = new MemoryNodeStorageAdapter()

  return {
    transactionStore: new NodeStore({
      storage: transactionAdapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    }),
    importStore: new NodeStore({
      storage: importAdapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    }),
    transactionAdapter,
    importAdapter
  }
}

function comparableNodeState(node: NodeState | null): unknown {
  if (!node) return null

  return {
    id: node.id,
    schemaId: node.schemaId,
    properties: node.properties,
    deleted: node.deleted,
    createdBy: node.createdBy,
    updatedBy: node.updatedBy,
    timestamps: Object.fromEntries(
      Object.entries(node.timestamps).map(([key, timestamp]) => [
        key,
        {
          lamport: timestamp.lamport
        }
      ])
    )
  }
}

function comparableChange(change: NodeChange): unknown {
  return {
    type: change.type,
    payload: change.payload,
    lamport: change.lamport,
    authorDID: change.authorDID,
    parentHash: change.parentHash
  }
}

function createAuthEvaluator(canResult: (input: AuthCheckInput) => boolean): PolicyEvaluator {
  return {
    can: vi.fn(async (input: AuthCheckInput) => createAuthDecision(input, canResult(input))),
    explain: vi.fn(async (input: AuthCheckInput) => ({
      ...createAuthDecision(input, canResult(input)),
      steps: []
    })),
    invalidate: vi.fn(),
    invalidateSubject: vi.fn()
  }
}

function createMockStoreAuth(actorDid: DID, allowed: boolean): StoreAuthAPI {
  const createDecision = (action: AuthDecision['action'], nodeId: string): AuthDecision => ({
    allowed,
    action,
    subject: actorDid,
    resource: nodeId,
    roles: allowed ? ['owner'] : [],
    grants: [],
    reasons: allowed ? [] : ['DENY_NO_ROLE_MATCH'],
    cached: false,
    evaluatedAt: Date.now(),
    duration: 0
  })

  return {
    can: vi.fn(async (input) => createDecision(input.action, input.nodeId)),
    explain: vi.fn(async (input) => ({
      ...createDecision(input.action, input.nodeId),
      steps: []
    })),
    grant: vi.fn(async () => {
      throw new Error('not implemented')
    }),
    revoke: vi.fn(async () => undefined),
    listGrants: vi.fn(async () => []),
    listIssuedGrants: vi.fn(async () => []),
    listReceivedGrants: vi.fn(async () => []),
    getOfflinePolicy: vi.fn(() => ({
      decisionCacheTTL: 0,
      maxStaleness: 0,
      revalidation: 'hybrid' as const,
      allowOfflineGrants: true
    })),
    setOfflinePolicy: vi.fn()
  }
}

class QueryCapableMemoryNodeStorageAdapter extends MemoryNodeStorageAdapter {
  readonly queryNodes = vi.fn(async (descriptor: NodeQueryDescriptor): Promise<NodeQueryResult> => {
    // Naive but faithful descriptor execution for tests: list the schema
    // then apply the descriptor in JS. Authorization-scoped reads push the
    // predicate (minus pagination) through this, then authorize + paginate.
    const all = await this.listNodes({
      schemaId: descriptor.schemaId,
      includeDeleted: descriptor.includeDeleted
    })
    const nodes = applyNodeQueryDescriptor(all, descriptor)
    return {
      nodes,
      totalCount: nodes.length,
      plan: {
        strategy: 'storage-query',
        candidateNodeCount: all.length,
        hydratedNodeCount: all.length,
        returnedNodeCount: nodes.length,
        durationMs: 0
      }
    }
  })
}

class TransactionTrackingMemoryNodeStorageAdapter extends MemoryNodeStorageAdapter {
  transactionCalls = 0
  applyBatchCalls = 0

  async withTransaction<T>(fn: (storage: NodeStorageAdapter) => Promise<T>): Promise<T> {
    this.transactionCalls += 1
    return super.withTransaction(fn)
  }

  async applyNodeBatch(input: ApplyNodeBatchInput): Promise<ApplyNodeBatchResult> {
    this.applyBatchCalls += 1
    return super.applyNodeBatch(input)
  }
}

class ImportOptionsTrackingMemoryNodeStorageAdapter extends MemoryNodeStorageAdapter {
  readonly importOptions: ImportNodesOptions[] = []
  readonly applyBatchInputs: ApplyNodeBatchInput[] = []
  rebuildCalls = 0

  async importNodes(nodes: readonly NodeState[], options?: ImportNodesOptions): Promise<void> {
    this.importOptions.push(options ?? {})
    await super.importNodes(nodes, options)
  }

  async applyNodeBatch(input: ApplyNodeBatchInput): Promise<ApplyNodeBatchResult> {
    this.applyBatchInputs.push(input)
    return super.applyNodeBatch(input)
  }

  async rebuildIndexesForSchemas(): Promise<void> {
    this.rebuildCalls += 1
  }
}

function createMockNodeContentCipher() {
  const encrypt = vi.fn<NodeContentCipher['encrypt']>(async ({ content }) => {
    const encoded = new TextDecoder().decode(content)
    return {
      encryptedContent: new TextEncoder().encode(`enc:${encoded}`),
      contentKey: new Uint8Array([1, 2, 3, 4])
    }
  })

  const decrypt = vi.fn<NodeContentCipher['decrypt']>(
    async ({ encryptedContent, cachedContentKey }) => {
      const encoded = new TextDecoder().decode(encryptedContent)
      const withoutPrefix = encoded.startsWith('enc:') ? encoded.slice(4) : encoded
      return {
        content: new TextEncoder().encode(withoutPrefix),
        contentKey: cachedContentKey ?? new Uint8Array([1, 2, 3, 4])
      }
    }
  )

  return {
    cipher: { encrypt, decrypt } satisfies NodeContentCipher,
    encrypt,
    decrypt
  }
}

function createInMemoryContentKeyCache(): ContentKeyCache {
  const cache = new Map<string, Uint8Array>()
  return {
    get: (nodeId) => cache.get(nodeId),
    set: (nodeId, key) => {
      cache.set(nodeId, key)
    },
    delete: (nodeId) => {
      cache.delete(nodeId)
    },
    clear: () => {
      cache.clear()
    }
  }
}

describe('NodeStore', () => {
  describe('CRUD operations', () => {
    it('should create a node', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: {
          title: 'Test Task',
          status: 'todo'
        }
      })

      expect(node.id).toBeDefined()
      expect(node.schemaId).toBe(TEST_SCHEMA)
      expect(node.properties.title).toBe('Test Task')
      expect(node.properties.status).toBe('todo')
      expect(node.deleted).toBe(false)
    })

    it('should create a node with custom ID', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const node = await store.create({
        id: 'custom-id-123',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Custom ID Node' }
      })

      expect(node.id).toBe('custom-id-123')
    })

    it('should get a node by ID', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const created = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Get Test' }
      })

      const fetched = await store.get(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.properties.title).toBe('Get Test')
    })

    it('should return null for non-existent node', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const fetched = await store.get('non-existent-id')
      expect(fetched).toBeNull()
    })

    it('should update a node', async () => {
      const { store, did } = createTestStore()
      await store.initialize()

      const created = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Original', count: 0 }
      })

      const updated = await store.update(created.id, {
        properties: { title: 'Updated', count: 1 }
      })

      expect(updated.properties.title).toBe('Updated')
      expect(updated.properties.count).toBe(1)
      expect(updated.updatedBy).toBe(did)
    })

    it('should update sparse properties (only changed ones)', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const created = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Original', status: 'todo', priority: 'high' }
      })

      // Only update title
      const updated = await store.update(created.id, {
        properties: { title: 'Updated Title' }
      })

      expect(updated.properties.title).toBe('Updated Title')
      expect(updated.properties.status).toBe('todo') // Unchanged
      expect(updated.properties.priority).toBe('high') // Unchanged
    })

    it('should throw when updating non-existent node', async () => {
      const { store } = createTestStore()
      await store.initialize()

      await expect(store.update('non-existent', { properties: { title: 'Test' } })).rejects.toThrow(
        'Node not found'
      )
    })

    it('should soft delete a node', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const created = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'To Delete' }
      })

      await store.delete(created.id)

      const fetched = await store.get(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.deleted).toBe(true)
    })

    it('should restore a deleted node', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const created = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'To Restore' }
      })

      await store.delete(created.id)
      const restored = await store.restore(created.id)

      expect(restored.deleted).toBe(false)
      expect(restored.properties.title).toBe('To Restore')
    })
  })

  describe('list operations', () => {
    it('should list all nodes', async () => {
      const { store } = createTestStore()
      await store.initialize()

      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Node 1' } })
      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Node 2' } })
      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Node 3' } })

      const nodes = await store.list()
      expect(nodes).toHaveLength(3)
    })

    it('should filter by schema', async () => {
      const { store } = createTestStore()
      await store.initialize()

      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Task 1' } })
      await store.create({ schemaId: TEST_SCHEMA_2, properties: { title: 'Page 1' } })
      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Task 2' } })

      const tasks = await store.list({ schemaId: TEST_SCHEMA })
      expect(tasks).toHaveLength(2)
      expect(tasks.every((n) => n.schemaId === TEST_SCHEMA)).toBe(true)
    })

    it('should exclude deleted nodes by default', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const node1 = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Keep' } })
      const node2 = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Delete' } })
      await store.delete(node2.id)

      const nodes = await store.list()
      expect(nodes).toHaveLength(1)
      expect(nodes[0].id).toBe(node1.id)
    })

    it('should include deleted nodes when requested', async () => {
      const { store } = createTestStore()
      await store.initialize()

      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Keep' } })
      const node2 = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Delete' } })
      await store.delete(node2.id)

      const nodes = await store.list({ includeDeleted: true })
      expect(nodes).toHaveLength(2)
    })

    it('should support pagination', async () => {
      const { store } = createTestStore()
      await store.initialize()

      for (let i = 0; i < 10; i++) {
        await store.create({ schemaId: TEST_SCHEMA, properties: { title: `Node ${i}` } })
      }

      const page1 = await store.list({ limit: 3, offset: 0 })
      const page2 = await store.list({ limit: 3, offset: 3 })

      expect(page1).toHaveLength(3)
      expect(page2).toHaveLength(3)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('change tracking', () => {
    it('should track changes for a node', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Original' }
      })

      await store.update(node.id, { properties: { title: 'Update 1' } })
      await store.update(node.id, { properties: { title: 'Update 2' } })

      const changes = await store.getChanges(node.id)
      expect(changes).toHaveLength(3) // create + 2 updates
    })

    it('should get all changes', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const node1 = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Node 1' }
      })
      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Node 2' } })
      await store.update(node1.id, { properties: { title: 'Updated' } })

      const allChanges = await store.getAllChanges()
      expect(allChanges).toHaveLength(3)
    })

    it('should maintain Lamport time across operations', async () => {
      const { store } = createTestStore()
      await store.initialize()

      expect(store.getCurrentLamportTime()).toBe(0)

      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Node 1' } })
      expect(store.getCurrentLamportTime()).toBe(1)

      await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Node 2' } })
      expect(store.getCurrentLamportTime()).toBe(2)
    })
  })

  describe('LWW conflict resolution', () => {
    it('should resolve conflicts using Lamport timestamps', async () => {
      // Create two stores simulating two devices
      const store1Setup = createTestStore()
      const store2Setup = createTestStore()
      await store1Setup.store.initialize()
      await store2Setup.store.initialize()

      // Store 1 creates a node
      const node = await store1Setup.store.create({
        id: 'shared-node',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Original', count: 0 }
      })

      // Get the change from store 1
      const changes1 = await store1Setup.store.getChanges(node.id)

      // Apply to store 2 (simulating sync)
      for (const change of changes1) {
        await store2Setup.store.applyRemoteChange(change)
      }

      // Store 1 updates (Lamport time 2)
      await store1Setup.store.update('shared-node', { properties: { title: 'Store 1 Update' } })

      // Get store 1's update and sync to store 2
      const store1Update = (await store1Setup.store.getChanges('shared-node'))[1]
      await store2Setup.store.applyRemoteChange(store1Update)

      // Now store 2 updates (Lamport time 3 - higher because it received store 1's update)
      await store2Setup.store.update('shared-node', { properties: { title: 'Store 2 Update' } })

      // Get store 2's update and sync back to store 1
      const store2Changes = await store2Setup.store.getChanges('shared-node')
      const store2Latest = store2Changes[store2Changes.length - 1]
      await store1Setup.store.applyRemoteChange(store2Latest)

      // Both should converge to store 2's value (higher Lamport time)
      const node1 = await store1Setup.store.get('shared-node')
      const node2 = await store2Setup.store.get('shared-node')

      expect(node1!.properties.title).toBe('Store 2 Update')
      expect(node2!.properties.title).toBe('Store 2 Update')
    })

    it('applyRemoteChanges skips one un-appliable change without aborting the batch (0206)', async () => {
      const source = createTestStore()
      const target = createTestStore()
      await source.store.initialize()
      await target.store.initialize()

      const node = await source.store.create({
        id: 'good-node',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Good' }
      })
      const [validChange] = await source.store.getChanges(node.id)

      // A tampered change (its hash no longer matches its payload) — verification
      // throws. It must be skipped, not abort the whole batch.
      const badChange: NodeChange = {
        ...validChange,
        payload: { ...validChange.payload, nodeId: 'bad-node' }
      }

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await expect(
        target.store.applyRemoteChanges([badChange, validChange])
      ).resolves.toBeUndefined()
      warn.mockRestore()

      // The valid change still applied despite the bad one in the same batch.
      expect(await target.store.get('good-node')).not.toBeNull()
      expect(await target.store.get('bad-node')).toBeNull()
    })

    it('should track conflicts', async () => {
      const store1Setup = createTestStore()
      const store2Setup = createTestStore()
      await store1Setup.store.initialize()
      await store2Setup.store.initialize()

      // Store 1 creates a node
      const node = await store1Setup.store.create({
        id: 'conflict-node',
        schemaId: TEST_SCHEMA,
        properties: { value: 'initial' }
      })

      // Get the create change
      const createChanges = await store1Setup.store.getChanges(node.id)

      // Apply create to store 2
      await store2Setup.store.applyRemoteChange(createChanges[0])

      // Store 1 updates
      await store1Setup.store.update('conflict-node', { properties: { value: 'store1' } })

      // Get store 1's update change
      const store1Changes = await store1Setup.store.getChanges('conflict-node')
      const store1Update = store1Changes[1]

      // Store 2 receives store 1's update first (so store 2 will be at Lamport time 2)
      await store2Setup.store.applyRemoteChange(store1Update)

      // Store 2 updates (now at Lamport time 3 - higher than store 1's update)
      await store2Setup.store.update('conflict-node', { properties: { value: 'store2' } })

      // Final value should be store2 (higher Lamport time)
      const finalNode = await store2Setup.store.get('conflict-node')
      expect(finalNode!.properties.value).toBe('store2')

      // Conflicts should have been tracked during the updates
      const conflicts = store2Setup.store.getRecentConflicts()
      expect(conflicts.length).toBeGreaterThan(0)

      // Find the conflict for the 'value' property
      const valueConflict = conflicts.find((c) => c.key === 'value')
      expect(valueConflict).toBeDefined()
      // A winning cross-author write over a differing value is informational
      // LWW housekeeping, not a true conflict (exploration 0296).
      expect(valueConflict?.kind).toBe('lww-resolution')
    })

    // Conflict-predicate golden vectors (exploration 0296): same-author
    // causal history, idempotent replays, and equal values never record;
    // only divergent cross-author writes do.
    it('does not record conflicts for same-author sequential writes', async () => {
      const { store } = createTestStore()
      await store.initialize()

      await store.create({ id: 'seq-node', schemaId: TEST_SCHEMA, properties: { value: 'a' } })
      await store.update('seq-node', { properties: { value: 'b' } })
      await store.update('seq-node', { properties: { value: 'c' } })

      expect(store.getRecentConflicts()).toHaveLength(0)
    })

    it('does not record a conflict when a stale same-author change is applied', async () => {
      const source = createTestStore()
      const target = createTestStore()
      await source.store.initialize()
      await target.store.initialize()

      await source.store.create({
        id: 'stale-node',
        schemaId: TEST_SCHEMA,
        properties: { value: 'v1' }
      })
      await source.store.update('stale-node', { properties: { value: 'v2' } })
      await source.store.update('stale-node', { properties: { value: 'v3' } })
      const [createChange, update1, update2] = await source.store.getChanges('stale-node')

      // Deliver out of order: v3 lands, then the stale v2 arrives late (the
      // hub-backfill shape from exploration 0296). Same author on both sides
      // is causal history, not a conflict.
      await target.store.applyRemoteChange(createChange)
      await target.store.applyRemoteChange(update2)
      await target.store.applyRemoteChange(update1)

      const node = await target.store.get('stale-node')
      expect(node!.properties.value).toBe('v3')
      expect(target.store.getRecentConflicts()).toHaveLength(0)
    })

    it('applies a redelivered change idempotently without growing the log', async () => {
      const source = createTestStore()
      const target = createTestStore()
      await source.store.initialize()
      await target.store.initialize()

      await source.store.create({
        id: 'replay-node',
        schemaId: TEST_SCHEMA,
        properties: { value: 'once' }
      })
      const [createChange] = await source.store.getChanges('replay-node')

      await target.store.applyRemoteChange(createChange)
      await target.store.applyRemoteChange(createChange)
      await target.store.applyRemoteChange(createChange)

      const log = await target.store.getChanges('replay-node')
      expect(log).toHaveLength(1)
      expect((await target.store.get('replay-node'))!.properties.value).toBe('once')
      expect(target.store.getRecentConflicts()).toHaveLength(0)
    })

    it('records a true conflict when a cross-author write loses to a newer local value', async () => {
      const source = createTestStore()
      const target = createTestStore()
      await source.store.initialize()
      await target.store.initialize()

      await source.store.create({
        id: 'cross-node',
        schemaId: TEST_SCHEMA,
        properties: { value: 'origin' }
      })
      await source.store.update('cross-node', { properties: { value: 'source-edit' } })
      const [createChange, sourceUpdate] = await source.store.getChanges('cross-node')

      await target.store.applyRemoteChange(createChange)
      // Target edits locally first (fresh lamport beats the source update)…
      await target.store.update('cross-node', { properties: { value: 'target-edit' } })
      target.store.clearConflicts()
      // …then the divergent cross-author write arrives late and loses.
      await target.store.applyRemoteChange(sourceUpdate)

      const node = await target.store.get('cross-node')
      expect(node!.properties.value).toBe('target-edit')

      const conflicts = target.store.getRecentConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toMatchObject({
        key: 'value',
        localValue: 'target-edit',
        remoteValue: 'source-edit',
        resolved: 'local',
        kind: 'conflict'
      })
    })

    it('does not record anything when a cross-author write carries an equal value', async () => {
      const source = createTestStore()
      const target = createTestStore()
      await source.store.initialize()
      await target.store.initialize()

      await source.store.create({
        id: 'equal-node',
        schemaId: TEST_SCHEMA,
        properties: { value: 'same' }
      })
      const [createChange] = await source.store.getChanges('equal-node')
      await target.store.applyRemoteChange(createChange)

      // Cross-author write of the identical value: no divergence to report.
      await target.store.update('equal-node', { properties: { value: 'same' } })

      expect(target.store.getRecentConflicts()).toHaveLength(0)
    })
  })

  describe('metadata tracking', () => {
    it('should track createdAt and createdBy', async () => {
      const { store, did } = createTestStore()
      await store.initialize()

      const before = Date.now()
      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Test' }
      })
      const after = Date.now()

      expect(node.createdBy).toBe(did)
      expect(node.createdAt).toBeGreaterThanOrEqual(before)
      expect(node.createdAt).toBeLessThanOrEqual(after)
    })

    it('should track updatedAt and updatedBy', async () => {
      const { store, did } = createTestStore()
      await store.initialize()

      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Original' }
      })

      const originalUpdatedAt = node.updatedAt

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = await store.update(node.id, {
        properties: { title: 'Updated' }
      })

      expect(updated.updatedBy).toBe(did)
      expect(updated.updatedAt).toBeGreaterThan(originalUpdatedAt)
    })

    it('should track per-property timestamps', async () => {
      const { store } = createTestStore()
      await store.initialize()

      const node = await store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Original', count: 0 }
      })

      // Update only title
      await store.update(node.id, { properties: { title: 'Updated' } })

      const fetched = await store.get(node.id)

      // Title should have newer timestamp than count
      expect(fetched!.timestamps.title.lamport).toBeGreaterThan(fetched!.timestamps.count.lamport)
    })
  })
})

describe('transaction support', () => {
  it('should execute multiple operations in a single transaction', async () => {
    const { store } = createTestStore()
    await store.initialize()

    // Create a node first
    const existingNode = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Existing', status: 'active' }
    })

    // Execute transaction with multiple operations
    const result = await store.transaction([
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'New Task 1' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'New Task 2' } } },
      { type: 'update', nodeId: existingNode.id, options: { properties: { status: 'completed' } } }
    ])

    // Verify results
    expect(result.batchId).toBeDefined()
    expect(result.batchId).toMatch(/^batch-/)
    expect(result.results).toHaveLength(3)
    expect(result.changes).toHaveLength(3)

    // Verify all changes share the same batchId
    for (const change of result.changes) {
      expect(change.batchId).toBe(result.batchId)
    }

    // Verify batch indices
    expect(result.changes[0].batchIndex).toBe(0)
    expect(result.changes[1].batchIndex).toBe(1)
    expect(result.changes[2].batchIndex).toBe(2)

    // Verify batch size
    for (const change of result.changes) {
      expect(change.batchSize).toBe(3)
    }
  })

  it('should delegate non-empty transaction batches to storage transaction owner', async () => {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new TransactionTrackingMemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    })
    await store.initialize()

    await store.transaction([
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 1' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 2' } } }
    ])

    // The batch lands through one storage-owned atomic apply instead of the
    // legacy per-operation writes inside withTransaction.
    expect(adapter.applyBatchCalls).toBe(1)
    expect(adapter.transactionCalls).toBe(0)
    expect(adapter.getNodeCount()).toBe(2)
    expect(adapter.getChangeCount()).toBe(2)
  })

  it('should roll back storage writes when a transaction operation fails', async () => {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new TransactionTrackingMemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    })
    await store.initialize()
    const timeBefore = store.getCurrentLamportTime()

    await expect(
      store.transaction([
        { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Created' } } },
        {
          type: 'update',
          nodeId: 'missing-node',
          options: { properties: { title: 'Missing' } }
        }
      ])
    ).rejects.toThrow('Node not found')

    // The failure happens during in-memory materialization, before any
    // storage write — nothing to roll back, nothing persisted.
    expect(adapter.applyBatchCalls).toBe(0)
    expect(adapter.getNodeCount()).toBe(0)
    expect(adapter.getChangeCount()).toBe(0)
    expect(store.getCurrentLamportTime()).toBe(timeBefore)
  })

  it('should use the same Lamport timestamp for all operations in a batch', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const result = await store.transaction([
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 1' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 2' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 3' } } }
    ])

    // All changes should have the same Lamport time
    const lamportTime = result.changes[0].lamport
    for (const change of result.changes) {
      expect(change.lamport).toBe(lamportTime)
    }
  })

  it('should handle delete and restore in transaction', async () => {
    const { store } = createTestStore()
    await store.initialize()

    // Create nodes first
    const node1 = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Node 1' } })
    const node2 = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Node 2' } })
    await store.delete(node2.id)

    // Transaction with delete and restore
    const result = await store.transaction([
      { type: 'delete', nodeId: node1.id },
      { type: 'restore', nodeId: node2.id }
    ])

    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toBeNull() // delete returns null
    expect(result.results[1]?.deleted).toBe(false) // restore returns restored node

    // Verify actual state
    const fetchedNode1 = await store.get(node1.id)
    const fetchedNode2 = await store.get(node2.id)

    expect(fetchedNode1?.deleted).toBe(true)
    expect(fetchedNode2?.deleted).toBe(false)
  })

  it('should return empty result for empty transaction', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const result = await store.transaction([])

    expect(result.batchId).toBe('')
    expect(result.results).toHaveLength(0)
    expect(result.changes).toHaveLength(0)
  })

  it('should throw if updating non-existent node in transaction', async () => {
    const { store } = createTestStore()
    await store.initialize()

    await expect(
      store.transaction([
        { type: 'update', nodeId: 'non-existent', options: { properties: { title: 'Test' } } }
      ])
    ).rejects.toThrow('Node not found')
  })

  it('should increment Lamport time only once for entire transaction', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const timeBefore = store.getCurrentLamportTime()

    await store.transaction([
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 1' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 2' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 3' } } }
    ])

    // Only one tick for the entire transaction
    expect(store.getCurrentLamportTime()).toBe(timeBefore + 1)
  })

  it('should emit events for each operation in transaction', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const events: { nodeId: string; title: unknown }[] = []
    const unsubscribe = store.subscribe((event) => {
      events.push({
        nodeId: event.change.payload.nodeId,
        title: event.node?.properties.title
      })
    })

    await store.transaction([
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 1' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 2' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 3' } } }
    ])

    unsubscribe()

    // Should emit 3 events, one per operation
    expect(events).toHaveLength(3)
    expect(events[0].title).toBe('Task 1')
    expect(events[1].title).toBe('Task 2')
    expect(events[2].title).toBe('Task 3')
  })
})

describe('node-scoped subscriptions', () => {
  it('dispatches only the subscribed node and stops after unsubscribe', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const watched = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Watched' }
    })
    const other = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Other' }
    })

    const titles: unknown[] = []
    const unsubscribe = store.subscribeToNode(watched.id, (event) => {
      titles.push(event.node?.properties.title)
    })

    await store.update(other.id, { properties: { title: 'Other edited' } })
    await store.update(watched.id, { properties: { title: 'Watched edited' } })

    expect(titles).toEqual(['Watched edited'])

    unsubscribe()
    await store.update(watched.id, { properties: { title: 'After unsubscribe' } })

    expect(titles).toEqual(['Watched edited'])
  })
})

describe('bulk existence lookup', () => {
  it('should return existing node ids without hydrating nodes through the public read path', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const first = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'First' }
    })
    const second = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Second' }
    })

    await expect(
      store.getExistingNodeIds([second.id, 'missing-node', first.id, second.id])
    ).resolves.toEqual([second.id, first.id])
  })
})

describe('deterministic node import', () => {
  it('imports deterministic nodes as signed batched changes', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const events: string[] = []
    const unsubscribe = store.subscribe((event) => {
      if (event.node) events.push(event.node.id)
    })

    const result = await store.importDeterministicNodes([
      {
        id: 'import-node-1',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Imported 1' }
      },
      {
        id: 'import-node-2',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Imported 2' }
      }
    ])

    unsubscribe()

    expect(result.created).toBe(2)
    expect(result.updated).toBe(0)
    expect(result.nodes.map((node) => node.id)).toEqual(['import-node-1', 'import-node-2'])
    expect(result.changes).toHaveLength(2)
    expect(result.changes.map((change) => change.batchId)).toEqual([result.batchId, result.batchId])
    expect(result.changes.map((change) => change.batchIndex)).toEqual([0, 1])
    expect(result.changes.map((change) => change.batchSize)).toEqual([2, 2])
    expect(result.changes.every((change) => change.parentHash === null)).toBe(true)
    expect(result.storage).toMatchObject({
      nodeRowsWritten: 2,
      propertyRowsWritten: 2,
      changeRowsWritten: 2
    })
    expect(result.timings.totalMs).toBeGreaterThanOrEqual(0)
    expect(events).toEqual(['import-node-1', 'import-node-2'])

    await expect(store.get('import-node-1')).resolves.toMatchObject({
      id: 'import-node-1',
      properties: { title: 'Imported 1' }
    })
  })

  it('updates existing deterministic nodes and links parent hashes', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const first = await store.importDeterministicNodes([
      {
        id: 'import-node-existing',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Before', status: 'open' }
      }
    ])
    const second = await store.importDeterministicNodes([
      {
        id: 'import-node-existing',
        schemaId: TEST_SCHEMA,
        properties: { title: 'After' }
      }
    ])

    expect(second.created).toBe(0)
    expect(second.updated).toBe(1)
    expect(second.changes[0].parentHash).toBe(first.changes[0].hash)
    await expect(store.get('import-node-existing')).resolves.toMatchObject({
      properties: { title: 'After', status: 'open' }
    })
  })

  it('chains duplicate deterministic ids within the same import batch with existing LWW semantics', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const result = await store.importDeterministicNodes([
      {
        id: 'duplicate-import-node',
        schemaId: TEST_SCHEMA,
        properties: { title: 'First' }
      },
      {
        id: 'duplicate-import-node',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Second' }
      }
    ])

    expect(result.created).toBe(1)
    expect(result.updated).toBe(1)
    expect(result.nodes).toHaveLength(1)
    expect(result.changes[1].parentHash).toBe(result.changes[0].hash)
    // Both writes are same-author, same node, same property at the same logical
    // time — a degenerate tie. Under protocol v4 (exploration 0300) the winner
    // is decided by the grinding-resistant tiebreak key, not "first applied".
    // Fold the two actual changes through the real comparator to get it.
    const stampFor = (c: (typeof result.changes)[number]): LwwStamp => ({
      lamport: c.lamport,
      wallTime: c.wallTime,
      author: c.authorDID,
      ...((c.protocolVersion ?? 0) >= LWW_TIEBREAK_KEY_VERSION
        ? {
            tiebreakKey: computeLwwTiebreakKey(
              c.authorDID,
              'title',
              (c.payload.properties as Record<string, unknown>).title
            )
          }
        : {})
    })
    const winner =
      compareLwwStamps(stampFor(result.changes[1]), stampFor(result.changes[0])) > 0
        ? 'Second'
        : 'First'
    await expect(store.get('duplicate-import-node')).resolves.toMatchObject({
      properties: { title: winner }
    })
  })

  it('delegates deterministic import writes to storage-owned batch apply', async () => {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new TransactionTrackingMemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    })
    await store.initialize()

    await store.importDeterministicNodes([
      {
        id: 'transaction-owned-import-node',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Transaction-owned' }
      }
    ])

    expect(adapter.applyBatchCalls).toBe(1)
    expect(adapter.transactionCalls).toBe(0)
  })

  it('exposes deterministic imports through batchWrite with storage counters and timings', async () => {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new ImportOptionsTrackingMemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    })
    await store.initialize()

    const result = await store.batchWrite({
      kind: 'deterministic-import',
      drafts: [
        {
          id: 'batch-write-import-node',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Batch write import' }
        }
      ]
    })

    expect(result).toMatchObject({
      created: 1,
      updated: 0,
      nodeIds: ['batch-write-import-node'],
      schemaIds: [TEST_SCHEMA],
      changeCount: 1,
      storage: {
        nodeRowsWritten: 1,
        propertyRowsWritten: 1,
        changeRowsWritten: 1
      }
    })
    expect(result.batchId).toBeTruthy()
    expect(result.timings.totalMs).toBeGreaterThanOrEqual(0)
    expect(adapter.applyBatchInputs[0]).toMatchObject({
      indexMode: 'touched'
    })
    await expect(store.get('batch-write-import-node')).resolves.toMatchObject({
      properties: { title: 'Batch write import' }
    })
  })

  it('supports silent notifications for deterministic batchWrite imports', async () => {
    const { store } = createTestStore()
    await store.initialize()
    const events: string[] = []
    const unsubscribe = store.subscribe((event) => {
      if (event.node) events.push(event.node.id)
    })

    const result = await store.batchWrite({
      kind: 'deterministic-import',
      drafts: [
        {
          id: 'silent-batch-write-node',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Silent batch write' }
        }
      ],
      policy: { notificationMode: 'silent' }
    })

    unsubscribe()

    expect(result.nodeIds).toEqual(['silent-batch-write-node'])
    expect(events).toEqual([])
    await expect(store.get('silent-batch-write-node')).resolves.toMatchObject({
      properties: { title: 'Silent batch write' }
    })
  })

  it('emits one batch notification for deterministic batchWrite imports when requested', async () => {
    const { store } = createTestStore()
    await store.initialize()
    const nodeEvents: string[] = []
    const batchEvents: string[][] = []
    const unsubscribeNodes = store.subscribe((event) => {
      if (event.node) nodeEvents.push(event.node.id)
    })
    const unsubscribeBatches = store.subscribeToBatchChanges((event) => {
      batchEvents.push(event.nodeIds)
    })

    const result = await store.batchWrite({
      kind: 'deterministic-import',
      drafts: [
        {
          id: 'batch-event-node-1',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Batch event 1' }
        },
        {
          id: 'batch-event-node-2',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Batch event 2' }
        }
      ],
      policy: { notificationMode: 'batch' }
    })

    unsubscribeNodes()
    unsubscribeBatches()

    expect(result.nodeIds).toEqual(['batch-event-node-1', 'batch-event-node-2'])
    expect(nodeEvents).toEqual([])
    expect(batchEvents).toEqual([['batch-event-node-1', 'batch-event-node-2']])
  })

  it('matches transaction materialization for operation batch writes with creates, updates, deletes, and duplicate IDs', async () => {
    const { transactionStore, importStore } = createPairedTestStores()
    await transactionStore.initialize()
    await importStore.initialize()

    const seedOperations = [
      {
        type: 'create' as const,
        options: {
          id: 'operation-batch-update-node',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Before', status: 'open' }
        }
      },
      {
        type: 'create' as const,
        options: {
          id: 'operation-batch-delete-node',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Delete me', status: 'open' }
        }
      }
    ]
    await transactionStore.transaction(seedOperations)
    await importStore.transaction(seedOperations)

    const operations = [
      {
        type: 'create' as const,
        options: {
          id: 'operation-batch-create-node',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Created', status: 'open' }
        }
      },
      {
        type: 'update' as const,
        nodeId: 'operation-batch-update-node',
        options: { properties: { title: 'After' } }
      },
      {
        type: 'delete' as const,
        nodeId: 'operation-batch-delete-node'
      },
      {
        type: 'create' as const,
        options: {
          id: 'operation-batch-duplicate-node',
          schemaId: TEST_SCHEMA,
          properties: { title: 'First' }
        }
      },
      {
        type: 'update' as const,
        nodeId: 'operation-batch-duplicate-node',
        options: { properties: { title: 'Second', status: 'deduped' } }
      }
    ]

    await transactionStore.transaction(operations)
    const result = await importStore.batchWrite({
      kind: 'operations',
      operations,
      policy: { notificationMode: 'silent' }
    })

    expect(result).toMatchObject({
      created: 2,
      updated: 3,
      nodeIds: [
        'operation-batch-create-node',
        'operation-batch-update-node',
        'operation-batch-delete-node',
        'operation-batch-duplicate-node'
      ],
      schemaIds: [TEST_SCHEMA],
      changeCount: operations.length
    })

    for (const nodeId of result.nodeIds) {
      expect(comparableNodeState(await importStore.get(nodeId))).toEqual(
        comparableNodeState(await transactionStore.get(nodeId))
      )
    }
  })

  it('maintains import indexes incrementally instead of rebuilding per chunk', async () => {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new ImportOptionsTrackingMemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    })
    await store.initialize()

    await store.importDeterministicNodes([
      {
        id: 'incremental-index-import-node',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Incremental index import' }
      }
    ])

    expect(adapter.importOptions).toHaveLength(0)
    expect(adapter.applyBatchInputs).toHaveLength(1)
    expect(adapter.applyBatchInputs[0]).toMatchObject({
      indexMode: 'touched',
      indexProperties: true
    })
    expect(adapter.rebuildCalls).toBe(0)
  })

  it('can defer deterministic import indexes for a caller-owned final rebuild', async () => {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new ImportOptionsTrackingMemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    })
    await store.initialize()

    const result = await store.importDeterministicNodes(
      [
        {
          id: 'deferred-index-import-node',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Deferred index import' }
        }
      ],
      { deferIndexes: true }
    )

    expect(result.affectedSchemaIds).toEqual([TEST_SCHEMA])
    expect(adapter.importOptions).toHaveLength(0)
    expect(adapter.applyBatchInputs[0]).toMatchObject({
      indexMode: 'defer-schema',
      indexProperties: true
    })

    await store.rebuildIndexesForSchemas(result.affectedSchemaIds)
    expect(adapter.rebuildCalls).toBe(1)
  })

  it('matches generic transaction materialization for deterministic creates', async () => {
    const { transactionStore, importStore } = createPairedTestStores()
    await transactionStore.initialize()
    await importStore.initialize()

    const draft = {
      id: 'parity-create-node',
      schemaId: TEST_SCHEMA,
      properties: { title: 'Created', status: 'open', priority: 2 }
    }

    const transactionResult = await transactionStore.transaction([
      {
        type: 'create',
        options: draft
      }
    ])
    const importResult = await importStore.importDeterministicNodes([draft])

    expect(importResult.created).toBe(1)
    expect(importResult.updated).toBe(0)
    expect(comparableNodeState(await importStore.get(draft.id))).toEqual(
      comparableNodeState(await transactionStore.get(draft.id))
    )
    expect(importResult.changes.map(comparableChange)).toEqual(
      transactionResult.changes.map(comparableChange)
    )
  })

  it('matches generic transaction materialization for deterministic updates', async () => {
    const { transactionStore, importStore } = createPairedTestStores()
    await transactionStore.initialize()
    await importStore.initialize()

    await transactionStore.transaction([
      {
        type: 'create',
        options: {
          id: 'parity-update-node',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Before', status: 'open' }
        }
      }
    ])
    await importStore.importDeterministicNodes([
      {
        id: 'parity-update-node',
        schemaId: TEST_SCHEMA,
        properties: { title: 'Before', status: 'open' }
      }
    ])

    await transactionStore.transaction([
      {
        type: 'update',
        nodeId: 'parity-update-node',
        options: { properties: { title: 'After' } }
      }
    ])
    const importResult = await importStore.importDeterministicNodes([
      {
        id: 'parity-update-node',
        schemaId: TEST_SCHEMA,
        properties: { title: 'After' }
      }
    ])

    expect(importResult.created).toBe(0)
    expect(importResult.updated).toBe(1)
    expect(comparableNodeState(await importStore.get('parity-update-node'))).toEqual(
      comparableNodeState(await transactionStore.get('parity-update-node'))
    )
  })

  it('matches generic transaction LWW behavior when an existing property has a newer Lamport time', async () => {
    const { transactionStore, importStore, transactionAdapter, importAdapter } =
      createPairedTestStores()
    await transactionStore.initialize()
    await importStore.initialize()

    const lockedNode: NodeState = {
      id: 'parity-lww-node',
      schemaId: TEST_SCHEMA,
      properties: { title: 'Locked', status: 'kept' },
      timestamps: {
        title: { lamport: 50, author: 'did:key:remote' as DID, wallTime: 50 },
        status: { lamport: 50, author: 'did:key:remote' as DID, wallTime: 50 }
      },
      deleted: false,
      createdAt: 50,
      createdBy: 'did:key:remote' as DID,
      updatedAt: 50,
      updatedBy: 'did:key:remote' as DID
    }
    await transactionAdapter.setNode(structuredClone(lockedNode))
    await importAdapter.setNode(structuredClone(lockedNode))

    await transactionStore.transaction([
      {
        type: 'update',
        nodeId: lockedNode.id,
        options: { properties: { status: 'ignored' } }
      }
    ])
    await importStore.importDeterministicNodes([
      {
        id: lockedNode.id,
        schemaId: TEST_SCHEMA,
        properties: { status: 'ignored' }
      }
    ])

    expect(comparableNodeState(await importStore.get(lockedNode.id))).toEqual(
      comparableNodeState(await transactionStore.get(lockedNode.id))
    )
    expect((await importStore.get(lockedNode.id))?.properties.status).toBe('kept')
  })

  it('matches generic transaction materialization for source-record-shaped nodes', async () => {
    const { transactionStore, importStore } = createPairedTestStores()
    await transactionStore.initialize()
    await importStore.initialize()

    const draft = {
      id: 'parity-source-record',
      schemaId: TEST_SOURCE_RECORD_SCHEMA,
      properties: {
        platform: 'youtube',
        bucketId: 'youtube.history',
        sourcePath: 'Takeout/YouTube/history/watch-history.json',
        recordKey: 'watch-123',
        raw: {
          title: 'Example video',
          channel: 'Example Channel',
          watchedAt: '2026-06-08T12:00:00.000Z'
        }
      }
    }

    await transactionStore.transaction([
      {
        type: 'create',
        options: draft
      }
    ])
    await importStore.importDeterministicNodes([draft])

    expect(comparableNodeState(await importStore.get(draft.id))).toEqual(
      comparableNodeState(await transactionStore.get(draft.id))
    )
  })
})

describe('authorization enforcement', () => {
  it('should throw PermissionError when create is denied', async () => {
    const { adapter, did, privateKey } = createTestStore()
    const evaluator = createAuthEvaluator(() => false)
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: privateKey,
      authEvaluator: evaluator
    })
    await store.initialize()

    await expect(
      store.create({
        schemaId: TEST_SCHEMA,
        properties: { title: 'Denied create' }
      })
    ).rejects.toThrow(PermissionError)
  })

  it('should pass update patch through to auth evaluator', async () => {
    const { adapter, did, privateKey } = createTestStore()
    const evaluator = createAuthEvaluator(() => true)
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: privateKey,
      authEvaluator: evaluator
    })
    await store.initialize()

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Original', status: 'todo' }
    })

    await store.update(node.id, { properties: { status: 'done' } })

    const canSpy = evaluator.can as ReturnType<typeof vi.fn>
    const updateCall = canSpy.mock.calls.find(
      (args) =>
        (args[0] as AuthCheckInput).nodeId === node.id &&
        (args[0] as AuthCheckInput).patch?.status === 'done'
    )
    expect(updateCall).toBeDefined()
    expect((updateCall?.[0] as AuthCheckInput).patch).toEqual({ status: 'done' })
  })

  it('routes local system schema mutations through store.auth.can', async () => {
    const { adapter, did, privateKey } = createTestStore()
    const evaluator = createAuthEvaluator(() => true)
    const auth = createMockStoreAuth(did, false)
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: privateKey,
      authEvaluator: evaluator,
      auth
    })
    await store.initialize()

    const nodeId = `xnet://${did}/sys/schema/blocked-schema`
    const properties = {
      schemaIri: `xnet://${did}/Blocked@1.0.0`,
      version: '1.0.0'
    }

    await expect(
      store.create({
        id: nodeId,
        schemaId: SchemaDefinitionSchema.schema['@id'],
        properties
      })
    ).rejects.toThrow(PermissionError)

    expect(auth.can).toHaveBeenCalledWith({
      action: 'create',
      nodeId,
      patch: properties
    })
    expect(evaluator.can).not.toHaveBeenCalled()
  })

  it('should silently reject unauthorized remote changes', async () => {
    const local = createTestStore()
    const remote = createTestStore()

    await local.store.initialize()
    await remote.store.initialize()

    const callback = vi.fn()
    const evaluator = createAuthEvaluator((input) => input.subject === local.did)
    const store = new NodeStore({
      storage: local.adapter,
      authorDID: local.did,
      signingKey: local.privateKey,
      authEvaluator: evaluator,
      onUnauthorizedRemoteChange: callback
    })
    await store.initialize()

    const node = await remote.store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Remote node' }
    })
    const [change] = await remote.store.getChanges(node.id)

    await store.applyRemoteChange(change)

    const fetched = await store.get(node.id)
    expect(fetched).toBeNull()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('rejects the same unauthorized remote change deterministically', async () => {
    const local = createTestStore()
    const remote = createTestStore()

    await local.store.initialize()
    await remote.store.initialize()

    const callback = vi.fn()
    const evaluator = createAuthEvaluator((input) => input.subject === local.did)
    const store = new NodeStore({
      storage: local.adapter,
      authorDID: local.did,
      signingKey: local.privateKey,
      authEvaluator: evaluator,
      onUnauthorizedRemoteChange: callback
    })
    await store.initialize()

    const node = await remote.store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Unauthorized remote node' }
    })
    const [change] = await remote.store.getChanges(node.id)

    await store.applyRemoteChange(change)
    await store.applyRemoteChange(change)

    expect(await store.get(node.id)).toBeNull()
    expect(await store.list({ includeDeleted: true })).toHaveLength(0)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('checks remote creates as the create action against a draft node (0304)', async () => {
    const local = createTestStore()
    const remote = createTestStore()

    await local.store.initialize()
    await remote.store.initialize()

    const evaluator = createAuthEvaluator(() => true)
    const store = new NodeStore({
      storage: local.adapter,
      authorDID: local.did,
      signingKey: local.privateKey,
      authEvaluator: evaluator
    })
    await store.initialize()

    const node = await remote.store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Collaborator create' }
    })
    const [createChange] = await remote.store.getChanges(node.id)

    await store.applyRemoteChange(createChange)

    // The create was evaluated as 'create' with the payload-built draft — the
    // node did not exist locally, so nothing else could carry its schema.
    expect(evaluator.can).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: remote.did,
        action: 'create',
        nodeId: node.id,
        node: expect.objectContaining({
          schemaId: TEST_SCHEMA,
          createdBy: remote.did
        })
      })
    )
    expect(await store.get(node.id)).not.toBeNull()

    // A follow-up mutation of the now-existing node checks as 'update'.
    await remote.store.update(node.id, { properties: { title: 'Edited' } })
    const updateChange = (await remote.store.getChanges(node.id)).at(-1)!
    await store.applyRemoteChange(updateChange)

    expect(evaluator.can).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'update',
        nodeId: node.id,
        node: undefined
      })
    )
    expect((await store.get(node.id))?.properties.title).toBe('Edited')
  })

  it('shrinks the candidate set via storage for auth reads without exposing hidden counts', async () => {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new QueryCapableMemoryNodeStorageAdapter()
    const visibleId = 'visible-task'
    const hiddenId = 'hidden-task'
    const evaluator = createAuthEvaluator(
      (input) => input.action !== 'read' || input.nodeId === visibleId
    )
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      authEvaluator: evaluator
    })
    await store.initialize()

    await store.create({
      id: visibleId,
      schemaId: TEST_SCHEMA,
      properties: { title: 'Visible', status: 'open' }
    })
    await store.create({
      id: hiddenId,
      schemaId: TEST_SCHEMA,
      properties: { title: 'Hidden', status: 'open' }
    })

    await expect(store.get(hiddenId)).resolves.toBeNull()
    await expect(store.list({ schemaId: TEST_SCHEMA })).resolves.toMatchObject([{ id: visibleId }])

    adapter.queryNodes.mockClear()
    const result = await store.query({
      schemaId: TEST_SCHEMA,
      includeDeleted: false,
      where: { status: 'open' },
      limit: 1,
      offset: 0
    })

    // The predicate is now pushed to storage (candidate reduction), but
    // WITHOUT pagination — rows the viewer cannot read must be removed before
    // the window is applied.
    expect(adapter.queryNodes).toHaveBeenCalledTimes(1)
    const pushed = adapter.queryNodes.mock.calls[0]![0]
    expect(pushed.where).toEqual({ status: 'open' })
    expect(pushed.limit).toBeUndefined()
    expect(pushed.offset).toBeUndefined()

    // Authorization still removes the hidden node; only the visible row is returned.
    expect(result.nodes.map((node) => node.id)).toEqual([visibleId])
    expect(result.totalCount).toBe(1)

    // The surfaced plan must not reveal that a hidden candidate existed, nor
    // expose any compiled SQL.
    expect(result.plan).toMatchObject({
      strategy: 'auth-pushdown-candidates',
      candidateNodeCount: 1,
      hydratedNodeCount: 1,
      returnedNodeCount: 1
    })
    expect(result.plan.sql).toBeUndefined()
    expect(result.plan.params).toBeUndefined()
  })

  it('pushes unfiltered paginated system-order queries through fallback storage', async () => {
    const { adapter, did, store } = createTestStore()
    await store.initialize()

    for (let index = 1; index <= 5; index++) {
      await adapter.setNode({
        id: `task-${index}`,
        schemaId: TEST_SCHEMA,
        properties: { title: `Task ${index}` },
        timestamps: {},
        deleted: false,
        createdAt: 1_000 + index,
        createdBy: did,
        updatedAt: 2_000 + index,
        updatedBy: did
      })
    }

    const listNodes = vi.spyOn(adapter, 'listNodes')
    const countNodes = vi.spyOn(adapter, 'countNodes')

    const result = await store.query({
      schemaId: TEST_SCHEMA,
      includeDeleted: false,
      orderBy: { updatedAt: 'desc' },
      limit: 2,
      offset: 1,
      // Opt in to the exact total — by default the COUNT(*) is skipped (0184).
      count: 'exact'
    })

    expect(listNodes).toHaveBeenCalledWith({
      schemaId: TEST_SCHEMA,
      includeDeleted: false,
      orderBy: { updatedAt: 'desc' },
      limit: 2,
      offset: 1
    })
    expect(countNodes).toHaveBeenCalledWith({
      schemaId: TEST_SCHEMA,
      includeDeleted: false
    })
    expect(result.nodes.map((node) => node.id)).toEqual(['task-4', 'task-3'])
    expect(result.totalCount).toBe(5)
    expect(result.plan).toMatchObject({
      strategy: 'list-fallback',
      candidateNodeCount: 2,
      hydratedNodeCount: 2,
      returnedNodeCount: 2
    })
  })

  it('skips the COUNT(*) for paginated reads that do not request an exact total', async () => {
    const { adapter, did, store } = createTestStore()
    await store.initialize()

    for (let index = 1; index <= 5; index++) {
      await adapter.setNode({
        id: `task-${index}`,
        schemaId: TEST_SCHEMA,
        properties: { title: `Task ${index}` },
        timestamps: {},
        deleted: false,
        createdAt: 1_000 + index,
        createdBy: did,
        updatedAt: 2_000 + index,
        updatedBy: did
      })
    }

    const countNodes = vi.spyOn(adapter, 'countNodes')

    const result = await store.query({
      schemaId: TEST_SCHEMA,
      includeDeleted: false,
      orderBy: { updatedAt: 'desc' },
      limit: 2,
      offset: 1
    })

    // No `count` requested → the index-wide COUNT(*) is never run (0184).
    expect(countNodes).not.toHaveBeenCalled()
    expect(result.totalCount).toBeUndefined()
    expect(result.nodes.map((node) => node.id)).toEqual(['task-4', 'task-3'])
  })

  it('should deny entire transaction when one operation is unauthorized', async () => {
    const { adapter, did, privateKey } = createTestStore()
    const evaluator = createAuthEvaluator((input) => input.action !== 'delete')
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: privateKey,
      authEvaluator: evaluator
    })
    await store.initialize()

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Keep me' }
    })

    await expect(
      store.transaction([
        { type: 'update', nodeId: node.id, options: { properties: { title: 'Updated' } } },
        { type: 'delete', nodeId: node.id }
      ])
    ).rejects.toThrow(PermissionError)

    const fetched = await store.get(node.id)
    expect(fetched?.properties.title).toBe('Keep me')
  })

  it('should trigger recipient recompute callback only for auth-relevant properties', async () => {
    const { adapter, did, privateKey } = createTestStore()
    const evaluator = createAuthEvaluator(() => true)
    const recompute = vi.fn()

    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: privateKey,
      authEvaluator: evaluator,
      authRelevantPropertyLookup: () => new Set(['assignee']),
      onRecipientsMayNeedRecompute: recompute
    })
    await store.initialize()

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Task', assignee: did }
    })

    await store.update(node.id, { properties: { title: 'Renamed' } })
    expect(recompute).toHaveBeenCalledTimes(0)

    await store.update(node.id, { properties: { assignee: did } })
    expect(recompute).toHaveBeenCalledTimes(1)
  })

  it('should invalidate auth cache after successful local mutations', async () => {
    const { adapter, did, privateKey } = createTestStore()
    const evaluator = createAuthEvaluator(() => true)
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: privateKey,
      authEvaluator: evaluator
    })
    await store.initialize()

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Invalidate me' }
    })

    await store.update(node.id, { properties: { title: 'Updated' } })
    await store.delete(node.id)

    const invalidateSpy = evaluator.invalidate as ReturnType<typeof vi.fn>
    expect(invalidateSpy).toHaveBeenCalledWith(node.id)
    expect(invalidateSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})

describe('transparent encryption', () => {
  it('encrypts node snapshots on write path', async () => {
    const { adapter, did, privateKey } = createTestStore()
    const { cipher, encrypt } = createMockNodeContentCipher()
    const cache = createInMemoryContentKeyCache()

    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: privateKey,
      nodeContentCipher: cipher,
      contentKeyCache: cache
    })
    await store.initialize()

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Encrypted node', status: 'todo' }
    })

    await store.update(node.id, {
      properties: { status: 'done' }
    })

    expect(encrypt).toHaveBeenCalledTimes(2)

    const encryptedSnapshot = await adapter.getDocumentContent(node.id)
    expect(encryptedSnapshot).not.toBeNull()
  })

  it('decrypts node snapshots on read path and reuses cached content key', async () => {
    const { adapter, did, privateKey } = createTestStore()
    const { cipher, decrypt } = createMockNodeContentCipher()
    const cache = createInMemoryContentKeyCache()

    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: privateKey,
      nodeContentCipher: cipher,
      contentKeyCache: cache
    })
    await store.initialize()

    const created = await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Decrypt me', status: 'todo' }
    })

    const firstRead = await store.get(created.id)
    expect(firstRead?.properties.title).toBe('Decrypt me')

    const secondRead = await store.get(created.id)
    expect(secondRead?.properties.status).toBe('todo')

    expect(decrypt).toHaveBeenCalledTimes(2)
    const secondDecryptInput = decrypt.mock.calls[1]?.[0]
    expect(secondDecryptInput?.cachedContentKey).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('bypasses materialized storage queries for encrypted node content', async () => {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new QueryCapableMemoryNodeStorageAdapter()
    const { cipher } = createMockNodeContentCipher()
    const cache = createInMemoryContentKeyCache()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      nodeContentCipher: cipher,
      contentKeyCache: cache
    })
    await store.initialize()

    await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Encrypted task', status: 'open' }
    })

    const result = await store.query({
      schemaId: TEST_SCHEMA,
      includeDeleted: false,
      where: { status: 'open' },
      materializedView: { viewId: 'encrypted-task-view' }
    })

    expect(adapter.queryNodes).not.toHaveBeenCalled()
    expect(result.nodes.map((node) => node.properties.title)).toEqual(['Encrypted task'])
    expect(result.plan).toMatchObject({
      strategy: 'list-fallback',
      returnedNodeCount: 1,
      postFilterReason: 'encrypted-node-content'
    })
    expect(result.plan.sql).toBeUndefined()
    expect(result.plan.params).toBeUndefined()
  })
})

describe('MemoryNodeStorageAdapter', () => {
  it('should persist and retrieve changes', async () => {
    new MemoryNodeStorageAdapter()
    const { store } = createTestStore()

    // Use the adapter directly
    await store.create({
      schemaId: TEST_SCHEMA,
      properties: { title: 'Test' }
    })

    // Adapter should have the change
    expect(store['storage']).toBeDefined()
  })

  it('should clear all data', () => {
    const adapter = new MemoryNodeStorageAdapter()

    // Add some data
    adapter.setNode({
      id: 'test',
      schemaId: TEST_SCHEMA,
      properties: {},
      timestamps: {},
      deleted: false,
      createdAt: Date.now(),
      createdBy: 'did:key:test' as DID,
      updatedAt: Date.now(),
      updatedBy: 'did:key:test' as DID
    })

    expect(adapter.getNodeCount()).toBe(1)

    adapter.clear()

    expect(adapter.getNodeCount()).toBe(0)
    expect(adapter.getChangeCount()).toBe(0)
  })
})

describe('Unknown Property Handling (Version Compatibility)', () => {
  it('should preserve unknown properties in _unknown field when propertyLookup is provided', async () => {
    const keyPair = generateSigningKeyPair()
    const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
    const adapter = new MemoryNodeStorageAdapter()

    // Create a propertyLookup that only knows about 'title'
    const knownProps = new Set(['title'])
    const propertyLookup = () => knownProps

    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      propertyLookup
    })
    await store.initialize()

    // Create a node with both known and unknown properties
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: {
        title: 'Known Property',
        futureField: 'This is from a future version',
        anotherFuture: 123
      }
    })

    // Known property should be in properties
    expect(node.properties.title).toBe('Known Property')

    // Unknown properties should be in _unknown
    expect(node._unknown).toBeDefined()
    expect(node._unknown?.futureField).toBe('This is from a future version')
    expect(node._unknown?.anotherFuture).toBe(123)

    // Unknown properties should NOT be in properties
    expect(node.properties.futureField).toBeUndefined()
    expect(node.properties.anotherFuture).toBeUndefined()
  })

  it('should treat all properties as known when propertyLookup is not provided', async () => {
    const { store } = createTestStore()
    await store.initialize()

    // Create a node with various properties
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: {
        title: 'Test',
        extraField: 'Should be in properties'
      }
    })

    // All properties should be in properties (no _unknown)
    expect(node.properties.title).toBe('Test')
    expect(node.properties.extraField).toBe('Should be in properties')
    expect(node._unknown).toBeUndefined()
  })

  it('should treat all properties as known when propertyLookup returns undefined', async () => {
    const keyPair = generateSigningKeyPair()
    const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
    const adapter = new MemoryNodeStorageAdapter()

    // PropertyLookup that returns undefined (schema not found)
    const propertyLookup = () => undefined

    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      propertyLookup
    })
    await store.initialize()

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: {
        title: 'Test',
        anyField: 'Should work'
      }
    })

    // All properties should be in properties since schema isn't known
    expect(node.properties.title).toBe('Test')
    expect(node.properties.anyField).toBe('Should work')
    expect(node._unknown).toBeUndefined()
  })

  it('should preserve unknown properties through updates', async () => {
    const keyPair = generateSigningKeyPair()
    const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
    const adapter = new MemoryNodeStorageAdapter()

    const knownProps = new Set(['title', 'status'])
    const propertyLookup = () => knownProps

    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      propertyLookup
    })
    await store.initialize()

    // Create with unknown property
    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: {
        title: 'Original',
        futureField: 'preserved'
      }
    })

    // Update a known property
    const updated = await store.update(node.id, {
      properties: { status: 'done' }
    })

    // Original unknown property should still be there
    expect(updated._unknown?.futureField).toBe('preserved')
    expect(updated.properties.status).toBe('done')
    expect(updated.properties.title).toBe('Original')
  })

  it('should allow updating unknown properties', async () => {
    const keyPair = generateSigningKeyPair()
    const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
    const adapter = new MemoryNodeStorageAdapter()

    const knownProps = new Set(['title'])
    const propertyLookup = () => knownProps

    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      propertyLookup
    })
    await store.initialize()

    const node = await store.create({
      schemaId: TEST_SCHEMA,
      properties: {
        title: 'Test',
        futureField: 'original'
      }
    })

    // Update the unknown property
    const updated = await store.update(node.id, {
      properties: { futureField: 'updated value' }
    })

    expect(updated._unknown?.futureField).toBe('updated value')
  })
})

describe('getWithMigration (Schema Migration Support)', () => {
  // Create a lens registry for testing
  function createMigrationTestStore() {
    const registry = new LensRegistry()

    // Register Task v1 -> v2 migration
    const TASK_V1 = 'xnet://xnet.fyi/Task@1.0.0' as SchemaIRI
    const TASK_V2 = 'xnet://xnet.fyi/Task@2.0.0' as SchemaIRI
    const TASK_V3 = 'xnet://xnet.fyi/Task@3.0.0' as SchemaIRI

    // v1 -> v2: rename 'complete' to 'status', convert boolean to string
    registry.register(
      composeLens(
        TASK_V1,
        TASK_V2,
        rename('complete', 'status'),
        convert('status', { true: 'done', false: 'todo' }, { done: true, todo: false })
      )
    )

    // v2 -> v3: add priority field
    registry.register(composeLens(TASK_V2, TASK_V3, addDefault('priority', 'medium')))

    const keyPair = generateSigningKeyPair()
    const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
    const adapter = new MemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      lensRegistry: registry
    })

    return { store, adapter, did, registry, TASK_V1, TASK_V2, TASK_V3 }
  }

  it('should return node without migration when schema matches', async () => {
    const { store, TASK_V1 } = createMigrationTestStore()
    await store.initialize()

    const node = await store.create({
      schemaId: TASK_V1,
      properties: { title: 'Test Task', complete: true }
    })

    // Set the _schemaVersion to match the stored version
    await store['storage'].setNode({
      ...(await store.get(node.id))!,
      _schemaVersion: '1.0.0'
    })

    const fetched = await store.getWithMigration(node.id, {
      targetSchemaId: TASK_V1
    })

    expect(fetched).not.toBeNull()
    expect(fetched!._migrationInfo).toBeUndefined()
    expect(fetched!.properties.complete).toBe(true)
  })

  it('should migrate node from v1 to v2', async () => {
    const { store, TASK_V1, TASK_V2 } = createMigrationTestStore()
    await store.initialize()

    // Create a v1 node
    const node = await store.create({
      schemaId: TASK_V1,
      properties: { title: 'Test Task', complete: true }
    })

    // Set the _schemaVersion to v1
    await store['storage'].setNode({
      ...(await store.get(node.id))!,
      _schemaVersion: '1.0.0'
    })

    // Fetch with migration to v2
    const migrated = await store.getWithMigration(node.id, {
      targetSchemaId: TASK_V2
    })

    expect(migrated).not.toBeNull()
    expect(migrated!._migrationInfo).toBeDefined()
    expect(migrated!._migrationInfo!.from).toBe(TASK_V1)
    expect(migrated!._migrationInfo!.to).toBe(TASK_V2)
    expect(migrated!._migrationInfo!.lossless).toBe(true) // rename + convert are lossless

    // Check properties were migrated
    expect(migrated!.properties.status).toBe('done') // complete: true -> status: 'done'
    expect(migrated!.properties.complete).toBeUndefined() // old property removed
    expect(migrated!.properties.title).toBe('Test Task') // unchanged
  })

  it('should migrate node from v1 to v3 (multi-step)', async () => {
    const { store, TASK_V1, TASK_V3 } = createMigrationTestStore()
    await store.initialize()

    // Create a v1 node
    const node = await store.create({
      schemaId: TASK_V1,
      properties: { title: 'Test Task', complete: false }
    })

    // Set the _schemaVersion to v1
    await store['storage'].setNode({
      ...(await store.get(node.id))!,
      _schemaVersion: '1.0.0'
    })

    // Fetch with migration to v3 (v1 -> v2 -> v3)
    const migrated = await store.getWithMigration(node.id, {
      targetSchemaId: TASK_V3
    })

    expect(migrated).not.toBeNull()
    expect(migrated!._migrationInfo).toBeDefined()
    expect(migrated!._migrationInfo!.from).toBe(TASK_V1)
    expect(migrated!._migrationInfo!.to).toBe(TASK_V3)
    expect(migrated!._migrationInfo!.lossless).toBe(false) // addDefault is lossy

    // Check properties were migrated through both steps
    expect(migrated!.properties.status).toBe('todo') // complete: false -> status: 'todo'
    expect(migrated!.properties.priority).toBe('medium') // added default
    expect(migrated!.properties.complete).toBeUndefined() // old property removed
    expect(migrated!.properties.title).toBe('Test Task') // unchanged
  })

  it('should report lossy migration warnings', async () => {
    const { store, TASK_V1, TASK_V3 } = createMigrationTestStore()
    await store.initialize()

    const node = await store.create({
      schemaId: TASK_V1,
      properties: { title: 'Test', complete: true }
    })

    await store['storage'].setNode({
      ...(await store.get(node.id))!,
      _schemaVersion: '1.0.0'
    })

    const migrated = await store.getWithMigration(node.id, {
      targetSchemaId: TASK_V3
    })

    expect(migrated!._migrationInfo!.warnings).toHaveLength(1)
    expect(migrated!._migrationInfo!.warnings[0]).toContain('Lossy')
  })

  it('should return node as-is when no migration path exists', async () => {
    const { store, TASK_V1 } = createMigrationTestStore()
    await store.initialize()

    const UNKNOWN_SCHEMA = 'xnet://xnet.fyi/Unknown@1.0.0' as SchemaIRI

    const node = await store.create({
      schemaId: TASK_V1,
      properties: { title: 'Test', complete: true }
    })

    await store['storage'].setNode({
      ...(await store.get(node.id))!,
      _schemaVersion: '1.0.0'
    })

    // Try to migrate to a schema with no path
    const result = await store.getWithMigration(node.id, {
      targetSchemaId: UNKNOWN_SCHEMA
    })

    // Should return node as-is without migration info
    expect(result).not.toBeNull()
    expect(result!._migrationInfo).toBeUndefined()
    expect(result!.properties.complete).toBe(true) // original property
  })

  it('should return null for non-existent node', async () => {
    const { store, TASK_V2 } = createMigrationTestStore()
    await store.initialize()

    const result = await store.getWithMigration('non-existent-id', {
      targetSchemaId: TASK_V2
    })

    expect(result).toBeNull()
  })

  it('should work without lens registry (no migrations)', async () => {
    // Store without lens registry
    const { store } = createTestStore()
    await store.initialize()

    const node = await store.create({
      schemaId: 'xnet://xnet.fyi/Task@1.0.0' as SchemaIRI,
      properties: { title: 'Test', complete: true }
    })

    const result = await store.getWithMigration(node.id, {
      targetSchemaId: 'xnet://xnet.fyi/Task@2.0.0' as SchemaIRI
    })

    // Should return node as-is since no lens registry
    expect(result).not.toBeNull()
    expect(result!._migrationInfo).toBeUndefined()
    expect(result!.properties.complete).toBe(true)
  })
})

describe('NodeStore — authorized materialized views (0226)', () => {
  function taskNode(id: string, status: string, updatedAt: number, did: DID): NodeState {
    return {
      id,
      schemaId: TEST_SCHEMA,
      properties: { title: id, status },
      timestamps: {
        title: { lamport: 1, author: did, wallTime: updatedAt },
        status: { lamport: 2, author: did, wallTime: updatedAt }
      },
      deleted: false,
      createdAt: updatedAt,
      createdBy: did,
      updatedAt,
      updatedBy: did
    }
  }

  async function createSQLiteAuthStore(canRead: (input: AuthCheckInput) => boolean) {
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const db = await createMemorySQLiteAdapter()
    const adapter = new SQLiteNodeStorageAdapter(db)
    const evaluator = createAuthEvaluator(canRead)
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      authEvaluator: evaluator
    })
    await store.initialize()
    return { store, adapter, db, did }
  }

  it('persists a materialized view under authz and re-materializes when a grant is revoked', async () => {
    let readableLow = true
    const { store, adapter, db, did } = await createSQLiteAuthStore((input) => {
      if (input.action !== 'read') return true
      if (input.nodeId === 'task-low') return readableLow
      return true
    })

    // Seed directly to bypass write-authz; the read path is what we exercise.
    await adapter.importNodes([
      taskNode('task-high', 'open', 2000, did),
      taskNode('task-low', 'open', 1000, did)
    ])

    const descriptor: NodeQueryDescriptor = {
      schemaId: TEST_SCHEMA,
      includeDeleted: false,
      where: { status: 'open' },
      orderBy: { updatedAt: 'desc' },
      materializedView: { viewId: 'db:tasks:view:open' }
    }

    // First read materializes the authorized id list (both rows readable).
    const first = await store.query(descriptor)
    expect(first.nodes.map((node) => node.id)).toEqual(['task-high', 'task-low'])
    expect(first.plan.materializedViewId).toBe('db:tasks:view:open')
    expect(first.plan.materializedCacheHit).toBe(false)

    // Second read with no change → cache hit (the reload-reuse win).
    const second = await store.query(descriptor)
    expect(second.plan.materializedCacheHit).toBe(true)
    expect(second.nodes.map((node) => node.id)).toEqual(['task-high', 'task-low'])

    // Revoke read on task-low AND record a grant change so the fingerprint moves.
    readableLow = false
    await adapter.importNodes([
      {
        ...taskNode('grant-1', 'active', 3000, did),
        schemaId: SYSTEM_SCHEMA_BASE_IRIS.Grant as SchemaIRI
      }
    ])

    // The critical assertion: the cached view must NOT serve the now-unreadable row.
    const third = await store.query(descriptor)
    expect(third.plan.materializedCacheHit).toBe(false)
    expect(third.plan.materializedRefreshReason).toBe('authz-changed')
    expect(third.nodes.map((node) => node.id)).toEqual(['task-high'])

    await db.close()
  })

  it('falls back to authorize-then-paginate when storage cannot fingerprint authz', async () => {
    // MemoryNodeStorageAdapter implements neither seam, so a materialized view
    // request under authz must NOT cache — it degrades to the safe path.
    const keyPair = generateSigningKeyPair()
    const did = createDID(keyPair.publicKey) as DID
    const adapter = new MemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey,
      authEvaluator: createAuthEvaluator((input) =>
        input.action !== 'read' ? true : input.nodeId !== 'hidden'
      )
    })
    await store.initialize()
    await store.create({ id: 'visible', schemaId: TEST_SCHEMA, properties: { status: 'open' } })

    const result = await store.query({
      schemaId: TEST_SCHEMA,
      includeDeleted: false,
      where: { status: 'open' },
      materializedView: { viewId: 'db:tasks:view:open' }
    })

    expect(result.nodes.map((node) => node.id)).toEqual(['visible'])
    expect(result.plan.materializedViewId).toBeUndefined()
  })
})
