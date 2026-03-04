/**
 * Tests for useSecurity hook
 */

import { renderHook, act } from '@testing-library/react'
import { createKeyBundle, MemoryPQKeyRegistry, type HybridKeyBundle } from '@xnetjs/identity'
import React, { type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { SecurityProvider, type SecurityProviderProps } from '../context/security-context'
import { useSecurity } from './useSecurity'

// Create a wrapper with SecurityProvider
function createWrapper(props: Omit<SecurityProviderProps, 'children'> = {}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(SecurityProvider, { ...props, children })
  }
}

// Create a test key bundle with Ed25519 keys only (Level 0)
function createLevel0Bundle(): HybridKeyBundle {
  return createKeyBundle({ includePQ: false })
}

// Create a test key bundle with PQ keys (Level 0-2)
function createLevel2Bundle(): HybridKeyBundle {
  return createKeyBundle({ includePQ: true })
}

describe('useSecurity', () => {
  describe('basic functionality', () => {
    it('provides security level from context', () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle, level: 0 })
      })

      expect(result.current.level).toBe(0)
    })

    it('allows level override via options', () => {
      const bundle = createLevel2Bundle()
      const { result } = renderHook(() => useSecurity({ level: 2 }), {
        wrapper: createWrapper({ keyBundle: bundle, level: 0 })
      })

      // Should use override level, not context level
      expect(result.current.level).toBe(2)
    })

    it('changes level via setLevel', () => {
      const bundle = createLevel2Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle, level: 0 })
      })

      expect(result.current.level).toBe(0)

      act(() => {
        result.current.setLevel(1)
      })

      expect(result.current.level).toBe(1)
    })
  })

  describe('key bundle detection', () => {
    it('reports hasKeyBundle when bundle is provided', () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle })
      })

      expect(result.current.hasKeyBundle).toBe(true)
    })

    it('reports !hasKeyBundle when no bundle', () => {
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({})
      })

      expect(result.current.hasKeyBundle).toBe(false)
    })

    it('detects PQ keys when present', () => {
      const bundle = createLevel2Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle })
      })

      expect(result.current.hasPQKeys).toBe(true)
      expect(result.current.maxLevel).toBe(2)
    })

    it('reports no PQ keys when absent', () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle })
      })

      expect(result.current.hasPQKeys).toBe(false)
      expect(result.current.maxLevel).toBe(0)
    })
  })

  describe('canSignAt', () => {
    it('returns true for Level 0 with any bundle', () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle })
      })

      expect(result.current.canSignAt(0)).toBe(true)
    })

    it('returns false for Level 1/2 without PQ keys', () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle })
      })

      expect(result.current.canSignAt(1)).toBe(false)
      expect(result.current.canSignAt(2)).toBe(false)
    })

    it('returns true for all levels with PQ keys', () => {
      const bundle = createLevel2Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle })
      })

      expect(result.current.canSignAt(0)).toBe(true)
      expect(result.current.canSignAt(1)).toBe(true)
      expect(result.current.canSignAt(2)).toBe(true)
    })

    it('returns false for any level without bundle', () => {
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({})
      })

      expect(result.current.canSignAt(0)).toBe(false)
      expect(result.current.canSignAt(1)).toBe(false)
      expect(result.current.canSignAt(2)).toBe(false)
    })
  })

  describe('signing', () => {
    it('signs data at Level 0', () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle, level: 0 })
      })

      const data = new TextEncoder().encode('Hello, World!')
      const signature = result.current.sign(data)

      expect(signature.level).toBe(0)
      expect(signature.ed25519).toBeDefined()
      expect(signature.ed25519!.length).toBe(64)
      expect(signature.mlDsa).toBeUndefined()
    })

    it('signs data at Level 1 (hybrid)', () => {
      const bundle = createLevel2Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle, level: 1 })
      })

      const data = new TextEncoder().encode('Hello, World!')
      const signature = result.current.sign(data)

      expect(signature.level).toBe(1)
      expect(signature.ed25519).toBeDefined()
      expect(signature.mlDsa).toBeDefined()
    })

    it('signs data at Level 2 (PQ only)', () => {
      const bundle = createLevel2Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle, level: 2 })
      })

      const data = new TextEncoder().encode('Hello, World!')
      const signature = result.current.sign(data)

      expect(signature.level).toBe(2)
      expect(signature.ed25519).toBeUndefined()
      expect(signature.mlDsa).toBeDefined()
    })

    it('throws when no key bundle available', () => {
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({})
      })

      const data = new TextEncoder().encode('Hello, World!')
      expect(() => result.current.sign(data)).toThrow('No key bundle available')
    })

    it('throws when trying to sign at Level 1 without PQ keys', () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity({ level: 1 }), {
        wrapper: createWrapper({ keyBundle: bundle })
      })

      const data = new TextEncoder().encode('Hello, World!')
      expect(() => result.current.sign(data)).toThrow('Cannot sign at Level 1')
    })

    it('throws when trying to sign at Level 2 without PQ keys', () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity({ level: 2 }), {
        wrapper: createWrapper({ keyBundle: bundle })
      })

      const data = new TextEncoder().encode('Hello, World!')
      expect(() => result.current.sign(data)).toThrow('Cannot sign at Level 2')
    })
  })

  describe('verification', () => {
    it('verifies Level 0 signature', async () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle, level: 0 })
      })

      const data = new TextEncoder().encode('Hello, World!')
      const signature = result.current.sign(data)
      const did = bundle.identity.did

      const verifyResult = await result.current.verify(data, signature, did)

      expect(verifyResult.valid).toBe(true)
      expect(verifyResult.level).toBe(0)
    })

    it('verifies Level 1 signature', async () => {
      const bundle = createLevel2Bundle()
      // Create a registry with the PQ key pre-registered
      const registry = new MemoryPQKeyRegistry()
      // We need to mock the lookup since we don't have a full attestation
      const mockRegistry = {
        ...registry,
        async lookup(did: string) {
          if (did === bundle.identity.did) {
            return bundle.pqPublicKey ?? null
          }
          return null
        }
      }

      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({
          keyBundle: bundle,
          level: 1,
          registry: mockRegistry as typeof registry
        })
      })

      const data = new TextEncoder().encode('Hello, World!')
      const signature = result.current.sign(data)
      const did = bundle.identity.did

      const verifyResult = await result.current.verify(data, signature, did)

      expect(verifyResult.valid).toBe(true)
      expect(verifyResult.level).toBe(1)
    })

    it('rejects tampered data', async () => {
      const bundle = createLevel0Bundle()
      const { result } = renderHook(() => useSecurity(), {
        wrapper: createWrapper({ keyBundle: bundle, level: 0 })
      })

      const data = new TextEncoder().encode('Hello, World!')
      const signature = result.current.sign(data)
      const tamperedData = new TextEncoder().encode('Goodbye, World!')
      const did = bundle.identity.did

      const verifyResult = await result.current.verify(tamperedData, signature, did)

      expect(verifyResult.valid).toBe(false)
    })
  })

  describe('context requirement', () => {
    it('throws when used outside SecurityProvider', () => {
      // Suppress console.error for expected error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useSecurity())
      }).toThrow('useSecurityContext must be used within SecurityProvider')

      consoleSpy.mockRestore()
    })
  })
})
