/**
 * Adapter fault injection (exploration 0272, Pillar 3).
 *
 * Proves the two safety nets the write path leans on when a statement fails
 * mid-batch:
 *
 *  1. Rollback atomicity — the data-side `applyNodeBatch` fallback wraps all
 *     operations in one transaction, so an injected failure must leave ZERO
 *     rows behind and a perfectly usable database.
 *  2. LWW re-apply convergence — after the failure, re-running the same
 *     batch to completion must land the exact state a never-faulted replica
 *     has. (The native electron path commits 250-row chunks independently —
 *     a crash between chunks leaves a committed prefix; the equivalent
 *     prefix-then-full-re-apply sequence is asserted here, and intra-chunk
 *     kills are covered at the engine level by the crash harness.)
 */

import type { DID, ContentId } from '@xnetjs/core'
import type { NodeState, NodeChange, NodePayload, SchemaIRI } from '@xnetjs/data'
import { SQLiteNodeStorageAdapter } from '@xnetjs/data'
import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
import { afterEach, describe, expect, it } from 'vitest'
import { InjectedSQLiteFault, wrapWithFaults } from '../support/fault-adapter'
import { SimRng } from '../support/rng'

const SCHEMA_ID = 'xnet://xnet.fyi/Task' as SchemaIRI
const AUTHOR = 'did:key:z6MkfaultInjectionAuthor0272' as DID

function makeNode(rng: SimRng, index: number): NodeState {
  const properties: Record<string, unknown> = {
    title: `node-${index}`,
    status: rng.int(1000),
    count: rng.int(1000)
  }
  const wallTime = 1_700_000_000_000 + index
  return {
    id: `fault-node-${index}`,
    schemaId: SCHEMA_ID,
    properties,
    timestamps: Object.fromEntries(
      Object.keys(properties).map((key, i) => [
        key,
        { lamport: index * 10 + i + 1, author: AUTHOR, wallTime }
      ])
    ),
    deleted: false,
    createdAt: wallTime,
    createdBy: AUTHOR,
    updatedAt: wallTime,
    updatedBy: AUTHOR
  }
}

function makeChange(node: NodeState, index: number): NodeChange {
  return {
    id: `fault-change-${index}`,
    type: 'node-change',
    hash: `cid:blake3:fault-${index}` as ContentId,
    payload: {
      nodeId: node.id,
      schemaId: node.schemaId,
      properties: node.properties
    } as NodePayload,
    lamport: index * 10 + 9,
    wallTime: node.updatedAt,
    authorDID: AUTHOR,
    parentHash: null,
    batchId: 'fault-batch',
    batchIndex: index,
    batchSize: 1,
    signature: new Uint8Array([7, 7, 7])
  }
}

function batchInput(nodes: NodeState[], changes: NodeChange[]) {
  return {
    batchId: 'fault-batch',
    nodes,
    changes,
    lastLamportTime: Math.max(...changes.map((c) => c.lamport)),
    affectedSchemaIds: [SCHEMA_ID],
    indexMode: 'touched' as const,
    indexProperties: true
  }
}

async function dumpState(adapter: SQLiteNodeStorageAdapter) {
  const nodes = await adapter.listNodes({ includeDeleted: true })
  return nodes
    .map((n) => ({ id: n.id, properties: n.properties, timestamps: n.timestamps }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

describe('adapter fault injection (0272)', () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!()
  })

  async function makeAdapter() {
    const db = await createMemorySQLiteAdapter()
    const faults = wrapWithFaults(db)
    const adapter = new SQLiteNodeStorageAdapter(faults.adapter)
    cleanups.push(() => db.close())
    return { adapter, faults }
  }

  it('a mid-batch statement failure rolls back the whole batch and keeps the DB usable', async () => {
    const rng = new SimRng(4242)
    const nodes = Array.from({ length: 20 }, (_, i) => makeNode(rng, i))
    const changes = nodes.map((n, i) => makeChange(n, i))
    const { adapter, faults } = await makeAdapter()

    faults.arm({ sqlIncludes: 'INSERT INTO node_properties', failOnMatch: 25 })
    await expect(adapter.applyNodeBatch(batchInput(nodes, changes))).rejects.toThrow(
      InjectedSQLiteFault
    )
    expect(faults.firedCount()).toBe(1)

    // Atomicity: nothing from the failed batch may be visible.
    expect(await adapter.listNodes({ includeDeleted: true })).toHaveLength(0)
    expect(await adapter.getAllChanges()).toHaveLength(0)

    // And the database is not wedged: the same batch applies cleanly now.
    const result = await adapter.applyNodeBatch(batchInput(nodes, changes))
    expect(result.nodeRowsWritten).toBe(20)
    expect(await adapter.getAllChanges()).toHaveLength(20)
  })

  it('re-applying after a failure converges to the never-faulted reference state', async () => {
    const rng = new SimRng(777)
    const nodes = Array.from({ length: 30 }, (_, i) => makeNode(rng, i))
    const changes = nodes.map((n, i) => makeChange(n, i))

    const faulted = await makeAdapter()
    faulted.faults.arm({ sqlIncludes: 'INSERT INTO node_properties', failOnMatch: 40 })
    await expect(faulted.adapter.applyNodeBatch(batchInput(nodes, changes))).rejects.toThrow(
      InjectedSQLiteFault
    )
    await faulted.adapter.applyNodeBatch(batchInput(nodes, changes))

    const reference = await makeAdapter()
    await reference.adapter.applyNodeBatch(batchInput(nodes, changes))

    expect(await dumpState(faulted.adapter)).toEqual(await dumpState(reference.adapter))
  })

  it('a committed prefix (chunk-boundary crash shape) re-applies to the reference state', async () => {
    // The electron batch path commits independent 250-row chunks; dying
    // between chunks leaves a committed prefix. Model exactly that: apply a
    // prefix as its own completed batch, then re-apply the FULL batch — the
    // LWW guards must make the outcome identical to a replica that never
    // crashed.
    const rng = new SimRng(31337)
    const nodes = Array.from({ length: 40 }, (_, i) => makeNode(rng, i))
    const changes = nodes.map((n, i) => makeChange(n, i))

    const crashed = await makeAdapter()
    await crashed.adapter.applyNodeBatch(batchInput(nodes.slice(0, 13), changes.slice(0, 13)))
    // Partial state is itself valid: every persisted node is complete.
    expect(await crashed.adapter.listNodes({ includeDeleted: true })).toHaveLength(13)
    await crashed.adapter.applyNodeBatch(batchInput(nodes, changes))

    const reference = await makeAdapter()
    await reference.adapter.applyNodeBatch(batchInput(nodes, changes))

    expect(await dumpState(crashed.adapter)).toEqual(await dumpState(reference.adapter))
    expect(await crashed.adapter.getAllChanges()).toHaveLength(40)
  })
})
