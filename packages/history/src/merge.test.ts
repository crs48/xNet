/**
 * Draft merge tests (exploration 0329 P3): three-way squash, create/delete
 * ops, Yjs delta lane, provenance, refresh-from-main, Figma/Upwelling tests.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { NodeId, SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import {
  createDraft,
  forkNodeIntoDraft,
  markCreatedInDraft,
  markDeletedInDraft
} from './draft'
import { HistoryEngine } from './engine'
import { mergeDraft, refreshDraftFromMain, threeWayPropertyMerge, makeIdRemapper } from './merge'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'

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
  const engine = new HistoryEngine(
    adapter,
    new SnapshotCache(new MemorySnapshotStorage(), { interval: 100 })
  )
  return { store, adapter, engine, did }
}

describe('threeWayPropertyMerge', () => {
  const base = { title: 'v1', status: 'open', body: 'text' }

  it('draft-only changes win cleanly; untouched keys stay absent from the patch', () => {
    const { patch, conflicts } = threeWayPropertyMerge(
      base,
      { ...base }, // main unchanged
      { ...base, title: 'draft-title' }
    )
    expect(patch).toEqual({ title: 'draft-title' })
    expect(conflicts).toEqual([])
  })

  it('disjoint main/draft edits both survive (the Figma test)', () => {
    const { patch, conflicts } = threeWayPropertyMerge(
      base,
      { ...base, status: 'done' }, // main edited status
      { ...base, title: 'draft-title' } // draft edited title
    )
    expect(patch).toEqual({ title: 'draft-title' }) // status untouched by patch
    expect(conflicts).toEqual([])
  })

  it('both-changed-differently conflicts; both-changed-same converges', () => {
    const result = threeWayPropertyMerge(
      base,
      { ...base, title: 'main-title', body: 'same-edit' },
      { ...base, title: 'draft-title', body: 'same-edit' }
    )
    expect(result.conflicts).toEqual([
      { property: 'title', base: 'v1', ours: 'main-title', theirs: 'draft-title' }
    ])
    expect(result.patch).toEqual({})
  })

  it('remaps draft-side ids inside values', () => {
    const remap = makeIdRemapper(new Map([['clone-1', 'orig-1']]))
    const { patch } = threeWayPropertyMerge(
      { rel: 'x' },
      { rel: 'x' },
      { rel: 'clone-1', list: ['clone-1', 'other'] },
      remap
    )
    expect(patch).toEqual({ rel: 'orig-1', list: ['orig-1', 'other'] })
  })
})

describe('mergeDraft', () => {
  it('squashes draft edits onto originals in one batch and records provenance', async () => {
    const { store, adapter, engine } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'v1', body: 'a' } })
    const draft = await createDraft(store, { name: 'rewrite', targetId: page.id })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)
    await store.update(entry.cloneId as NodeId, { properties: { title: 'draft-v2' } })

    const changesBefore = (await adapter.getChanges(page.id)).length
    const result = await mergeDraft(store, adapter, engine, draft.id)

    expect(result.status).toBe('merged')
    const merged = await store.getRaw(page.id)
    expect(merged?.properties.title).toBe('draft-v2')
    expect(merged?.properties.body).toBe('a')
    // Squash: exactly ONE new change on the original.
    expect((await adapter.getChanges(page.id)).length).toBe(changesBefore + 1)

    const draftNode = await store.getRaw(draft.id)
    expect(draftNode?.properties.status).toBe('merged')
    const provenance = draftNode?.properties.mergeProvenance as {
      merged: Record<string, string>
      contributors: string[]
    }
    expect(provenance.merged[page.id]).toBe(entry.cloneId)
    expect(provenance.contributors.length).toBeGreaterThan(0)
  })

  it('concurrent disjoint property edits merge with zero conflicts (Figma test)', async () => {
    const { store, adapter, engine } = setup()
    const task = await store.create({
      schemaId: TASK,
      properties: { title: 'v1', status: 'open' }
    })
    const draft = await createDraft(store, { name: 'retitle' })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, task.id)

    await store.update(task.id, { properties: { status: 'done' } }) // main
    await store.update(entry.cloneId as NodeId, { properties: { title: 'B' } }) // draft

    const result = await mergeDraft(store, adapter, engine, draft.id)
    expect(result.status).toBe('merged')
    const merged = await store.getRaw(task.id)
    expect(merged?.properties.status).toBe('done')
    expect(merged?.properties.title).toBe('B')
  })

  it('both-sides-changed returns conflict cards and applies NOTHING', async () => {
    const { store, adapter, engine } = setup()
    const task = await store.create({ schemaId: TASK, properties: { title: 'v1' } })
    const draft = await createDraft(store, { name: 'conflict' })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, task.id)

    await store.update(task.id, { properties: { title: 'main-edit' } })
    await store.update(entry.cloneId as NodeId, { properties: { title: 'draft-edit' } })

    const result = await mergeDraft(store, adapter, engine, draft.id)
    expect(result.status).toBe('conflicts')
    if (result.status === 'conflicts') {
      expect(result.conflicts[0]).toMatchObject({
        originalId: task.id,
        property: 'title',
        ours: 'main-edit',
        theirs: 'draft-edit'
      })
    }
    expect((await store.getRaw(task.id))?.properties.title).toBe('main-edit')
    expect((await store.getRaw(draft.id))?.properties.status).toBe('open')
  })

  it('promotes draft-born nodes with remapped relations and tombstones drafts of them', async () => {
    const { store, adapter, engine } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'host' } })
    const draft = await createDraft(store, { name: 'add-child' })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)

    const born = await store.create({
      schemaId: TASK,
      properties: { title: 'new-in-draft', parent: page.id }
    })
    await markCreatedInDraft(store, draft.id, born.id)
    // The clone references the draft-born node.
    await store.update(entry.cloneId as NodeId, { properties: { firstTask: born.id } })

    const result = await mergeDraft(store, adapter, engine, draft.id)
    expect(result.status).toBe('merged')
    if (result.status !== 'merged') return

    const promotedId = result.provenance.merged[born.id] as NodeId
    expect(promotedId).toBeDefined()
    expect(promotedId).not.toBe(born.id)
    const promoted = await store.getRaw(promotedId)
    expect(promoted?.properties.title).toBe('new-in-draft')

    // References remapped: original page now points at the PROMOTED id.
    expect((await store.getRaw(page.id))?.properties.firstTask).toBe(promotedId)
    // The draft-born working node is tombstoned.
    expect((await store.getRaw(born.id))?.deleted).toBe(true)
  })

  it('applies draft deletions, with a conflict card when main edited since fork', async () => {
    const { store, adapter, engine } = setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'a' } })
    const b = await store.create({ schemaId: TASK, properties: { title: 'b' } })
    const draft = await createDraft(store, { name: 'deletions' })
    await forkNodeIntoDraft(store, adapter, draft.id, a.id)
    await forkNodeIntoDraft(store, adapter, draft.id, b.id)
    await markDeletedInDraft(store, draft.id, a.id)
    await markDeletedInDraft(store, draft.id, b.id)

    await store.update(b.id, { properties: { title: 'b-edited-on-main' } })

    const result = await mergeDraft(store, adapter, engine, draft.id)
    expect(result.status).toBe('conflicts')
    if (result.status === 'conflicts') {
      expect(result.conflicts.map((c) => c.originalId)).toEqual([b.id])
    }
    // Nothing applied: a is still live.
    expect((await store.getRaw(a.id))?.deleted ?? false).toBe(false)
  })

  it('merges the Yjs post-fork delta into the original blob (idempotently)', async () => {
    const { store, adapter, engine } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'doc' } })
    const doc = new Y.Doc({ guid: page.id, gc: false })
    doc.getText('t').insert(0, 'base ')
    await adapter.setDocumentContent(page.id, Y.encodeStateAsUpdate(doc))

    const draft = await createDraft(store, { name: 'doc-edit' })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)

    // Draft edits the clone doc; main edits the original doc.
    const cloneDoc = new Y.Doc({ gc: false })
    Y.applyUpdate(cloneDoc, (await adapter.getDocumentContent(entry.cloneId as NodeId))!)
    cloneDoc.getText('t').insert(0, 'draft ')
    await adapter.setDocumentContent(entry.cloneId as NodeId, Y.encodeStateAsUpdate(cloneDoc))

    doc.getText('t').insert(0, 'main ')
    await adapter.setDocumentContent(page.id, Y.encodeStateAsUpdate(doc))

    const result = await mergeDraft(store, adapter, engine, draft.id)
    expect(result.status).toBe('merged')

    const check = new Y.Doc({ gc: false })
    Y.applyUpdate(check, (await adapter.getDocumentContent(page.id))!)
    const text = check.getText('t').toString()
    expect(text).toContain('draft ')
    expect(text).toContain('main ')
    expect(text).toContain('base ')
  })
})

describe('refreshDraftFromMain (Upwelling floating drafts)', () => {
  it('folds main edits into the clone and advances the fork point', async () => {
    const { store, adapter, engine } = setup()
    const task = await store.create({ schemaId: TASK, properties: { title: 'v1', status: 'open' } })
    const draft = await createDraft(store, { name: 'float' })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, task.id)

    await store.update(task.id, { properties: { status: 'done' } }) // main moves
    await store.update(entry.cloneId as NodeId, { properties: { title: 'draft-title' } })

    const refresh = await refreshDraftFromMain(store, adapter, engine, draft.id)
    expect(refresh.status).toBe('refreshed')

    // The clone now reflects main's status edit AND keeps its own edit.
    const clone = await store.getRaw(entry.cloneId as NodeId)
    expect(clone?.properties.status).toBe('done')
    expect(clone?.properties.title).toBe('draft-title')

    // Post-refresh merge sees NO changes from main's side (what the reviewer
    // read is what merges — Upwelling).
    const result = await mergeDraft(store, adapter, engine, draft.id)
    expect(result.status).toBe('merged')
    const merged = await store.getRaw(task.id)
    expect(merged?.properties.title).toBe('draft-title')
    expect(merged?.properties.status).toBe('done')
  })

  it('pauses on both-sides-changed properties without applying', async () => {
    const { store, adapter, engine } = setup()
    const task = await store.create({ schemaId: TASK, properties: { title: 'v1' } })
    const draft = await createDraft(store, { name: 'float' })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, task.id)

    await store.update(task.id, { properties: { title: 'main' } })
    await store.update(entry.cloneId as NodeId, { properties: { title: 'draft' } })

    const refresh = await refreshDraftFromMain(store, adapter, engine, draft.id)
    expect(refresh.status).toBe('conflicts')
    expect((await store.getRaw(entry.cloneId as NodeId))?.properties.title).toBe('draft')
  })
})
