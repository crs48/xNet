/**
 * Tests for NodeStore
 */

import type { ContentKeyCache, NodeContentCipher } from './types'
import type { SchemaIRI } from '../schema/node'
import type { AuthCheckInput, AuthDecision, DID, PolicyEvaluator } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, vi } from 'vitest'
import { LensRegistry, composeLens, rename, addDefault, convert } from '../schema'
import { MemoryNodeStorageAdapter } from './memory-adapter'
import { PermissionError } from './permission-error'
import { NodeStore } from './store'

// Test fixtures
const TEST_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task'
const TEST_SCHEMA_2: SchemaIRI = 'xnet://xnet.fyi/Page'

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
      expect(fetched!.timestamps.title.lamport.time).toBeGreaterThan(
        fetched!.timestamps.count.lamport.time
      )
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

  it('should use the same Lamport timestamp for all operations in a batch', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const result = await store.transaction([
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 1' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 2' } } },
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Task 3' } } }
    ])

    // All changes should have the same Lamport time
    const lamportTime = result.changes[0].lamport.time
    for (const change of result.changes) {
      expect(change.lamport.time).toBe(lamportTime)
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
      (args) => (args[0] as AuthCheckInput).nodeId === node.id && args[0].patch
    )
    expect(updateCall).toBeDefined()
    expect((updateCall?.[0] as AuthCheckInput).patch).toEqual({ status: 'done' })
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
