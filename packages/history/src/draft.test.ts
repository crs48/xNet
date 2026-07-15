/**
 * Draft lifecycle + overlay integration tests (exploration 0329 P2).
 */

import type { DID } from '@xnetjs/core'
import { fromBase64 } from '@xnetjs/crypto'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter, DRAFT_SCHEMA_IRI } from '@xnetjs/data'
import type { NodeId, SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import {
  DraftPolicyError,
  createDraft,
  discardDraft,
  draftEntries,
  forkNodeIntoDraft,
  isForkable,
  listDrafts
} from './draft'

const TASK: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI
const PAGE: SchemaIRI = 'xnet://xnet.fyi/Page' as SchemaIRI
const SPACE: SchemaIRI = 'xnet://xnet.fyi/Space@1.0.0' as SchemaIRI

function setup() {
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

describe('never-fork policy', () => {
  it('forbids identity/membership/conversational schemas', () => {
    expect(isForkable(TASK)).toBe(true)
    expect(isForkable(PAGE)).toBe(true)
    expect(isForkable(SPACE)).toBe(false)
    expect(isForkable('xnet://xnet.fyi/Comment@1.0.0')).toBe(false)
    expect(isForkable('xnet://xnet.fyi/ChatMessage@1.0.0')).toBe(false)
    expect(isForkable(DRAFT_SCHEMA_IRI)).toBe(false)
  })
})

describe('createDraft / forkNodeIntoDraft', () => {
  it('creates an open draft and lazily forks a member with a pinned fork point', async () => {
    const { store, adapter } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'v1' } })
    const draft = await createDraft(store, { name: 'Restructure intro', targetId: page.id })

    expect(draft.properties.status).toBe('open')
    expect(draftEntries(draft)).toEqual({})

    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)
    const clone = await store.get(entry.cloneId as NodeId)
    expect(clone?.properties.title).toBe('v1')
    expect(clone?.schemaId).toBe(PAGE)

    // Fork point = original's head at fork, pinned under the draft id.
    const pinned = await adapter.pins.getPinnedKeysAmong([entry.forkedAtHash])
    expect(pinned.size).toBe(1)

    // Idempotent: second fork returns the same entry.
    const again = await forkNodeIntoDraft(store, adapter, draft.id, page.id)
    expect(again.cloneId).toBe(entry.cloneId)
  })

  it('byte-copies the Yjs blob and records the fork state vector', async () => {
    const { store, adapter } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'doc' } })

    const doc = new Y.Doc({ guid: page.id, gc: false })
    doc.getXmlFragment('content-v4').insert(0, [new Y.XmlText('hello world')])
    await adapter.setDocumentContent(page.id, Y.encodeStateAsUpdate(doc))

    const draft = await createDraft(store, { name: 'doc-edit', targetId: page.id })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)

    const cloneBlob = await adapter.getDocumentContent(entry.cloneId as NodeId)
    expect(cloneBlob).not.toBeNull()

    // The clone doc replays to identical content (a true fork).
    const cloneDoc = new Y.Doc({ gc: false })
    Y.applyUpdate(cloneDoc, cloneBlob!)
    expect(cloneDoc.getXmlFragment('content-v4').toString()).toContain('hello world')

    // The fork state vector decodes and matches the original's.
    expect(entry.forkedAtYjsStateVector).toBeDefined()
    const sv = fromBase64(entry.forkedAtYjsStateVector!)
    expect(sv).toEqual(Y.encodeStateVector(doc))

    // Post-fork edits on both sides commute: merging the clone's delta into
    // the original converges.
    doc.getXmlFragment('content-v4').insert(1, [new Y.XmlText(' main-edit')])
    cloneDoc.getXmlFragment('content-v4').insert(1, [new Y.XmlText(' draft-edit')])
    const delta = Y.encodeStateAsUpdate(cloneDoc, sv)
    Y.applyUpdate(doc, delta)
    const merged = doc.getXmlFragment('content-v4').toString()
    expect(merged).toContain('main-edit')
    expect(merged).toContain('draft-edit')
  })

  it('refuses to fork never-fork schemas', async () => {
    const { store, adapter } = setup()
    const comment = await store.create({
      schemaId: 'xnet://xnet.fyi/Comment@1.0.0' as SchemaIRI,
      properties: { content: 'hi' }
    })
    const draft = await createDraft(store, { name: 'bad' })
    await expect(forkNodeIntoDraft(store, adapter, draft.id, comment.id)).rejects.toThrow(
      DraftPolicyError
    )
  })
})

describe('discardDraft / listDrafts', () => {
  it('tombstones clones, releases pins, marks discarded', async () => {
    const { store, adapter } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'v1' } })
    const draft = await createDraft(store, { name: 'throwaway', targetId: page.id })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)

    await discardDraft(store, adapter, draft.id)

    const clone = await store.get(entry.cloneId as NodeId)
    expect(clone === null || clone.deleted).toBe(true)
    expect((await store.get(page.id))?.properties.title).toBe('v1') // original untouched
    expect(await adapter.pins.getPinnedKeysAmong([entry.forkedAtHash])).toEqual(new Set())
    expect((await store.get(draft.id))?.properties.status).toBe('discarded')
    expect(await listDrafts(store)).toEqual([])
  })

  it('shareDraft lifts privacy so clone changes become publishable (traffic measured)', async () => {
    const { store, adapter } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'v1' } })
    const draft = await createDraft(store, { name: 'shared', targetId: page.id })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)

    // Device-local: the sync predicate excludes clone + draft ids.
    expect(store.isDraftPrivate(entry.cloneId as NodeId)).toBe(true)
    expect(store.isDraftPrivate(draft.id)).toBe(true)

    const { shareDraft } = await import('./draft')
    await shareDraft(store, draft.id)

    // Shared: the same predicate now lets them publish — the measured cost is
    // the member's doubled change traffic (original + clone lanes).
    expect(store.isDraftPrivate(entry.cloneId as NodeId)).toBe(false)
    expect(store.isDraftPrivate(draft.id)).toBe(false)
    const cloneChanges = await adapter.getChanges(entry.cloneId as NodeId)
    const originalChanges = await adapter.getChanges(page.id)
    expect(cloneChanges.length).toBeGreaterThan(0)
    expect(originalChanges.length).toBeGreaterThan(0)
  })

  it('rehydrateDraftPrivacy rebuilds the exclusion set from persisted drafts', async () => {
    const { store, adapter } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'v1' } })
    const draft = await createDraft(store, { name: 'survives-reload', targetId: page.id })
    const entry = await forkNodeIntoDraft(store, adapter, draft.id, page.id)

    // Simulate a reload: a fresh store over the SAME storage knows nothing.
    const keyPair = generateSigningKeyPair()
    const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
    const fresh = new NodeStore({ storage: adapter, authorDID: did, signingKey: keyPair.privateKey })
    expect(fresh.isDraftPrivate(entry.cloneId as NodeId)).toBe(false)

    const { rehydrateDraftPrivacy } = await import('./draft')
    await rehydrateDraftPrivacy(fresh)
    expect(fresh.isDraftPrivate(entry.cloneId as NodeId)).toBe(true)
    expect(fresh.isDraftPrivate(draft.id)).toBe(true)
    expect(fresh.isDraftPrivate(page.id)).toBe(false) // originals still publish
  })

  it('lists open drafts scoped to a target', async () => {
    const { store } = setup()
    const a = await store.create({ schemaId: PAGE, properties: { title: 'a' } })
    const b = await store.create({ schemaId: PAGE, properties: { title: 'b' } })
    await createDraft(store, { name: 'for-a', targetId: a.id })
    await createDraft(store, { name: 'for-b', targetId: b.id })

    expect((await listDrafts(store, a.id)).map((d) => d.properties.name)).toEqual(['for-a'])
    expect((await listDrafts(store)).length).toBe(2)
  })
})
