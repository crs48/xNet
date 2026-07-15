/**
 * History horizon tests (exploration 0329): targets below the prune line
 * fail loudly instead of silently remapping.
 */

import type { DID } from '@xnetjs/core'
import { isTagged } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { NodeChange, SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import { HistoryEngine } from './engine'
import { HistoryHorizonError } from './horizon'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'

const TEST_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI

async function setupPrunedNode() {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })

  const node = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'v0' } })
  for (let i = 1; i <= 10; i++) {
    await store.update(node.id, { properties: { title: `v${i}` } })
  }

  const all = await adapter.getChanges(node.id)
  const prunedBelow = 4
  const pruned = all.slice(0, prunedBelow)
  // Simulate a prune: drop the first N changes from the log.
  const changesMap = (adapter as any).changes as Map<string, NodeChange[]>
  changesMap.set(
    node.id,
    all.slice(prunedBelow).map((c) => c)
  )

  const engine = new HistoryEngine(
    adapter,
    new SnapshotCache(new MemorySnapshotStorage(), { interval: 100 })
  )
  return { engine, node, pruned, retained: all.slice(prunedBelow) }
}

describe('HistoryEngine horizon', () => {
  it('reports the horizon of a pruned chain and null for a full chain', async () => {
    const { engine, node, retained } = await setupPrunedNode()
    const horizon = await engine.getHorizon(node.id)
    expect(horizon).not.toBeNull()
    expect(horizon!.hash).toBe(retained[0].hash)
  })

  it('throws HistoryHorizonError for a pruned hash target', async () => {
    const { engine, node, pruned } = await setupPrunedNode()
    const err = await engine
      .materializeAt(node.id, { type: 'hash', hash: pruned[1].hash })
      .then(() => null)
      .catch((e: unknown) => e)
    expect(isTagged(err, 'HistoryHorizonError')).toBe(true)
    expect((err as HistoryHorizonError).horizon.nodeId).toBe(node.id)
  })

  it('throws HistoryHorizonError for a wall target older than the horizon', async () => {
    const { engine, node, pruned } = await setupPrunedNode()
    await expect(
      engine.materializeAt(node.id, { type: 'wall', timestamp: pruned[0].wallTime - 1 })
    ).rejects.toThrow(HistoryHorizonError)
  })

  it('still resolves wall targets at or above the horizon', async () => {
    const { engine, node, retained } = await setupPrunedNode()
    const state = await engine.materializeAt(node.id, {
      type: 'wall',
      timestamp: retained[retained.length - 1].wallTime
    })
    expect(state.node.properties.title).toBe('v10')
  })

  it('unpruned chains keep the pre-horizon behavior (wall before creation -> genesis)', async () => {
    const keyPair = generateSigningKeyPair()
    const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
    const adapter = new MemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage: adapter,
      authorDID: did,
      signingKey: keyPair.privateKey
    })
    const node = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'only' } })
    const engine = new HistoryEngine(
      adapter,
      new SnapshotCache(new MemorySnapshotStorage(), { interval: 100 })
    )

    expect(await engine.getHorizon(node.id)).toBeNull()
    const state = await engine.materializeAt(node.id, { type: 'wall', timestamp: 1 })
    expect(state.node.properties.title).toBe('only')
  })
})
