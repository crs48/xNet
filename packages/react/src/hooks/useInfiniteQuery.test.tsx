/**
 * useInfiniteQuery — growing-window pagination (exploration 0340).
 *
 * The hook models infinite scroll as a single growing `limit + orderBy`
 * window (no cursor) so the whole window stays on the bridge's bounded-delta
 * live path. These tests exercise the window lifecycle end-to-end:
 * grow, `maxLoaded` ceiling, `hasMore` derivation, no-op fetches, reset,
 * and short-page completion.
 */
import { renderHook, waitFor, act } from '@testing-library/react'
import { PageSchema, MemoryNodeStorageAdapter, NodeStore, type DID } from '@xnetjs/data'
import React, { type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { XNetProvider } from '../context'
import { useInfiniteQuery } from './useInfiniteQuery'

// Mock y-webrtc to avoid WebRTC in tests
vi.mock('y-webrtc', () => ({
  WebrtcProvider: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn()
  }))
}))

const TEST_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
const TEST_SIGNING_KEY = new Uint8Array(32).fill(1)

function createWrapper(storage: MemoryNodeStorageAdapter) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(XNetProvider, {
      config: { nodeStorage: storage, authorDID: TEST_DID as DID, signingKey: TEST_SIGNING_KEY },
      children
    })
  }
}

async function seedPages(storage: MemoryNodeStorageAdapter, count: number): Promise<void> {
  const store = new NodeStore({
    storage,
    authorDID: TEST_DID as DID,
    signingKey: TEST_SIGNING_KEY
  })
  await store.initialize()
  for (let i = 0; i < count; i++) {
    await store.create({ schemaId: PageSchema._schemaId, properties: { title: `Page ${i}` } })
  }
}

describe('useInfiniteQuery pagination', () => {
  it('grows the window, reports hasMore, honors maxLoaded, resets', async () => {
    const storage = new MemoryNodeStorageAdapter()
    await seedPages(storage, 120)

    const { result } = renderHook(
      () => useInfiniteQuery(PageSchema, { pageSize: 50, maxLoaded: 110 }),
      { wrapper: createWrapper(storage) }
    )

    await waitFor(() => expect(result.current.status).toBe('success'), { timeout: 10000 })
    expect(result.current.data.length).toBe(50)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.pages.length).toBe(1)

    await act(() => result.current.fetchNextPage())
    await waitFor(() => expect(result.current.data.length).toBe(100), { timeout: 10000 })
    expect(result.current.hasMore).toBe(true)
    expect(result.current.pages.length).toBe(2)

    // maxLoaded caps the window at 110 even though 120 rows exist
    await act(() => result.current.fetchNextPage())
    await waitFor(() => expect(result.current.data.length).toBe(110), { timeout: 10000 })
    expect(result.current.hasMore).toBe(false)

    // further fetches are no-ops
    await act(() => result.current.fetchNextPage())
    expect(result.current.data.length).toBe(110)

    act(() => result.current.reset())
    await waitFor(() => expect(result.current.data.length).toBe(50), { timeout: 10000 })
  })

  it('completes when data runs out before maxLoaded', async () => {
    const storage = new MemoryNodeStorageAdapter()
    await seedPages(storage, 30)

    const { result } = renderHook(() => useInfiniteQuery(PageSchema, { pageSize: 25 }), {
      wrapper: createWrapper(storage)
    })

    await waitFor(() => expect(result.current.status).toBe('success'), { timeout: 10000 })
    expect(result.current.data.length).toBe(25)
    expect(result.current.hasMore).toBe(true)

    await act(() => result.current.fetchNextPage())
    await waitFor(() => expect(result.current.data.length).toBe(30), { timeout: 10000 })
    // window returned fewer than requested -> complete
    expect(result.current.hasMore).toBe(false)
  })
})
