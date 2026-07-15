/**
 * useDraft (exploration 0329 P2/P3): open drafts list and follow Draft-node
 * writes; checkout installs the overlay (content-swap reads, lazy COW on
 * first write); review cards report pending changes and conflicts without
 * applying; merge squashes onto main and returns to it; refresh folds main's
 * changes into the draft; discard tombstones clones and leaves main intact.
 */

import type { DID } from '@xnetjs/core'
import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter, NodeStore, PageSchema, TaskSchema } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { XNetProvider } from '../context'
import { useDraft } from './useDraft'
import { useNodeStore } from './useNodeStore'

describe('useDraft', () => {
  let identityResult: { identity: Identity; privateKey: Uint8Array }
  let did: DID
  let storage: MemoryNodeStorageAdapter

  beforeEach(() => {
    identityResult = generateIdentity()
    did = identityResult.identity.did as DID
    storage = new MemoryNodeStorageAdapter()
  })

  function createWrapper() {
    const currentStorage = storage
    const currentDid = did
    const currentKey = identityResult.privateKey

    return function Wrapper({ children }: { children: ReactNode }) {
      const stableStorage = useMemo(() => currentStorage, [])
      return (
        <XNetProvider
          config={{
            nodeStorage: stableStorage,
            authorDID: currentDid,
            signingKey: currentKey,
            disableSyncManager: true
          }}
        >
          {children}
        </XNetProvider>
      )
    }
  }

  async function seedNode(title: string, schemaId = TaskSchema.schema['@id']) {
    const bootstrapStore = new NodeStore({
      storage,
      authorDID: did,
      signingKey: identityResult.privateKey
    })
    await bootstrapStore.initialize()
    return bootstrapStore.create({
      schemaId,
      properties: { title }
    })
  }

  function mountHook(nodeId: string) {
    return renderHook(
      () => {
        const nodeStore = useNodeStore()
        const d = useDraft(nodeId)
        return { nodeStore, d }
      },
      { wrapper: createWrapper() }
    )
  }

  it('creates a draft, checks it out, and lazily forks on first write', async () => {
    const node = await seedNode('main-title')
    const { result } = mountHook(node.id)
    await waitFor(() => expect(result.current.nodeStore.isReady).toBe(true))
    expect(result.current.d.drafts).toEqual([])
    expect(result.current.d.checkedOut).toBeNull()

    await act(async () => {
      const draft = await result.current.d.createDraft('Try a rewrite')
      expect(draft?.properties.name).toBe('Try a rewrite')
    })
    await waitFor(() => expect(result.current.d.drafts.length).toBe(1))
    await waitFor(() =>
      expect(result.current.d.checkedOut?.properties.name).toBe('Try a rewrite')
    )

    const store = result.current.nodeStore.store!
    // No clone exists until the first write (lazy COW).
    expect(Object.keys(store.getCheckedOutDraft()?.clones ?? {})).toEqual([])

    // Write through the overlay: forks the member, redirects to the clone.
    await act(async () => {
      await store.update(node.id, { properties: { title: 'draft-title' } })
    })
    await waitFor(() =>
      expect(store.getCheckedOutDraft()?.clones[node.id]).toBeTruthy()
    )

    // Overlay read shows the draft's content under the original id...
    const overlaid = await store.get(node.id)
    expect(overlaid?.properties.title).toBe('draft-title')
    expect(overlaid?.id).toBe(node.id)
    // ...while main's true state is untouched.
    const raw = await store.getRaw(node.id)
    expect(raw?.properties.title).toBe('main-title')

    // Return to main: reads hit the original again.
    act(() => result.current.d.returnToMain())
    await waitFor(() => expect(result.current.d.checkedOut).toBeNull())
    const back = await store.get(node.id)
    expect(back?.properties.title).toBe('main-title')
  })

  it('computes review cards without applying, then merges the squash onto main', async () => {
    const node = await seedNode('v1')
    const { result } = mountHook(node.id)
    await waitFor(() => expect(result.current.nodeStore.isReady).toBe(true))

    let draftId = ''
    await act(async () => {
      const draft = await result.current.d.createDraft('Polish copy')
      draftId = draft!.id
    })
    const store = result.current.nodeStore.store!
    await act(async () => {
      await store.update(node.id, { properties: { title: 'v2-draft' } })
    })
    await waitFor(() => expect(store.getCheckedOutDraft()?.clones[node.id]).toBeTruthy())

    // Review: one clean pending change, no conflicts, nothing applied.
    const review = await result.current.d.computeReview(draftId)
    expect(review?.cards).toEqual([
      {
        originalId: node.id,
        property: 'title',
        base: 'v1',
        main: 'v1',
        draft: 'v2-draft',
        conflict: false
      }
    ])
    expect((await store.getRaw(node.id))?.properties.title).toBe('v1')

    // Merge: main takes the draft's value; checkout returns to main.
    await act(async () => {
      const merged = await result.current.d.merge(draftId)
      expect(merged?.status).toBe('merged')
    })
    await waitFor(() => expect(result.current.d.checkedOut).toBeNull())
    expect((await store.getRaw(node.id))?.properties.title).toBe('v2-draft')
    // The merged draft leaves the open list.
    await waitFor(() => expect(result.current.d.drafts.length).toBe(0))
  })

  it('reports conflicts (merge applies nothing) and refresh pauses on them too', async () => {
    const node = await seedNode('v1')
    const { result } = mountHook(node.id)
    await waitFor(() => expect(result.current.nodeStore.isReady).toBe(true))

    let draftId = ''
    await act(async () => {
      const draft = await result.current.d.createDraft('Conflicting edit')
      draftId = draft!.id
    })
    const store = result.current.nodeStore.store!
    await act(async () => {
      await store.update(node.id, { properties: { title: 'draft-edit' } })
    })
    await waitFor(() => expect(store.getCheckedOutDraft()?.clones[node.id]).toBeTruthy())

    // Concurrent main-side edit to the SAME property (getRaw bypasses the
    // overlay for reads; write via a second store so it lands on main).
    const mainStore = new NodeStore({
      storage,
      authorDID: did,
      signingKey: identityResult.privateKey
    })
    await mainStore.initialize()
    await act(async () => {
      await mainStore.update(node.id, { properties: { title: 'main-edit' } })
    })

    const review = await result.current.d.computeReview(draftId)
    expect(review?.cards).toEqual([
      {
        originalId: node.id,
        property: 'title',
        base: 'v1',
        main: 'main-edit',
        draft: 'draft-edit',
        conflict: true
      }
    ])

    await act(async () => {
      const merged = await result.current.d.merge(draftId)
      expect(merged?.status).toBe('conflicts')
      if (merged?.status === 'conflicts') {
        expect(merged.conflicts[0].property).toBe('title')
      }
    })
    // Nothing applied; the draft stays open and checked out.
    expect((await store.getRaw(node.id))?.properties.title).toBe('main-edit')
    await waitFor(() => expect(result.current.d.checkedOut).not.toBeNull())

    await act(async () => {
      const refreshed = await result.current.d.refresh(draftId)
      expect(refreshed?.status).toBe('conflicts')
    })
  })

  it('refreshes clean main-side changes into the draft (floating drafts)', async () => {
    const node = await seedNode('v1', PageSchema.schema['@id'])
    const { result } = mountHook(node.id)
    await waitFor(() => expect(result.current.nodeStore.isReady).toBe(true))

    let draftId = ''
    await act(async () => {
      const draft = await result.current.d.createDraft('Float me')
      draftId = draft!.id
    })
    const store = result.current.nodeStore.store!
    await act(async () => {
      await store.update(node.id, { properties: { title: 'draft-title' } })
    })
    await waitFor(() => expect(store.getCheckedOutDraft()?.clones[node.id]).toBeTruthy())

    // Disjoint main-side edit (different property) — folds in cleanly.
    const mainStore = new NodeStore({
      storage,
      authorDID: did,
      signingKey: identityResult.privateKey
    })
    await mainStore.initialize()
    await act(async () => {
      await mainStore.update(node.id, { properties: { icon: 'sparkles' } })
    })

    await act(async () => {
      const refreshed = await result.current.d.refresh(draftId)
      expect(refreshed?.status).toBe('refreshed')
    })
    // The clone now carries main's icon AND the draft title.
    const overlaid = await store.get(node.id)
    expect(overlaid?.properties.icon).toBe('sparkles')
    expect(overlaid?.properties.title).toBe('draft-title')
  })

  it('discards a checked-out draft: returns to main, main untouched', async () => {
    const node = await seedNode('keep-me')
    const { result } = mountHook(node.id)
    await waitFor(() => expect(result.current.nodeStore.isReady).toBe(true))

    let draftId = ''
    await act(async () => {
      const draft = await result.current.d.createDraft('Abandon ship')
      draftId = draft!.id
    })
    const store = result.current.nodeStore.store!
    await act(async () => {
      await store.update(node.id, { properties: { title: 'scrapped' } })
    })
    await waitFor(() => expect(store.getCheckedOutDraft()?.clones[node.id]).toBeTruthy())
    const cloneId = store.getCheckedOutDraft()!.clones[node.id]

    await act(async () => {
      expect(await result.current.d.discard(draftId)).toBe(true)
    })
    await waitFor(() => expect(result.current.d.checkedOut).toBeNull())
    await waitFor(() => expect(result.current.d.drafts.length).toBe(0))
    expect(store.getCheckedOutDraft()).toBeNull()
    expect((await store.get(node.id))?.properties.title).toBe('keep-me')
    expect((await store.get(cloneId))?.deleted).toBe(true) // clone tombstoned
  })

  it('flags a draft for review (P4 request surfacing)', async () => {
    const node = await seedNode('review-me')
    const { result } = mountHook(node.id)
    await waitFor(() => expect(result.current.nodeStore.isReady).toBe(true))

    let draftId = ''
    await act(async () => {
      const draft = await result.current.d.createDraft('Needs eyes')
      draftId = draft!.id
    })
    await waitFor(() => expect(result.current.d.drafts.length).toBe(1))
    expect(result.current.d.drafts[0].properties.reviewRequested).toBeFalsy()

    await act(async () => {
      await result.current.d.setReviewRequested(draftId, true)
    })
    await waitFor(() =>
      expect(result.current.d.drafts[0]?.properties.reviewRequested).toBe(true)
    )
  })
})
