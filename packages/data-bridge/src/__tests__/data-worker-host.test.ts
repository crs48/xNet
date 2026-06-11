/**
 * Tests for the DataWorker host (worker-resident data layer, 0164).
 *
 * The host is instantiated directly: Comlink's proxy()/transfer() are
 * inert outside a worker scope, so the full subscription/invalidation
 * pipeline can run in-process.
 */

import type { QueryDelta } from '../worker/worker-types'
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { defineSchema, text, number, checkbox } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { serializeQueryDescriptor, createQueryDescriptor } from '../query-descriptor'
import { DataWorker, computeQueryDelta } from '../worker/data-worker-host'

const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://test.local/',
  version: '1.0.0',
  properties: {
    title: text({ required: true }),
    rank: number({}),
    done: checkbox()
  }
})

function makeNode(id: string, title = id): { id: string } & Record<string, unknown> {
  return { id, title }
}

async function createInitializedWorker(): Promise<DataWorker> {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  const worker = new DataWorker()
  await worker.initialize({
    dbName: 'test',
    authorDID: did,
    signingKey: Array.from(keyPair.privateKey)
  })
  return worker
}

function subscriptionId(options: Parameters<typeof createQueryDescriptor>[1] = {}): string {
  return serializeQueryDescriptor(createQueryDescriptor(TaskSchema._schemaId, options))
}

describe('computeQueryDelta', () => {
  const nodeA = { id: 'a' } as never
  const nodeB = { id: 'b' } as never
  const nodeB2 = { id: 'b' } as never
  const nodeC = { id: 'c' } as never

  it('returns null when nothing changed', () => {
    expect(computeQueryDelta([nodeA, nodeB], [nodeA, nodeB])).toBeNull()
  })

  it('detects a single addition with its index', () => {
    expect(computeQueryDelta([nodeA], [nodeA, nodeB])).toEqual({
      type: 'add',
      node: nodeB,
      index: 1
    })
  })

  it('detects a single removal', () => {
    expect(computeQueryDelta([nodeA, nodeB], [nodeA])).toEqual({ type: 'remove', nodeId: 'b' })
  })

  it('detects a single in-place update by reference change', () => {
    expect(computeQueryDelta([nodeA, nodeB], [nodeA, nodeB2])).toEqual({
      type: 'update',
      nodeId: 'b',
      node: nodeB2
    })
  })

  it('falls back to reload for compound transitions', () => {
    const next = [nodeA, nodeC]
    expect(computeQueryDelta([nodeA, nodeB], next)).toEqual({ type: 'reload', data: next })
  })
})

describe('DataWorker host', () => {
  let worker: DataWorker

  beforeEach(async () => {
    worker = await createInitializedWorker()
  })

  it('streams add, update, and remove deltas for a live subscription', async () => {
    const deltas: QueryDelta[] = []
    const queryId = subscriptionId()
    const initial = await worker.subscribe(queryId, TaskSchema._schemaId, {}, (delta) => {
      deltas.push(delta)
    })
    expect(initial).toEqual([])

    const created = await worker.create(TaskSchema._schemaId, makeNode('task-1', 'First'))
    await vi.waitFor(() => expect(deltas.length).toBe(1))
    expect(deltas[0]).toMatchObject({ type: 'add', node: { id: created.id } })

    await worker.update(created.id, { title: 'Renamed' })
    await vi.waitFor(() => expect(deltas.length).toBe(2))
    expect(deltas[1]).toMatchObject({
      type: 'update',
      nodeId: created.id,
      node: { properties: { title: 'Renamed' } }
    })

    await worker.delete(created.id)
    await vi.waitFor(() => expect(deltas.length).toBe(3))
    expect(deltas[2]).toMatchObject({ type: 'remove', nodeId: created.id })
  })

  it('maintains bounded working sets: removals promote buffered rows without re-querying', async () => {
    for (let i = 0; i < 8; i++) {
      await worker.create(TaskSchema._schemaId, { title: `Task ${i}`, rank: i })
    }

    const options = { orderBy: { rank: 'asc' as const }, limit: 5 }
    const queryId = subscriptionId(options)
    const deltas: QueryDelta[] = []
    const initial = await worker.subscribe(queryId, TaskSchema._schemaId, options, (delta) => {
      deltas.push(delta)
    })

    expect(initial).toHaveLength(5)
    expect(initial.map((node) => node.properties.rank)).toEqual([0, 1, 2, 3, 4])

    const querySpy = vi.spyOn(
      (worker as unknown as { store: { query: (...args: unknown[]) => unknown } }).store,
      'query'
    )

    await worker.delete(initial[0].id)
    await vi.waitFor(() => expect(deltas.length).toBe(1))

    // Removal absorbed by the overfetch buffer: rank 5 promoted into view.
    expect(deltas[0].type).toBe('reload')
    const reloaded = (deltas[0] as Extract<QueryDelta, { type: 'reload' }>).data
    expect(reloaded.map((node) => node.properties.rank)).toEqual([1, 2, 3, 4, 5])
    expect(querySpy).not.toHaveBeenCalled()
  })

  it('preserves node identity across reloads for unchanged rows', async () => {
    await worker.create(TaskSchema._schemaId, { title: 'Stable', rank: 1 })
    await worker.create(TaskSchema._schemaId, { title: 'Also stable', rank: 2 })

    const queryId = subscriptionId()
    const initial = await worker.subscribe(queryId, TaskSchema._schemaId, {}, () => {})
    expect(initial).toHaveLength(2)

    const reloaded = await worker.reloadQuery(queryId)
    expect(reloaded).toHaveLength(2)
    for (const node of reloaded) {
      const previous = initial.find((candidate) => candidate.id === node.id)
      expect(node).toBe(previous)
    }
  })

  it('hydrates small batch writes into per-node deltas', async () => {
    const queryId = subscriptionId()
    const deltas: QueryDelta[] = []
    await worker.subscribe(queryId, TaskSchema._schemaId, {}, (delta) => {
      deltas.push(delta)
    })

    await worker.bulkWrite({
      kind: 'deterministic-import',
      drafts: [
        { id: 'bulk-1', schemaId: TaskSchema._schemaId, properties: { title: 'One' } },
        { id: 'bulk-2', schemaId: TaskSchema._schemaId, properties: { title: 'Two' } },
        { id: 'bulk-3', schemaId: TaskSchema._schemaId, properties: { title: 'Three' } }
      ]
    })

    await vi.waitFor(() => {
      const seen = new Set(
        deltas
          .filter((delta): delta is Extract<QueryDelta, { type: 'add' }> => delta.type === 'add')
          .map((delta) => delta.node.id)
      )
      expect(seen).toEqual(new Set(['bulk-1', 'bulk-2', 'bulk-3']))
    })
    // Small batches flow through delta application, never a wholesale reload.
    expect(deltas.every((delta) => delta.type === 'add')).toBe(true)
  })

  it('falls back to a single reload per subscription for bulk batch writes', async () => {
    const queryId = subscriptionId()
    const deltas: QueryDelta[] = []
    await worker.subscribe(queryId, TaskSchema._schemaId, {}, (delta) => {
      deltas.push(delta)
    })

    const drafts = Array.from({ length: 251 }, (_, i) => ({
      id: `bulk-${i}`,
      schemaId: TaskSchema._schemaId,
      properties: { title: `Bulk ${i}` }
    }))
    await worker.bulkWrite({ kind: 'deterministic-import', drafts })

    await vi.waitFor(() => expect(deltas.length).toBeGreaterThan(0))
    expect(deltas).toHaveLength(1)
    expect(deltas[0].type).toBe('reload')
    expect((deltas[0] as Extract<QueryDelta, { type: 'reload' }>).data).toHaveLength(251)
  })

  it('defaults to the WebCrypto change signer when SubtleCrypto exists', () => {
    const store = (worker as unknown as { store: { changeSigner?: unknown } }).store
    if (globalThis.crypto?.subtle) {
      expect(typeof (store as { changeSigner?: unknown }).changeSigner).toBe('function')
    } else {
      expect((store as { changeSigner?: unknown }).changeSigner).toBeUndefined()
    }
  })

  it('executes atomic transactions with temp ID resolution', async () => {
    const tx = await worker.transaction([
      {
        type: 'create',
        options: {
          id: '~draft',
          schemaId: TaskSchema._schemaId,
          properties: { title: 'From tx' }
        }
      }
    ])

    expect(tx.batchId).toBeTruthy()
    expect(tx.tempIds['~draft']).toBeDefined()
    expect(tx.results[0]?.id).toBe(tx.tempIds['~draft'])
    expect('changes' in tx).toBe(false)
  })
})
