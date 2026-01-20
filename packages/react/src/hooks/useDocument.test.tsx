import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { XNetProvider, type XNetConfig } from '../context'
import { useDocument } from './useDocument'
import type { StorageAdapter, DocumentData } from '@xnet/storage'

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

describe('useDocument', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = createMockStorage()
  })

  it('should return loading state for document', () => {
    const { result } = renderHook(
      () => useDocument('doc-1'),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    // Initially either loading or not
    expect(typeof result.current.loading).toBe('boolean')
  })

  it('should return null data for null docId', () => {
    const { result } = renderHook(
      () => useDocument(null),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('should not autoload when autoLoad is false', () => {
    const { result } = renderHook(
      () => useDocument('doc-1', { autoLoad: false }),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('should provide update function', () => {
    const { result } = renderHook(
      () => useDocument('doc-1', { autoLoad: false }),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    expect(typeof result.current.update).toBe('function')
  })

  it('should provide refresh function', () => {
    const { result } = renderHook(
      () => useDocument('doc-1', { autoLoad: false }),
      { wrapper: createWrapper({ storage: mockStorage }) }
    )

    expect(typeof result.current.refresh).toBe('function')
  })
})
