/**
 * Tests for ShareDialog's failure-mode UX (exploration 0290): the no-hub
 * dead-end becomes a "Connect a hub…" CTA that opens the status bar's
 * connection panel, and private-hub links are labelled "Local only" with a
 * confirm step before Copy/QR.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import React, { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OPEN_SYNC_STATUS_EVENT } from '../workbench/SyncStatus'
import { ShareDialog } from './ShareDialog'

function Wrapper({ children, hubUrl }: { children: ReactNode; hubUrl?: string }) {
  const { identity, privateKey } = generateIdentity()
  return (
    <XNetProvider
      config={{
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: identity.did as never,
        signingKey: privateKey,
        disableSyncManager: true,
        ...(hubUrl ? { hubUrl, hubOptions: { authToken: 'test-token', autoAuth: false } } : {})
      }}
    >
      {children}
    </XNetProvider>
  )
}

const LINK = {
  linkId: 'lnk_local1',
  docId: 'doc-1',
  docType: 'page',
  role: 'read',
  label: 'LAN handoff',
  expiresAt: 0,
  maxUses: 0,
  useCount: 0,
  disabled: false,
  createdBy: 'did:key:zCreator',
  createdAt: 1_700_000_000_000
}

/** Hub stub serving one existing link and empty grants. */
function stubHub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('/shares/links')
        ? { links: [LINK] }
        : url.includes('/shares/grants')
          ? { grants: [] }
          : {}
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ShareDialog with no hub connected', () => {
  it('offers a "Connect a hub…" CTA that closes the dialog and opens the sync panel', () => {
    const onClose = vi.fn()
    const onPanelOpen = vi.fn()
    window.addEventListener(OPEN_SYNC_STATUS_EVENT, onPanelOpen)
    try {
      render(
        <Wrapper>
          <ShareDialog docId="doc-1" docType="page" isOpen onClose={onClose} />
        </Wrapper>
      )

      expect(screen.getByText(/no hub connected/i)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /connect a hub/i }))
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onPanelOpen).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(OPEN_SYNC_STATUS_EVENT, onPanelOpen)
    }
  })
})

describe('ShareDialog on a private hub', () => {
  const renderPrivate = async () => {
    stubHub()
    // The link URL (with secret) is only known from the creating device's cache.
    localStorage.setItem(`xnet:share-link-url:${LINK.linkId}`, 'http://localhost:4444/s/x#s=y')
    render(
      <Wrapper hubUrl="ws://localhost:4444">
        <ShareDialog docId="doc-1" docType="page" isOpen onClose={vi.fn()} />
      </Wrapper>
    )
    await waitFor(() => expect(screen.getByText('LAN handoff')).toBeTruthy())
  }

  it('labels link URLs "Local only"', async () => {
    await renderPrivate()
    expect(screen.getByText('Local only')).toBeTruthy()
  })

  it('requires a confirm click before copying', async () => {
    await renderPrivate()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const copy = screen.getByRole('button', { name: /copy/i })
    fireEvent.click(copy)
    // First click arms the button instead of copying.
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByText('Copy anyway')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /copy anyway/i }))
    expect(writeText).toHaveBeenCalledWith('http://localhost:4444/s/x#s=y')
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
  })
})

describe('ShareDialog on a public hub', () => {
  it('copies without a confirm step and shows no "Local only" label', async () => {
    stubHub()
    localStorage.setItem(`xnet:share-link-url:${LINK.linkId}`, 'https://hub.example/s/x#s=y')
    render(
      <Wrapper hubUrl="wss://hub.example">
        <ShareDialog docId="doc-1" docType="page" isOpen onClose={vi.fn()} />
      </Wrapper>
    )
    await waitFor(() => expect(screen.getByText('LAN handoff')).toBeTruthy())
    expect(screen.queryByText('Local only')).toBeNull()

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('https://hub.example/s/x#s=y')
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
  })
})
