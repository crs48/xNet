/**
 * Remaining 0329 validation-checklist items, pinned as tests:
 * - checkpoints survive aggressive MOBILE_POLICY pruning and stay restorable;
 * - a restore is itself undoable (compensating batch, no log rewrite);
 * - a crash between the merge's record lane and Yjs lane recovers on re-run.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { NodeChange, NodeId, SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { createCheckpoint, restoreToFrontier } from './checkpoint'
import { createDraft, forkNodeIntoDraft } from './draft'
import { HistoryEngine } from './engine'
import type { Frontier } from './frontier'
import { mergeDraft } from './merge'
import { PruningEngine, MOBILE_POLICY, type PrunableStorageAdapter } from './pruning'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'
import { UndoManager } from './undo-manager'
import { VerificationEngine } from './verification'

const TASK: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI
const PAGE: SchemaIRI = 'xnet://xnet.fyi/Page' as SchemaIRI

function setup() {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  const snapshots = new SnapshotCache(new MemorySnapshotStorage(), { interval: 5 })
  const engine = new HistoryEngine(adapter, snapshots)
  return { store, adapter, engine, snapshots, did }
}

function prunable(adapter: MemoryNodeStorageAdapter): PrunableStorageAdapter {
  const p = adapter as MemoryNodeStorageAdapter & PrunableStorageAdapter
  p.deleteChange = async (hash: string) => {
    const changesMap = (adapter as any).changes as Map<string, NodeChange[]>
    for (const [nodeId, changes] of changesMap) {
      changesMap.set(
        nodeId,
        changes.filter((c) => c.hash !== hash)
      )
    }
    ;((adapter as any).changesByHash as Map<string, unknown>).delete(hash)
  }
  return p
}

describe('checkpoints survive aggressive pruning (0329 validation)', () => {
  it('MOBILE_POLICY pruning cannot delete a checkpoint frontier; restore still works', async () => {
    const { store, adapter, engine, snapshots } = setup()
    const node = await store.create({ schemaId: TASK, properties: { title: 'v0' } })
    for (let i = 1; i <= 60; i++) {
      await store.update(node.id, { properties: { title: `v${i}` } })
    }

    // Checkpoint at v60 (current head), then keep editing past it.
    const checkpoint = await createCheckpoint(store, adapter, {
      name: 'the good state',
      nodeIds: [node.id]
    })
    for (let i = 61; i <= 120; i++) {
      await store.update(node.id, { properties: { title: `v${i}` } })
    }

    // Backdate every change so MOBILE_POLICY's 7-day minAge never protects
    // anything — only pins and the keep-window may.
    for (const change of await adapter.getChanges(node.id)) {
      change.wallTime -= 365 * 24 * 60 * 60 * 1000
    }

    // Seed a tail snapshot so the pruner has a base to prune below.
    const at110 = await engine.materializeAt(node.id, { type: 'index', index: 110 })
    await snapshots.save(node.id, 110, at110.changeHash, at110.node)

    const pruning = new PruningEngine(
      prunable(adapter),
      snapshots,
      new VerificationEngine(adapter),
      { ...MOBILE_POLICY, minAge: 0, requireVerifiedSnapshot: false }
    )
    const result = await pruning.pruneNode(node.id)
    expect(result.deletedChanges).toBeGreaterThan(0)

    // The pinned frontier change survived, and the restore round-trips.
    const frontier = checkpoint.properties.frontier as Frontier
    const remaining = await adapter.getChanges(node.id)
    expect(remaining.some((c) => c.hash === frontier[node.id].hash)).toBe(true)

    const restore = await restoreToFrontier(store, engine, frontier)
    expect(restore.missing).toEqual([])
    expect((await store.get(node.id))?.properties.title).toBe('v60')
  })
})

describe('restore round-trip is undoable (0329 validation)', () => {
  it('restore emits a compensating batch that UndoManager reverses', async () => {
    const { store, adapter, engine, did } = setup()
    const node = await store.create({ schemaId: TASK, properties: { title: 'past' } })
    const checkpoint = await createCheckpoint(store, adapter, {
      name: 'cp',
      nodeIds: [node.id]
    })
    await store.update(node.id, { properties: { title: 'present' } })

    const undo = new UndoManager(store, did)
    undo.start()

    await restoreToFrontier(store, engine, checkpoint.properties.frontier as Frontier)
    expect((await store.get(node.id))?.properties.title).toBe('past')

    // Undo the restore → the present state comes back (no log rewriting).
    const undone = await undo.undo(node.id)
    expect(undone).toBe(true)
    expect((await store.get(node.id))?.properties.title).toBe('present')
  })
})

describe('merge crash recovery (0329 validation)', () => {
  it('a crash between the record lane and the Yjs lane recovers on re-run', async () => {
    const { store, adapter, engine } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'v1' } })
    const doc = new Y.Doc({ guid: page.id, gc: false })
    doc.getText('t').insert(0, 'base ')
    await adapter.setDocumentContent(page.id, Y.encodeStateAsUpdate(doc))

    const draft = await createDraft(store, { name: 'crashy' })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)
    await store.update(entry.cloneId as NodeId, { properties: { title: 'draft-v2' } })
    const cloneDoc = new Y.Doc({ gc: false })
    Y.applyUpdate(cloneDoc, (await adapter.getDocumentContent(entry.cloneId as NodeId))!)
    cloneDoc.getText('t').insert(0, 'draft ')
    await adapter.setDocumentContent(entry.cloneId as NodeId, Y.encodeStateAsUpdate(cloneDoc))

    // Crash injection: the FIRST Yjs-lane write throws (after the record
    // batch committed) — exactly the two-durability-lanes window.
    const originalSet = adapter.setDocumentContent.bind(adapter)
    let crashed = false
    adapter.setDocumentContent = async (nodeId, content) => {
      if (!crashed && nodeId === page.id) {
        crashed = true
        throw new Error('simulated crash between merge lanes')
      }
      return originalSet(nodeId, content)
    }

    await expect(mergeDraft(store, adapter, engine, draft.id)).rejects.toThrow(
      'simulated crash'
    )
    // Half-merged: records landed, Yjs did not, status still open.
    expect((await store.getRaw(page.id))?.properties.title).toBe('draft-v2')
    expect((await store.getRaw(draft.id))?.properties.status).toBe('open')

    // Recovery: re-run the merge. The record three-way is now a no-op
    // (ours === theirs), the idempotent Yjs lane completes, status flips.
    const result = await mergeDraft(store, adapter, engine, draft.id)
    expect(result.status).toBe('merged')
    const check = new Y.Doc({ gc: false })
    Y.applyUpdate(check, (await adapter.getDocumentContent(page.id))!)
    expect(check.getText('t').toString()).toContain('draft ')
    expect((await store.getRaw(draft.id))?.properties.status).toBe('merged')
  })
})
