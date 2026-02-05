import { renderHook, waitFor } from '@testing-library/react'
import { PageSchema, MemoryNodeStorageAdapter, NodeStore, type DID } from '@xnet/data'
import React, { type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { XNetProvider } from '../context'
import { useNode } from './useNode'

// Mock y-webrtc to avoid WebRTC in tests
vi.mock('y-webrtc', () => ({
  WebrtcProvider: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn()
  }))
}))

// Test DID and signing key
const TEST_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
const TEST_SIGNING_KEY = new Uint8Array(32).fill(1)

interface WrapperConfig {
  storage: MemoryNodeStorageAdapter
  authorDID: DID
  signingKey: Uint8Array
}

function createWrapper(config: WrapperConfig) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(XNetProvider, {
      config: {
        nodeStorage: config.storage,
        authorDID: config.authorDID,
        signingKey: config.signingKey
      },
      children
    })
  }
}

describe('useNode', () => {
  let storage: MemoryNodeStorageAdapter
  let store: NodeStore

  beforeEach(async () => {
    storage = new MemoryNodeStorageAdapter()
    store = new NodeStore({
      storage,
      authorDID: TEST_DID,
      signingKey: TEST_SIGNING_KEY
    })
    await store.initialize()
  })

  it('should return loading state initially', () => {
    const { result } = renderHook(() => useNode(PageSchema, 'test-id'), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    expect(typeof result.current.loading).toBe('boolean')
  })

  it('should return null data for null id', async () => {
    const { result } = renderHook(() => useNode(PageSchema, null), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.doc).toBeNull()
  })

  it('should load node data when id is provided', async () => {
    // Create a node first
    const page = await store.create({
      schemaId: PageSchema._schemaId,
      properties: { title: 'Test Page' }
    })

    const { result } = renderHook(() => useNode(PageSchema, page.id), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    // Wait for both loading to complete and data to be available
    await waitFor(
      () => {
        expect(result.current.loading).toBe(false)
        expect(result.current.data).not.toBeNull()
      },
      { timeout: 2000 }
    )

    expect(result.current.data?.title).toBe('Test Page')
  })

  it('should create Y.Doc for schemas with document type', async () => {
    // PageSchema has document: 'yjs'
    const page = await store.create({
      schemaId: PageSchema._schemaId,
      properties: { title: 'Test Page' }
    })

    const { result } = renderHook(() => useNode(PageSchema, page.id), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false)
        expect(result.current.doc).not.toBeNull()
      },
      { timeout: 2000 }
    )

    // Y.Doc should have a guid matching the node id
    expect(result.current.doc?.guid).toBe(page.id)
  })

  it('should provide save function', async () => {
    const page = await store.create({
      schemaId: PageSchema._schemaId,
      properties: { title: 'Test Page' }
    })

    const { result } = renderHook(() => useNode(PageSchema, page.id), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(typeof result.current.save).toBe('function')
  })

  it('should provide reload function', async () => {
    const page = await store.create({
      schemaId: PageSchema._schemaId,
      properties: { title: 'Test Page' }
    })

    const { result } = renderHook(() => useNode(PageSchema, page.id), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(typeof result.current.reload).toBe('function')
  })

  it('should track dirty state', async () => {
    const page = await store.create({
      schemaId: PageSchema._schemaId,
      properties: { title: 'Test Page' }
    })

    const { result } = renderHook(() => useNode(PageSchema, page.id), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Initially not dirty
    expect(result.current.isDirty).toBe(false)
  })

  it('should track sync status', async () => {
    const page = await store.create({
      schemaId: PageSchema._schemaId,
      properties: { title: 'Test Page' }
    })

    const { result } = renderHook(() => useNode(PageSchema, page.id, { disableSync: true }), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // With sync disabled, should be offline
    expect(result.current.syncStatus).toBe('offline')
  })

  it('should return null for non-existent node', async () => {
    const { result } = renderHook(() => useNode(PageSchema, 'non-existent-id'), {
      wrapper: createWrapper({
        storage,
        authorDID: TEST_DID,
        signingKey: TEST_SIGNING_KEY
      })
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.doc).toBeNull()
  })
})
