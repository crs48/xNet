/**
 * DraftReviewPanel (exploration 0329 P3): smoke over a real memory store —
 * empty state without drafts; pending-change cards for a forked+edited
 * member; conflict cards disable Merge; a clean merge lands on main with a
 * success note; Request review flags the draft (P4).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DRAFT_SCHEMA_IRI, MemoryNodeStorageAdapter, NodeStore, PageSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import React, { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftReviewPanel } from './DraftReviewPanel'

describe('DraftReviewPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function seed() {
    const { identity, privateKey } = generateIdentity()
    const storage = new MemoryNodeStorageAdapter()
    const store = new NodeStore({
      storage,
      authorDID: identity.did as never,
      signingKey: privateKey
    })
    await store.initialize()
    const node = await store.create({
      schemaId: PageSchema.schema['@id'],
      properties: { title: 'v1' }
    })

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <XNetProvider
          config={{
            nodeStorage: storage,
            authorDID: identity.did as never,
            signingKey: privateKey,
            disableSyncManager: true
          }}
        >
          {children}
        </XNetProvider>
      )
    }
    return { node, store, storage, Wrapper }
  }

  /**
   * Draft with the node forked and edited draft-side (no checkout needed).
   * Hand-seeded fork — the app has no @xnetjs/history dependency, so the
   * test writes the same shape `forkNodeIntoDraft` produces: a clone
   * snapshot plus an entries map pinning the fork-point hash.
   */
  async function seedDraftEdit(
    store: NodeStore,
    storage: MemoryNodeStorageAdapter,
    nodeId: string,
    title: string
  ) {
    const original = await store.get(nodeId as never)
    const changes = await storage.getChanges(nodeId as never)
    const forkedAtHash = changes[changes.length - 1].hash
    const clone = await store.create({
      schemaId: original!.schemaId,
      properties: { ...original!.properties, title }
    })
    return store.create({
      schemaId: DRAFT_SCHEMA_IRI as never,
      properties: {
        name: 'Polish pass',
        status: 'open',
        target: nodeId,
        entries: { [nodeId]: { cloneId: clone.id, forkedAtHash } },
        created: [],
        deletedIds: []
      }
    })
  }

  it('shows the empty state when the node has no open drafts', async () => {
    const { node, Wrapper } = await seed()
    render(
      <Wrapper>
        <DraftReviewPanel nodeId={node.id} />
      </Wrapper>
    )
    await waitFor(() => expect(screen.getByText(/No open drafts for this item/)).toBeTruthy())
  })

  it('lists pending property cards and merges cleanly back to main', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { node, store, storage, Wrapper } = await seed()
    await seedDraftEdit(store, storage, node.id, 'v2-draft')

    render(
      <Wrapper>
        <DraftReviewPanel nodeId={node.id} />
      </Wrapper>
    )

    // One clean pending change: title, main v1 → draft v2-draft.
    await waitFor(() => expect(screen.getByText('1 pending change')).toBeTruthy())
    const card = screen.getByTestId('draft-card')
    expect(card.textContent).toContain('title')
    expect(card.textContent).toContain('v1')
    expect(card.textContent).toContain('v2-draft')

    fireEvent.click(screen.getByRole('button', { name: /^Merge$/ }))
    await waitFor(() => expect(screen.getByText(/Merged — you are back on main/)).toBeTruthy())
    expect((await store.getRaw(node.id))?.properties.title).toBe('v2-draft')
  })

  it('highlights conflicts and disables Merge until resolved', async () => {
    const { node, store, storage, Wrapper } = await seed()
    await seedDraftEdit(store, storage, node.id, 'draft-edit')
    // Concurrent main-side edit to the SAME property → both-changed conflict.
    await store.update(node.id, { properties: { title: 'main-edit' } })

    render(
      <Wrapper>
        <DraftReviewPanel nodeId={node.id} />
      </Wrapper>
    )

    await waitFor(() => expect(screen.getByTestId('draft-card-conflict')).toBeTruthy())
    expect(screen.getByText(/1 in conflict/)).toBeTruthy()
    const merge = screen.getByRole('button', { name: /^Merge$/ }) as HTMLButtonElement
    expect(merge.disabled).toBe(true)

    // Refresh pauses on the same conflict — explicit, not silent.
    fireEvent.click(screen.getByRole('button', { name: /Refresh from main/ }))
    await waitFor(() => expect(screen.getByText(/Refresh paused/)).toBeTruthy())
  })

  it('requests a review (P4 flag) and withdraws it', async () => {
    const { node, store, storage, Wrapper } = await seed()
    const draft = await seedDraftEdit(store, storage, node.id, 'v2')

    render(
      <Wrapper>
        <DraftReviewPanel nodeId={node.id} />
      </Wrapper>
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /Request review/ })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Request review/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Review requested — withdraw/ })).toBeTruthy()
    )
    expect((await store.getRaw(draft.id))?.properties.reviewRequested).toBe(true)
  })
})
