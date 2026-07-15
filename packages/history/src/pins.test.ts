/**
 * Pin registry integration tests (exploration 0329): pinned changes survive
 * pruning; pinned Yjs snapshots survive eviction.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { DocumentHistoryEngine, MemoryYjsSnapshotStorage } from './document-history'
import { pinKeyForChange, pinKeyForYjsSnapshot } from './frontier'
import { PruningEngine, type PrunableStorageAdapter } from './pruning'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'
import { VerificationEngine } from './verification'

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

/** Memory adapter + deleteChange shim (same shape as history.test.ts). */
function prunableAdapter(adapter: MemoryNodeStorageAdapter): PrunableStorageAdapter {
  const prunable = adapter as MemoryNodeStorageAdapter & PrunableStorageAdapter
  prunable.deleteChange = async (hash: string) => {
    const changesMap = (adapter as any).changes as Map<string, { hash: string }[]>
    for (const [nodeId, changes] of changesMap) {
      changesMap.set(
        nodeId,
        changes.filter((c) => c.hash !== hash)
      )
    }
    const hashMap = (adapter as any).changesByHash as Map<string, unknown>
    hashMap.delete(hash)
  }
  return prunable
}

describe('PinRegistry (memory adapter)', () => {
  it('add/lookup/remove-by-owner round-trips', async () => {
    const adapter = new MemoryNodeStorageAdapter()
    await adapter.pins.addPins([
      { key: 'hash-a', ownerId: 'checkpoint-1', reason: 'checkpoint' },
      { key: 'hash-b', ownerId: 'checkpoint-1', reason: 'checkpoint' },
      { key: 'hash-a', ownerId: 'draft-1', reason: 'draft-fork' }
    ])

    expect(await adapter.pins.countPins()).toBe(3)
    expect(await adapter.pins.getPinnedKeysAmong(['hash-a', 'hash-b', 'hash-c'])).toEqual(
      new Set(['hash-a', 'hash-b'])
    )

    await adapter.pins.removePinsByOwner('checkpoint-1')
    // hash-a stays pinned through draft-1; hash-b is released.
    expect(await adapter.pins.getPinnedKeysAmong(['hash-a', 'hash-b'])).toEqual(new Set(['hash-a']))
  })
})

describe('PruningEngine respects pins', () => {
  async function setupPrunableNode() {
    const { store, adapter } = createTestStore()
    const node = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'v0' } })
    for (let i = 1; i <= 30; i++) {
      await store.update(node.id, { properties: { title: `v${i}` } })
    }
    // Backdate everything so minAge never blocks the prune.
    const changes = await adapter.getChanges(node.id)
    for (const change of changes) {
      change.wallTime = change.wallTime - 365 * 24 * 60 * 60 * 1000
    }

    const snapshotCache = new SnapshotCache(new MemorySnapshotStorage(), { interval: 5 })
    // Force a snapshot near the tail so early changes become prunable.
    const { HistoryEngine } = await import('./engine')
    const engine = new HistoryEngine(adapter, snapshotCache)
    const at25 = await engine.materializeAt(node.id, { type: 'index', index: 25 })
    await snapshotCache.save(node.id, 25, at25.changeHash, at25.node)

    const pruning = new PruningEngine(
      prunableAdapter(adapter),
      snapshotCache,
      new VerificationEngine(adapter),
      { keepRecentChanges: 2, minAge: 0, pruneThreshold: 10, requireVerifiedSnapshot: false }
    )
    return { store, adapter, node, pruning }
  }

  it('never deletes a pinned change', async () => {
    const { adapter, node, pruning } = await setupPrunableNode()
    const changes = await adapter.getChanges(node.id)
    const pinnedChange = changes[3]
    await adapter.pins.addPins([
      { key: pinKeyForChange(pinnedChange.hash), ownerId: 'checkpoint-x', reason: 'checkpoint' }
    ])

    const result = await pruning.pruneNode(node.id)
    expect(result.deletedChanges).toBeGreaterThan(0)

    const remaining = await adapter.getChanges(node.id)
    expect(remaining.some((c) => c.hash === pinnedChange.hash)).toBe(true)
  })

  it('deletes the same change once unpinned', async () => {
    const { adapter, node, pruning } = await setupPrunableNode()
    const changes = await adapter.getChanges(node.id)
    const target = changes[3]
    await adapter.pins.addPins([
      { key: pinKeyForChange(target.hash), ownerId: 'draft-y', reason: 'draft-fork' }
    ])
    await adapter.pins.removePinsByOwner('draft-y')

    await pruning.pruneNode(node.id)
    const remaining = await adapter.getChanges(node.id)
    expect(remaining.some((c) => c.hash === target.hash)).toBe(false)
  })
})

describe('DocumentHistoryEngine eviction respects pins', () => {
  it('keeps a pinned snapshot past maxPerNode', async () => {
    const adapter = new MemoryNodeStorageAdapter()
    const storage = new MemoryYjsSnapshotStorage()
    const engine = new DocumentHistoryEngine(storage, {
      minInterval: 0,
      maxPerNode: 3,
      pins: adapter.pins
    })

    const doc = new Y.Doc({ gc: false })
    doc.getText('t').insert(0, 'first ')
    const first = await engine.forceCapture('node-1', doc)
    // Snapshots are keyed (nodeId, timestamp): separate the pinned capture's
    // millisecond from the next one (production minInterval guarantees this).
    await new Promise((r) => setTimeout(r, 2))
    // Pin the very first snapshot (as a checkpoint would, at creation time).
    await adapter.pins.addPins([
      {
        key: pinKeyForYjsSnapshot('node-1', first.timestamp),
        ownerId: 'checkpoint-z',
        reason: 'checkpoint'
      }
    ])

    for (let i = 0; i < 6; i++) {
      doc.getText('t').insert(0, `edit-${i} `)
      await engine.forceCapture('node-1', doc)
      // Ensure strictly increasing timestamps even on a fast clock.
      await new Promise((r) => setTimeout(r, 2))
    }

    const snapshots = await storage.getYjsSnapshots('node-1')
    const timestamps = snapshots.map((s) => s.timestamp)
    expect(timestamps).toContain(first.timestamp)
    // 3 recent + the pinned survivor; unpinned old snapshots were evicted.
    expect(snapshots.length).toBeLessThanOrEqual(4)
  })
})
