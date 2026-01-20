import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { XNetProvider, type XNetConfig } from '../context'
import { useSync } from './useSync'
import type { StorageAdapter, DocumentData } from '@xnet/storage'
import type { NetworkNode } from '@xnet/network'

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

describe('useSync', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = createMockStorage()
  })

  it('should return offline status when no network', () => {
    const { result } = renderHook(
      () => useSync(),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    expect(result.current.status).toBe('offline')
    expect(result.current.peers).toEqual([])
    expect(result.current.peerCount).toBe(0)
  })

  it('should return connecting status when network is present', () => {
    const mockNetwork = {
      libp2p: {} as any,
      peerId: {} as any,
      did: 'did:key:z6Mk...'
    } as NetworkNode

    const { result } = renderHook(
      () => useSync(),
      { wrapper: createWrapper({ storage: mockStorage, network: mockNetwork }) }
    )

    expect(result.current.status).toBe('connecting')
  })
})
