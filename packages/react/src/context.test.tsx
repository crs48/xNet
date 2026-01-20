import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { XNetProvider, useXNet, type XNetConfig } from './context'
import type { StorageAdapter, DocumentData } from '@xnet/storage'
import type { NetworkNode } from '@xnet/network'
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

describe('XNetContext', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = createMockStorage()
  })

  it('should throw error when useXNet is used outside provider', () => {
    expect(() => {
      renderHook(() => useXNet())
    }).toThrow('useXNet must be used within an XNetProvider')
  })

  it('should provide context value when inside provider', () => {
    const { result } = renderHook(
      () => useXNet(),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    expect(result.current.storage).toBe(mockStorage)
    expect(result.current.store).toBeDefined()
    expect(result.current.network).toBeUndefined()
    expect(result.current.identity).toBeUndefined()
  })

  it('should provide optional dependencies when provided', () => {
    const mockNetwork: NetworkNode = {
      libp2p: {} as any,
      peerId: {} as any,
      did: 'did:key:z6Mk...'
    }

    const mockIdentity: Identity = {
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      publicKey: new Uint8Array(32),
      created: Date.now()
    }

    const { result } = renderHook(
      () => useXNet(),
      {
        wrapper: createWrapper({
          storage: mockStorage,
          network: mockNetwork,
          identity: mockIdentity
        })
      }
    )

    expect(result.current.network).toBe(mockNetwork)
    expect(result.current.identity).toBe(mockIdentity)
  })
})
