import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { XNetProvider, useXNet, type XNetConfig } from './context'
import { MemoryNodeStorageAdapter } from '@xnet/data'
import type { Identity } from '@xnet/identity'
import type { DID } from '@xnet/core'

const TEST_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
const TEST_KEY = new Uint8Array(32).fill(1)

function createWrapper(config: XNetConfig) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(XNetProvider, { config, children })
  }
}

describe('XNetContext', () => {
  it('should throw error when useXNet is used outside provider', () => {
    expect(() => {
      renderHook(() => useXNet())
    }).toThrow('useXNet must be used within an XNetProvider')
  })

  it('should provide context value when inside provider', async () => {
    const { result } = renderHook(() => useXNet(), {
      wrapper: createWrapper({
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: TEST_DID,
        signingKey: TEST_KEY
      })
    })

    // Initially not ready
    expect(result.current.nodeStore).toBeNull()

    // Wait for NodeStore to initialize
    await waitFor(() => {
      expect(result.current.nodeStoreReady).toBe(true)
    })

    expect(result.current.nodeStore).not.toBeNull()
    expect(result.current.identity).toBeUndefined()
  })

  it('should provide identity when configured', async () => {
    const mockIdentity: Identity = {
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      publicKey: new Uint8Array(32),
      created: Date.now()
    }

    const { result } = renderHook(() => useXNet(), {
      wrapper: createWrapper({
        nodeStorage: new MemoryNodeStorageAdapter(),
        authorDID: TEST_DID,
        signingKey: TEST_KEY,
        identity: mockIdentity
      })
    })

    expect(result.current.identity).toBe(mockIdentity)
  })
})
