/**
 * Checkpoint tests (exploration 0329): create/list/delete, pinning, restore.
 */

import type { ContentId, DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter, CHECKPOINT_SCHEMA_IRI } from '@xnetjs/data'
import type { SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import {
  createCheckpoint,
  deleteCheckpoint,
  listCheckpoints,
  restoreToFrontier
} from './checkpoint'
import { HistoryEngine } from './engine'
import type { Frontier } from './frontier'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'

const TASK: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI

async function setup() {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  const engine = new HistoryEngine(
    adapter,
    new SnapshotCache(new MemorySnapshotStorage(), { interval: 100 })
  )
  return { store, adapter, engine }
}

describe('createCheckpoint', () => {
  it('creates a Checkpoint node with the frontier and pins every hash', async () => {
    const { store, adapter } = await setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'a1' } })
    const b = await store.create({ schemaId: TASK, properties: { title: 'b1' } })

    const checkpoint = await createCheckpoint(store, adapter, {
      name: 'Before rewrite',
      note: 'good state',
      nodeIds: [a.id, b.id],
      scopeId: a.id
    })

    expect(checkpoint.schemaId).toBe(CHECKPOINT_SCHEMA_IRI)
    const frontier = checkpoint.properties.frontier as Frontier
    expect(Object.keys(frontier).sort()).toEqual([a.id, b.id].sort())

    // Every frontier hash is pinned under the checkpoint's id.
    const hashes = Object.values(frontier).map((e) => e.hash)
    const pinned = await adapter.pins.getPinnedKeysAmong(hashes)
    expect(pinned.size).toBe(2)
  })

  it('records Yjs snapshot refs when a capture callback is provided', async () => {
    const { store, adapter } = await setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'a1' } })

    const checkpoint = await createCheckpoint(store, adapter, {
      name: 'with-doc',
      nodeIds: [a.id],
      captureYjsSnapshot: async () => ({ timestamp: 12345 })
    })

    const frontier = checkpoint.properties.frontier as Frontier
    expect(frontier[a.id].yjsSnapshotRef).toBe(`${a.id}@12345`)
    const pinned = await adapter.pins.getPinnedKeysAmong([`yjs:${a.id}@12345`])
    expect(pinned.size).toBe(1)
  })
})

describe('listCheckpoints / deleteCheckpoint', () => {
  it('lists by scope and releases pins on delete', async () => {
    const { store, adapter } = await setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'a1' } })
    const b = await store.create({ schemaId: TASK, properties: { title: 'b1' } })

    const cp1 = await createCheckpoint(store, adapter, {
      name: 'cp-a',
      nodeIds: [a.id],
      scopeId: a.id
    })
    await createCheckpoint(store, adapter, { name: 'cp-b', nodeIds: [b.id], scopeId: b.id })

    const forA = await listCheckpoints(store, a.id)
    expect(forA.map((c) => c.properties.name)).toEqual(['cp-a'])
    expect((await listCheckpoints(store)).length).toBe(2)

    const frontier = cp1.properties.frontier as Frontier
    await deleteCheckpoint(store, adapter, cp1.id)
    const deleted = await store.get(cp1.id)
    expect(deleted === null || deleted.deleted).toBe(true)
    const stillPinned = await adapter.pins.getPinnedKeysAmong([frontier[a.id].hash])
    expect(stillPinned.size).toBe(0)
  })
})

describe('restoreToFrontier', () => {
  it('restores members to checkpoint values in one transaction', async () => {
    const { store, adapter, engine } = await setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'v1', status: 'open' } })
    const checkpoint = await createCheckpoint(store, adapter, { name: 'cp', nodeIds: [a.id] })
    await store.update(a.id, { properties: { title: 'v2', status: 'done' } })

    const result = await restoreToFrontier(
      store,
      engine,
      checkpoint.properties.frontier as Frontier
    )

    expect(result.missing).toEqual([])
    expect(result.operations).toBe(1)
    const restored = await store.get(a.id)
    expect(restored?.properties.title).toBe('v1')
    expect(restored?.properties.status).toBe('open')
  })

  it('deletes members created after the checkpoint when membership is provided', async () => {
    const { store, adapter, engine } = await setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'a' } })
    const checkpoint = await createCheckpoint(store, adapter, { name: 'cp', nodeIds: [a.id] })
    const later = await store.create({ schemaId: TASK, properties: { title: 'later' } })

    await restoreToFrontier(store, engine, checkpoint.properties.frontier as Frontier, [
      a.id,
      later.id
    ])

    expect(await store.get(a.id)).not.toBeNull()
    const laterNow = await store.get(later.id)
    expect(laterNow === null || laterNow.deleted).toBe(true)
  })

  it('reports horizon-missing members instead of failing the whole restore', async () => {
    const { store, adapter, engine } = await setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'a' } })
    await store.update(a.id, { properties: { title: 'a2' } })

    const result = await restoreToFrontier(store, engine, {
      [a.id]: { hash: 'pruned-away-hash' as ContentId }
    })

    expect(result.missing).toEqual([a.id])
    expect(result.operations).toBe(0)
  })

  it('the restore itself is a compensating batch (undoable, no log rewrite)', async () => {
    const { store, adapter, engine } = await setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'v1' } })
    const checkpoint = await createCheckpoint(store, adapter, { name: 'cp', nodeIds: [a.id] })
    await store.update(a.id, { properties: { title: 'v2' } })

    const before = (await adapter.getChanges(a.id)).length
    await restoreToFrontier(store, engine, checkpoint.properties.frontier as Frontier)
    const after = (await adapter.getChanges(a.id)).length

    // Restore appended exactly one new change; nothing was rewritten.
    expect(after).toBe(before + 1)
  })
})
