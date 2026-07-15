/**
 * Tests for the Frontier primitive (exploration 0329).
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import { HistoryEngine } from './engine'
import {
  captureFrontier,
  frontierAtWallTime,
  frontierTarget,
  makeYjsSnapshotRef,
  materializeAtFrontier,
  parseYjsSnapshotRef
} from './frontier'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'

const TEST_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI

function createTestStore() {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  return { store, adapter, did }
}

function createEngine(adapter: MemoryNodeStorageAdapter) {
  return new HistoryEngine(adapter, new SnapshotCache(new MemorySnapshotStorage(), { interval: 5 }))
}

describe('Yjs snapshot refs', () => {
  it('round-trips node id and timestamp', () => {
    const ref = makeYjsSnapshotRef('node-1', 12345)
    expect(parseYjsSnapshotRef(ref)).toEqual({ nodeId: 'node-1', timestamp: 12345 })
  })

  it('survives @ characters in node ids', () => {
    const ref = makeYjsSnapshotRef('weird@id', 99)
    expect(parseYjsSnapshotRef(ref)).toEqual({ nodeId: 'weird@id', timestamp: 99 })
  })

  it('rejects malformed refs', () => {
    expect(parseYjsSnapshotRef('no-timestamp')).toBeNull()
    expect(parseYjsSnapshotRef('@123')).toBeNull()
    expect(parseYjsSnapshotRef('id@not-a-number')).toBeNull()
  })
})

describe('captureFrontier', () => {
  it('captures each node at its latest change and omits unknown nodes', async () => {
    const { store, adapter } = createTestStore()
    const a = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'a' } })
    const b = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'b' } })
    await store.update(a.id, { properties: { title: 'a2' } })

    const frontier = await captureFrontier(adapter, [a.id, b.id, 'missing-node'])

    expect(Object.keys(frontier).sort()).toEqual([a.id, b.id].sort())
    const lastA = await adapter.getChanges(a.id)
    expect(frontier[a.id].hash).toBe(lastA[lastA.length - 1].hash)
  })

  it('materializes back to the captured state even after later edits', async () => {
    const { store, adapter } = createTestStore()
    const a = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'before' } })
    const frontier = await captureFrontier(adapter, [a.id])
    await store.update(a.id, { properties: { title: 'after' } })

    const engine = createEngine(adapter)
    const { states, missing } = await materializeAtFrontier(engine, frontier)

    expect(missing).toEqual([])
    expect(states.get(a.id)?.node.properties.title).toBe('before')
  })
})

describe('frontierAtWallTime', () => {
  it('picks the latest change at or before the timestamp per node', async () => {
    const { store, adapter } = createTestStore()
    const a = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'v1' } })
    const changesAfterCreate = await adapter.getChanges(a.id)
    const createTime = changesAfterCreate[0].wallTime

    await store.update(a.id, { properties: { title: 'v2' } })

    const frontier = await frontierAtWallTime(adapter, [a.id], createTime)
    expect(frontier[a.id].hash).toBe(changesAfterCreate[0].hash)
  })

  it('omits nodes that did not exist at the timestamp', async () => {
    const { store, adapter } = createTestStore()
    const a = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'v1' } })
    const changes = await adapter.getChanges(a.id)

    const frontier = await frontierAtWallTime(adapter, [a.id], changes[0].wallTime - 1)
    expect(frontier[a.id]).toBeUndefined()
  })
})

describe('materializeAtFrontier', () => {
  it('reports pruned/unknown hashes as missing instead of remapping', async () => {
    const { store, adapter } = createTestStore()
    const a = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'x' } })
    const engine = createEngine(adapter)

    const { states, missing } = await materializeAtFrontier(engine, {
      [a.id]: { hash: 'not-a-real-hash' }
    })

    expect(states.size).toBe(0)
    expect(missing).toEqual([a.id])
  })

  it('frontierTarget produces a hash-anchored target', () => {
    expect(frontierTarget({ hash: 'abc' })).toEqual({ type: 'hash', hash: 'abc' })
  })
})
