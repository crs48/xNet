/**
 * Tests for temp ID resolution in transactions.
 */

import { describe, it, expect } from 'vitest'
import { generateSigningKeyPair } from '@xnet/crypto'
import { NodeStore } from './store'
import { MemoryNodeStorageAdapter } from './memory-adapter'
import {
  isTempId,
  TEMP_ID_PREFIX,
  resolveTempIds,
  createSchemaLookup,
  type SchemaLookup
} from './tempids'
import type { TransactionOperation } from './types'
import type { DID } from '@xnet/core'
import type { SchemaIRI } from '../schema/node'
import { defineSchema } from '../schema/define'
import { text, relation } from '../schema/properties'

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const TEST_SCHEMA: SchemaIRI = 'xnet://test/Task'
const COMMENT_SCHEMA: SchemaIRI = 'xnet://test/Comment'

const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://test/',
  properties: {
    title: text({ required: true }),
    parent: relation({ target: 'xnet://test/Task' as const })
  }
})

const CommentSchema = defineSchema({
  name: 'Comment',
  namespace: 'xnet://test/',
  properties: {
    target: relation({ required: true }),
    content: text({ required: true }),
    inReplyTo: relation({})
  }
})

function createLookup(): SchemaLookup {
  return createSchemaLookup((iri) => {
    if (iri === TEST_SCHEMA) return TaskSchema as any
    if (iri === COMMENT_SCHEMA) return CommentSchema as any
    return undefined
  })
}

function createTestStore(schemaLookup?: SchemaLookup): {
  store: NodeStore
  did: DID
} {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey,
    schemaLookup
  })
  return { store, did }
}

// ─── Unit Tests: isTempId ────────────────────────────────────────────────────

describe('isTempId', () => {
  it('returns true for ~prefixed strings', () => {
    expect(isTempId('~parent')).toBe(true)
    expect(isTempId('~child')).toBe(true)
    expect(isTempId('~a')).toBe(true)
    expect(isTempId('~')).toBe(true)
  })

  it('returns false for regular strings', () => {
    expect(isTempId('abc123')).toBe(false)
    expect(isTempId('')).toBe(false)
    expect(isTempId('parent')).toBe(false)
  })

  it('returns false for non-strings', () => {
    expect(isTempId(null)).toBe(false)
    expect(isTempId(undefined)).toBe(false)
    expect(isTempId(123)).toBe(false)
    expect(isTempId({})).toBe(false)
  })

  it('prefix constant is ~', () => {
    expect(TEMP_ID_PREFIX).toBe('~')
  })
})

// ─── Unit Tests: resolveTempIds (pure function) ──────────────────────────────

describe('resolveTempIds', () => {
  describe('without schema lookup', () => {
    it('resolves temp IDs in create operation ids', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~parent', schemaId: TEST_SCHEMA, properties: { title: 'P' } }
        },
        {
          type: 'create',
          options: { id: '~child', schemaId: TEST_SCHEMA, properties: { title: 'C' } }
        }
      ]

      const { operations, tempIds } = resolveTempIds(ops)

      expect(Object.keys(tempIds)).toHaveLength(2)
      expect(tempIds['~parent']).toBeDefined()
      expect(tempIds['~child']).toBeDefined()
      expect(tempIds['~parent']).not.toBe('~parent')
      expect(tempIds['~child']).not.toBe('~child')

      // IDs should be nanoids (21 chars, URL-safe)
      expect(tempIds['~parent']).toMatch(/^[A-Za-z0-9_-]{21}$/)
      expect(tempIds['~child']).toMatch(/^[A-Za-z0-9_-]{21}$/)

      // Operations should have real IDs
      const createOp0 = operations[0] as { type: 'create'; options: { id: string } }
      const createOp1 = operations[1] as { type: 'create'; options: { id: string } }
      expect(createOp0.options.id).toBe(tempIds['~parent'])
      expect(createOp1.options.id).toBe(tempIds['~child'])
    })

    it('resolves the same temp ID to the same real ID', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~node', schemaId: TEST_SCHEMA, properties: { title: 'N' } }
        },
        {
          type: 'create',
          options: { schemaId: COMMENT_SCHEMA, properties: { target: '~node', content: 'Hi' } }
        }
      ]

      const { tempIds } = resolveTempIds(ops)
      expect(Object.keys(tempIds)).toHaveLength(1)
      expect(tempIds['~node']).toBeDefined()
    })

    it('resolves temp IDs in property values without schema lookup', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~parent', schemaId: TEST_SCHEMA, properties: { title: 'P' } }
        },
        {
          type: 'create',
          options: { schemaId: TEST_SCHEMA, properties: { title: 'C', parent: '~parent' } }
        }
      ]

      const { operations, tempIds } = resolveTempIds(ops)

      // Without schema lookup, it still resolves temp IDs in all string properties
      const childOp = operations[1] as {
        type: 'create'
        options: { properties: Record<string, unknown> }
      }
      expect(childOp.options.properties.parent).toBe(tempIds['~parent'])
    })

    it('resolves temp IDs in update nodeId', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~node', schemaId: TEST_SCHEMA, properties: { title: 'N' } }
        },
        { type: 'update', nodeId: '~node', options: { properties: { title: 'Updated' } } }
      ]

      const { operations, tempIds } = resolveTempIds(ops)

      const updateOp = operations[1] as { type: 'update'; nodeId: string }
      expect(updateOp.nodeId).toBe(tempIds['~node'])
    })

    it('resolves temp IDs in delete nodeId', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~node', schemaId: TEST_SCHEMA, properties: { title: 'N' } }
        },
        { type: 'delete', nodeId: '~node' }
      ]

      const { operations, tempIds } = resolveTempIds(ops)

      const deleteOp = operations[1] as { type: 'delete'; nodeId: string }
      expect(deleteOp.nodeId).toBe(tempIds['~node'])
    })

    it('resolves temp IDs in restore nodeId', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~node', schemaId: TEST_SCHEMA, properties: { title: 'N' } }
        },
        { type: 'restore', nodeId: '~node' }
      ]

      const { operations, tempIds } = resolveTempIds(ops)

      const restoreOp = operations[1] as { type: 'restore'; nodeId: string }
      expect(restoreOp.nodeId).toBe(tempIds['~node'])
    })

    it('does not modify operations without temp IDs', () => {
      const ops: TransactionOperation[] = [
        { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Normal' } } }
      ]

      const { operations, tempIds } = resolveTempIds(ops)

      expect(Object.keys(tempIds)).toHaveLength(0)
      // Should return the same reference (no copy needed)
      expect(operations).toBe(ops)
    })

    it('does not resolve non-temp string values', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { schemaId: TEST_SCHEMA, properties: { title: 'Hello ~world' } }
        }
      ]

      const { operations, tempIds } = resolveTempIds(ops)
      expect(Object.keys(tempIds)).toHaveLength(0)
      expect(operations).toBe(ops)
    })

    it('resolves temp IDs in array property values', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~a', schemaId: TEST_SCHEMA, properties: { title: 'A' } }
        },
        {
          type: 'create',
          options: { id: '~b', schemaId: TEST_SCHEMA, properties: { title: 'B' } }
        },
        {
          type: 'create',
          options: { schemaId: TEST_SCHEMA, properties: { title: 'C', related: ['~a', '~b'] } }
        }
      ]

      const { operations, tempIds } = resolveTempIds(ops)

      const createOp2 = operations[2] as {
        type: 'create'
        options: { properties: Record<string, unknown> }
      }
      expect(createOp2.options.properties.related).toEqual([tempIds['~a'], tempIds['~b']])
    })
  })

  describe('with schema lookup', () => {
    const lookup = createLookup()

    it('only resolves temp IDs in relation-typed properties', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~target', schemaId: TEST_SCHEMA, properties: { title: 'T' } }
        },
        {
          type: 'create',
          options: {
            schemaId: COMMENT_SCHEMA,
            properties: { target: '~target', content: '~target', inReplyTo: '~target' }
          }
        }
      ]

      const { operations, tempIds } = resolveTempIds(ops, lookup)

      const commentOp = operations[1] as {
        type: 'create'
        options: { properties: Record<string, unknown> }
      }

      // 'target' is a relation → resolved
      expect(commentOp.options.properties.target).toBe(tempIds['~target'])

      // 'content' is text → NOT resolved (even though value starts with ~)
      expect(commentOp.options.properties.content).toBe('~target')

      // 'inReplyTo' is a relation → resolved
      expect(commentOp.options.properties.inReplyTo).toBe(tempIds['~target'])
    })

    it('resolves typed relations with target schema constraint', () => {
      const ops: TransactionOperation[] = [
        {
          type: 'create',
          options: { id: '~parent', schemaId: TEST_SCHEMA, properties: { title: 'Parent' } }
        },
        {
          type: 'create',
          options: { schemaId: TEST_SCHEMA, properties: { title: 'Child', parent: '~parent' } }
        }
      ]

      const { operations, tempIds } = resolveTempIds(ops, lookup)

      const childOp = operations[1] as {
        type: 'create'
        options: { properties: Record<string, unknown> }
      }
      expect(childOp.options.properties.parent).toBe(tempIds['~parent'])
    })
  })
})

// ─── Integration Tests: NodeStore.transaction() with temp IDs ────────────────

describe('NodeStore transaction with temp IDs', () => {
  it('creates related nodes with temp IDs', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const result = await store.transaction([
      {
        type: 'create',
        options: { id: '~parent', schemaId: TEST_SCHEMA, properties: { title: 'Parent' } }
      },
      {
        type: 'create',
        options: {
          id: '~child',
          schemaId: TEST_SCHEMA,
          properties: { title: 'Child', parent: '~parent' }
        }
      }
    ])

    // tempIds map should be populated
    expect(result.tempIds['~parent']).toBeDefined()
    expect(result.tempIds['~child']).toBeDefined()

    // Results should have real IDs
    expect(result.results[0]!.id).toBe(result.tempIds['~parent'])
    expect(result.results[1]!.id).toBe(result.tempIds['~child'])

    // Verify the nodes exist in the store
    const parent = await store.get(result.tempIds['~parent'])
    const child = await store.get(result.tempIds['~child'])
    expect(parent).toBeDefined()
    expect(parent!.properties.title).toBe('Parent')
    expect(child).toBeDefined()
    expect(child!.properties.title).toBe('Child')
  })

  it('resolves temp IDs in relation properties with schema lookup', async () => {
    const lookup = createLookup()
    const { store } = createTestStore(lookup)
    await store.initialize()

    const result = await store.transaction([
      {
        type: 'create',
        options: { id: '~page', schemaId: TEST_SCHEMA, properties: { title: 'Page' } }
      },
      {
        type: 'create',
        options: {
          schemaId: COMMENT_SCHEMA,
          properties: { target: '~page', content: 'Great page!', inReplyTo: undefined }
        }
      }
    ])

    // The comment's target should be the real page ID
    const commentState = result.results[1]!
    expect(commentState.properties.target).toBe(result.tempIds['~page'])
    expect(commentState.properties.content).toBe('Great page!')
  })

  it('creates then updates with temp IDs across transactions', async () => {
    const { store } = createTestStore()
    await store.initialize()

    // Create with temp ID
    const createResult = await store.transaction([
      {
        type: 'create',
        options: { id: '~node', schemaId: TEST_SCHEMA, properties: { title: 'Original' } }
      }
    ])

    expect(createResult.tempIds['~node']).toBeDefined()
    const realId = createResult.tempIds['~node']

    // Update using the real ID (temp IDs are scoped to a single transaction)
    await store.update(realId, { properties: { title: 'Updated' } })

    const node = await store.get(realId)
    expect(node!.properties.title).toBe('Updated')
  })

  it('creates and deletes with temp IDs', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const result = await store.transaction([
      {
        type: 'create',
        options: { id: '~node', schemaId: TEST_SCHEMA, properties: { title: 'Temp' } }
      },
      { type: 'delete', nodeId: '~node' }
    ])

    expect(result.tempIds['~node']).toBeDefined()
    const node = await store.get(result.tempIds['~node'])
    expect(node!.deleted).toBe(true)
  })

  it('returns empty tempIds when no temp IDs are used', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const result = await store.transaction([
      { type: 'create', options: { schemaId: TEST_SCHEMA, properties: { title: 'Normal' } } }
    ])

    expect(Object.keys(result.tempIds)).toHaveLength(0)
  })

  it('handles complex multi-node creation with cross-references', async () => {
    const lookup = createLookup()
    const { store } = createTestStore(lookup)
    await store.initialize()

    const result = await store.transaction([
      // Create a task
      {
        type: 'create',
        options: { id: '~task', schemaId: TEST_SCHEMA, properties: { title: 'Task' } }
      },
      // Create a root comment on the task
      {
        type: 'create',
        options: {
          id: '~comment',
          schemaId: COMMENT_SCHEMA,
          properties: { target: '~task', content: 'First comment' }
        }
      },
      // Create a reply to the root comment, also targeting the task
      {
        type: 'create',
        options: {
          schemaId: COMMENT_SCHEMA,
          properties: { target: '~task', content: 'Reply', inReplyTo: '~comment' }
        }
      }
    ])

    expect(Object.keys(result.tempIds)).toHaveLength(2) // ~task, ~comment

    const task = result.results[0]!
    const comment = result.results[1]!
    const reply = result.results[2]!

    expect(task.id).toBe(result.tempIds['~task'])
    expect(comment.id).toBe(result.tempIds['~comment'])
    expect(comment.properties.target).toBe(result.tempIds['~task'])
    expect(reply.properties.target).toBe(result.tempIds['~task'])
    expect(reply.properties.inReplyTo).toBe(result.tempIds['~comment'])
  })

  it('preserves batch metadata with temp IDs', async () => {
    const { store } = createTestStore()
    await store.initialize()

    const result = await store.transaction([
      { type: 'create', options: { id: '~a', schemaId: TEST_SCHEMA, properties: { title: 'A' } } },
      { type: 'create', options: { id: '~b', schemaId: TEST_SCHEMA, properties: { title: 'B' } } }
    ])

    // Batch metadata should still work
    expect(result.batchId).toMatch(/^batch-/)
    expect(result.changes).toHaveLength(2)
    for (const change of result.changes) {
      expect(change.batchId).toBe(result.batchId)
      expect(change.batchSize).toBe(2)
    }
    expect(result.changes[0].batchIndex).toBe(0)
    expect(result.changes[1].batchIndex).toBe(1)

    // All changes share the same Lamport timestamp
    expect(result.changes[0].lamport.time).toBe(result.changes[1].lamport.time)
  })
})
