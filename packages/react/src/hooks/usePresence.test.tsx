import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { XNetProvider, type XNetConfig } from '../context'
import { usePresence } from './usePresence'
import type { StorageAdapter, DocumentData } from '@xnet/storage'
import type { Identity } from '@xnet/identity'

// Mock storage adapter
function createMockStorage(): StorageAdapter {
  const documents = new Map<string, DocumentData>()

  return {
    async open() {},
    async close() {},
    async clear() {},
    async getDocument(id: string) {
      return documents.get(id) ?? null
    },
    async setDocument(id: string, data: DocumentData) {
      documents.set(id, data)
    },
    async deleteDocument(id: string) {
      documents.delete(id)
    },
    async listDocuments() {
      return Array.from(documents.keys())
    },
    async appendUpdate() {},
    async getUpdates() {
      return []
    },
    async getUpdateCount() {
      return 0
    },
    async getSnapshot() {
      return null
    },
    async setSnapshot() {},
    async getBlob() {
      return null
    },
    async setBlob() {},
    async hasBlob() {
      return false
    }
  }
}

function createWrapper(config: XNetConfig) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(XNetProvider, { config, children })
  }
}

describe('usePresence', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = createMockStorage()
  })

  it('should return null local presence without identity', () => {
    const { result } = renderHook(
      () => usePresence('doc-1'),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    expect(result.current.localPresence).toBeNull()
    expect(result.current.remotePresences).toEqual([])
  })

  it('should set local presence with identity', () => {
    const mockIdentity: Identity = {
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      publicKey: new Uint8Array(32),
      created: Date.now()
    }

    const { result } = renderHook(
      () => usePresence('doc-1'),
      { wrapper: createWrapper({ storage: mockStorage, identity: mockIdentity }) }
    )

    expect(result.current.localPresence).not.toBeNull()
    expect(result.current.localPresence?.did).toBe(mockIdentity.did)
    expect(result.current.localPresence?.name).toBe('User')
    expect(result.current.localPresence?.color).toMatch(/^hsl\(\d+, 70%, 50%\)$/)
  })

  it('should update presence with setPresence', () => {
    const mockIdentity: Identity = {
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      publicKey: new Uint8Array(32),
      created: Date.now()
    }

    const { result } = renderHook(
      () => usePresence('doc-1'),
      { wrapper: createWrapper({ storage: mockStorage, identity: mockIdentity }) }
    )

    act(() => {
      result.current.setPresence({ name: 'Test User', cursor: { x: 100, y: 200 } })
    })

    expect(result.current.localPresence?.name).toBe('Test User')
    expect(result.current.localPresence?.cursor).toEqual({ x: 100, y: 200 })
  })

  it('should generate consistent colors for same DID', () => {
    const mockIdentity: Identity = {
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      publicKey: new Uint8Array(32),
      created: Date.now()
    }

    const { result: result1 } = renderHook(
      () => usePresence('doc-1'),
      { wrapper: createWrapper({ storage: mockStorage, identity: mockIdentity }) }
    )

    const { result: result2 } = renderHook(
      () => usePresence('doc-2'),
      { wrapper: createWrapper({ storage: mockStorage, identity: mockIdentity }) }
    )

    expect(result1.current.localPresence?.color).toBe(result2.current.localPresence?.color)
  })
})
