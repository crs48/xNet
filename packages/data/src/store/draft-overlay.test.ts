/**
 * NodeStore draft overlay tests (exploration 0329 P2): content swap on read
 * paths, write redirect with lazy COW, event mirroring, zero-cost inactive.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { describe, it, expect, vi } from 'vitest'
import type { SchemaIRI } from '../schema/node'
import { MemoryNodeStorageAdapter } from './memory-adapter'
import { NodeStore } from './store'
import type { NodeId } from './types'

const TASK: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI

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

/** Create an original + clone pair and check the draft out. */
async function checkoutWithClone(store: NodeStore) {
  const original = await store.create({ schemaId: TASK, properties: { title: 'main-v1' } })
  const clone = await store.create({ schemaId: TASK, properties: { title: 'draft-v1' } })
  store.setCheckedOutDraft({
    draftId: 'draft-1' as NodeId,
    members: [original.id],
    clones: { [original.id]: clone.id }
  })
  return { original, clone }
}

describe('draft overlay reads', () => {
  it('get() swaps content to the clone under the original id', async () => {
    const { store } = setup()
    const { original } = await checkoutWithClone(store)

    const seen = await store.get(original.id)
    expect(seen?.id).toBe(original.id) // id preserved
    expect(seen?.properties.title).toBe('draft-v1') // content swapped
  })

  it('getRaw() bypasses the overlay (merge review sees main)', async () => {
    const { store } = setup()
    const { original } = await checkoutWithClone(store)
    expect((await store.getRaw(original.id))?.properties.title).toBe('main-v1')
  })

  it('list() and query() swap member content, keep ids and non-members', async () => {
    const { store } = setup()
    const { original } = await checkoutWithClone(store)
    const other = await store.create({ schemaId: TASK, properties: { title: 'other' } })

    const listed = await store.list({ schemaId: TASK })
    const byId = new Map(listed.map((n) => [n.id, n.properties.title]))
    expect(byId.get(original.id)).toBe('draft-v1')
    expect(byId.get(other.id)).toBe('other')

    const queried = await store.query({ schemaId: TASK, includeDeleted: false })
    const qById = new Map(queried.nodes.map((n) => [n.id, n.properties.title]))
    expect(qById.get(original.id)).toBe('draft-v1')
  })

  it('checkout(null) returns to main everywhere', async () => {
    const { store } = setup()
    const { original } = await checkoutWithClone(store)
    store.setCheckedOutDraft(null)
    expect((await store.get(original.id))?.properties.title).toBe('main-v1')
  })
})

describe('draft overlay writes', () => {
  it('update() to a forked member lands on the clone, never main', async () => {
    const { store } = setup()
    const { original, clone } = await checkoutWithClone(store)

    await store.update(original.id, { properties: { title: 'draft-v2' } })

    expect((await store.getRaw(original.id))?.properties.title).toBe('main-v1')
    expect((await store.getRaw(clone.id))?.properties.title).toBe('draft-v2')
    expect((await store.get(original.id))?.properties.title).toBe('draft-v2')
  })

  it('first write to an unforked member triggers lazy COW via onMissingMember', async () => {
    const { store } = setup()
    const original = await store.create({ schemaId: TASK, properties: { title: 'main-v1' } })
    let forkedCloneId: NodeId | null = null

    store.setCheckedOutDraft({
      draftId: 'draft-1' as NodeId,
      members: [original.id],
      clones: {},
      onMissingMember: async (id) => {
        const snapshot = await store.getRaw(id)
        const clone = await store.create({
          schemaId: snapshot!.schemaId,
          properties: { ...snapshot!.properties }
        })
        forkedCloneId = clone.id
        return clone.id
      }
    })

    await store.update(original.id, { properties: { title: 'draft-edit' } })

    expect(forkedCloneId).not.toBeNull()
    expect((await store.getRaw(original.id))?.properties.title).toBe('main-v1')
    // The overlay self-updated: reads now resolve to the fresh clone.
    expect(store.getCheckedOutDraft()?.clones[original.id]).toBe(forkedCloneId)
    expect((await store.get(original.id))?.properties.title).toBe('draft-edit')
  })

  it('writes to non-members and bookkeeping nodes pass through untouched', async () => {
    const { store } = setup()
    const { original } = await checkoutWithClone(store)
    const unrelated = await store.create({ schemaId: TASK, properties: { title: 'x' } })
    const onMissingMember = vi.fn()

    store.setCheckedOutDraft({
      draftId: 'draft-1' as NodeId,
      members: [original.id],
      clones: store.getCheckedOutDraft()!.clones,
      onMissingMember
    })

    await store.update(unrelated.id, { properties: { title: 'y' } })
    expect(onMissingMember).not.toHaveBeenCalled()
    expect((await store.getRaw(unrelated.id))?.properties.title).toBe('y')
  })

  it('delete() while checked out tombstones the clone, not main', async () => {
    const { store } = setup()
    const { original, clone } = await checkoutWithClone(store)

    await store.delete(original.id)

    expect((await store.getRaw(original.id))?.deleted ?? false).toBe(false)
    expect((await store.getRaw(clone.id))?.deleted).toBe(true)
  })
})

describe('draft-aware queries (P5)', () => {
  it('filters and sorts see CLONE values; clone rows are hidden', async () => {
    const { store } = setup()
    const a = await store.create({ schemaId: TASK, properties: { title: 'a', status: 'open' } })
    const b = await store.create({ schemaId: TASK, properties: { title: 'b', status: 'open' } })
    // Draft changes a's status to done — the original scalar still says open.
    const cloneA = await store.create({
      schemaId: TASK,
      properties: { title: 'a', status: 'done' }
    })
    store.setCheckedOutDraft({
      draftId: 'draft-1' as NodeId,
      members: [a.id],
      clones: { [a.id]: cloneA.id }
    })

    // Membership: filtering for done must return the member (via clone value)…
    const done = await store.query({
      schemaId: TASK,
      includeDeleted: false,
      where: { status: 'done' }
    })
    expect(done.nodes.map((n) => n.id)).toEqual([a.id])
    expect(done.plan.strategy).toBe('draft-overlay')

    // …and filtering for open must NOT return it (and never the clone row).
    const open = await store.query({
      schemaId: TASK,
      includeDeleted: false,
      where: { status: 'open' }
    })
    expect(open.nodes.map((n) => n.id)).toEqual([b.id])

    // list() also hides clone rows while showing swapped members.
    const listed = await store.list({ schemaId: TASK })
    expect(listed.map((n) => n.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('pagination windows over draft-visible rows', async () => {
    const { store } = setup()
    const ids: NodeId[] = []
    for (let i = 0; i < 5; i++) {
      const n = await store.create({ schemaId: TASK, properties: { title: `t${i}`, rank: i } })
      ids.push(n.id)
    }
    const clone = await store.create({ schemaId: TASK, properties: { title: 't0', rank: 99 } })
    store.setCheckedOutDraft({
      draftId: 'draft-1' as NodeId,
      members: [ids[0]],
      clones: { [ids[0]]: clone.id }
    })

    const page = await store.query({
      schemaId: TASK,
      includeDeleted: false,
      orderBy: { rank: 'asc' },
      limit: 3
    })
    // Member 0's rank is now 99 (clone value) → sorts last; page holds t1-t3.
    expect(page.nodes.map((n) => n.properties.title)).toEqual(['t1', 't2', 't3'])
    expect(page.totalCount).toBe(5) // clone row hidden, member counted once
  })
})

describe('draft overlay events', () => {
  it('clone changes mirror to original-id subscribers with re-keyed content', async () => {
    const { store } = setup()
    const { original } = await checkoutWithClone(store)

    const events: { id: string; title: unknown }[] = []
    store.subscribeToNode(original.id, (event) => {
      if (event.node) events.push({ id: event.node.id, title: event.node.properties.title })
    })

    await store.update(original.id, { properties: { title: 'draft-v2' } })

    expect(events).toContainEqual({ id: original.id, title: 'draft-v2' })
  })

  it('overlay listeners fire on checkout and on lazy fork', async () => {
    const { store } = setup()
    const original = await store.create({ schemaId: TASK, properties: { title: 'v1' } })
    const notified = vi.fn()
    store.subscribeToDraftOverlay(notified)

    store.setCheckedOutDraft({
      draftId: 'draft-1' as NodeId,
      members: [original.id],
      clones: {},
      onMissingMember: async () => (await store.create({ schemaId: TASK, properties: {} })).id
    })
    expect(notified).toHaveBeenCalledTimes(1)

    await store.update(original.id, { properties: { title: 'v2' } })
    expect(notified).toHaveBeenCalledTimes(2)
  })
})
