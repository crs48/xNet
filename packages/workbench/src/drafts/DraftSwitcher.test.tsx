/**
 * DraftSwitcher (exploration 0329 P2): smoke over a real memory store —
 * starts on Main, creates a named draft (auto-checkout → tinted chip),
 * lists it in the menu, returns to main, and discards with confirm.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter, NodeStore, PageSchema } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import React, { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftSwitcher } from './DraftSwitcher'

describe('DraftSwitcher', () => {
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
      properties: { title: 'Main title' }
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
    return { node, store, Wrapper }
  }

  it('creates a draft from the menu and shows the persistent draft chip', async () => {
    const { node, Wrapper } = await seed()
    render(
      <Wrapper>
        <DraftSwitcher nodeId={node.id} />
      </Wrapper>
    )

    // Starts on Main.
    await waitFor(() => expect(screen.getByText('Main')).toBeTruthy())

    // New draft… → name it → Create.
    fireEvent.click(screen.getByText('Main'))
    fireEvent.click(screen.getByRole('menuitem', { name: /New draft…/ }))
    fireEvent.change(screen.getByLabelText('Draft name'), {
      target: { value: 'Snappier intro' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    // Auto-checkout: the tinted chip names the draft — never mistakable for main.
    await waitFor(() => expect(screen.getByText('Draft: Snappier intro')).toBeTruthy())
  })

  it('returns to main and discards a draft (confirmed)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { node, store, Wrapper } = await seed()
    render(
      <Wrapper>
        <DraftSwitcher nodeId={node.id} />
      </Wrapper>
    )
    await waitFor(() => expect(screen.getByText('Main')).toBeTruthy())

    fireEvent.click(screen.getByText('Main'))
    fireEvent.click(screen.getByRole('menuitem', { name: /New draft…/ }))
    fireEvent.change(screen.getByLabelText('Draft name'), { target: { value: 'Scrap me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByText('Draft: Scrap me')).toBeTruthy())

    // Return to main from the menu.
    fireEvent.click(screen.getByText('Draft: Scrap me'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Main' }))
    await waitFor(() => expect(screen.getByText('Main')).toBeTruthy())
    expect(store.getCheckedOutDraft()).toBeNull()

    // Discard it (the draft is still listed while open).
    fireEvent.click(screen.getByText('Main'))
    await waitFor(() => expect(screen.getByText('Scrap me')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Discard draft Scrap me'))
    expect(confirmSpy).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Scrap me')).toBeNull())
  })
})
