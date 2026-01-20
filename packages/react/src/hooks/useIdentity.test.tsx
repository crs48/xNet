import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { XNetProvider, type XNetConfig } from '../context'
import { useIdentity } from './useIdentity'
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

describe('useIdentity', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = createMockStorage()
  })

  it('should return null identity when not authenticated', () => {
    const { result } = renderHook(
      () => useIdentity(),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    expect(result.current.identity).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.did).toBeNull()
  })

  it('should return identity when provided', () => {
    const mockIdentity: Identity = {
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      publicKey: new Uint8Array(32),
      created: Date.now()
    }

    const { result } = renderHook(
      () => useIdentity(),
      { wrapper: createWrapper({ storage: mockStorage, identity: mockIdentity }) }
    )

    expect(result.current.identity).toBe(mockIdentity)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.did).toBe(mockIdentity.did)
  })
})
