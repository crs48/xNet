import type { Identity } from '@xnet/identity'
import { renderHook } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { XNetProvider, type XNetConfig } from '../context'
import { useIdentity } from './useIdentity'

function createWrapper(config: XNetConfig) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(XNetProvider, { config, children })
  }
}

describe('useIdentity', () => {
  it('should return null identity when not authenticated', () => {
    const { result } = renderHook(() => useIdentity(), { wrapper: createWrapper({}) })

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

    const { result } = renderHook(() => useIdentity(), {
      wrapper: createWrapper({ identity: mockIdentity })
    })

    expect(result.current.identity).toBe(mockIdentity)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.did).toBe(mockIdentity.did)
  })
})
