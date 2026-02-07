/**
 * Tests for VerificationCache.
 */

import type { UnifiedSignature, VerificationResult } from '../unified-signature'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  VerificationCache,
  getVerificationCache,
  setVerificationCache,
  clearVerificationCache
} from './verification-cache'

describe('VerificationCache', () => {
  let cache: VerificationCache

  beforeEach(() => {
    cache = new VerificationCache({ maxSize: 100 })
  })

  describe('basic operations', () => {
    it('caches verification results', () => {
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = {
        level: 1,
        ed25519: new Uint8Array(64),
        mlDsa: new Uint8Array(3293)
      }
      const pubHash = new Uint8Array(32).fill(2)
      const result: VerificationResult = { valid: true, level: 1, details: {} }

      cache.set(msgHash, sig, pubHash, result)
      const cached = cache.get(msgHash, sig, pubHash)

      expect(cached).toEqual(result)
    })

    it('returns null for cache miss', () => {
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)

      const cached = cache.get(msgHash, sig, pubHash)
      expect(cached).toBeNull()
    })

    it('differentiates by message hash', () => {
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)

      const msgHash1 = new Uint8Array(32).fill(1)
      const msgHash2 = new Uint8Array(32).fill(2)

      const result1: VerificationResult = { valid: true, level: 0, details: {} }
      const result2: VerificationResult = { valid: false, level: 0, details: {} }

      cache.set(msgHash1, sig, pubHash, result1)
      cache.set(msgHash2, sig, pubHash, result2)

      expect(cache.get(msgHash1, sig, pubHash)).toEqual(result1)
      expect(cache.get(msgHash2, sig, pubHash)).toEqual(result2)
    })

    it('differentiates by security level', () => {
      const msgHash = new Uint8Array(32).fill(1)
      const pubHash = new Uint8Array(32).fill(2)

      const sig0: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const sig1: UnifiedSignature = {
        level: 1,
        ed25519: new Uint8Array(64),
        mlDsa: new Uint8Array(3293)
      }

      const result0: VerificationResult = { valid: true, level: 0, details: {} }
      const result1: VerificationResult = { valid: true, level: 1, details: {} }

      cache.set(msgHash, sig0, pubHash, result0)
      cache.set(msgHash, sig1, pubHash, result1)

      expect(cache.get(msgHash, sig0, pubHash)?.level).toBe(0)
      expect(cache.get(msgHash, sig1, pubHash)?.level).toBe(1)
    })

    it('checks existence with has()', () => {
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)
      const result: VerificationResult = { valid: true, level: 0, details: {} }

      expect(cache.has(msgHash, sig, pubHash)).toBe(false)

      cache.set(msgHash, sig, pubHash, result)

      expect(cache.has(msgHash, sig, pubHash)).toBe(true)
    })

    it('clears all entries', () => {
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)
      const result: VerificationResult = { valid: true, level: 0, details: {} }

      cache.set(msgHash, sig, pubHash, result)
      expect(cache.stats().size).toBe(1)

      cache.clear()
      expect(cache.stats().size).toBe(0)
      expect(cache.get(msgHash, sig, pubHash)).toBeNull()
    })
  })

  describe('LRU eviction', () => {
    it('evicts oldest entry at capacity', () => {
      const cache = new VerificationCache({ maxSize: 2 })

      for (let i = 0; i < 3; i++) {
        const msgHash = new Uint8Array(32).fill(i)
        const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64).fill(i) }
        const pubHash = new Uint8Array(32).fill(i)
        cache.set(msgHash, sig, pubHash, { valid: true, level: 0, details: {} })
      }

      expect(cache.stats().size).toBe(2)
    })

    it('promotes accessed entries to end', () => {
      const cache = new VerificationCache({ maxSize: 2 })

      // Add first entry
      const msgHash1 = new Uint8Array(32).fill(1)
      const sig1: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64).fill(1) }
      const pubHash1 = new Uint8Array(32).fill(1)
      cache.set(msgHash1, sig1, pubHash1, { valid: true, level: 0, details: {} })

      // Add second entry
      const msgHash2 = new Uint8Array(32).fill(2)
      const sig2: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64).fill(2) }
      const pubHash2 = new Uint8Array(32).fill(2)
      cache.set(msgHash2, sig2, pubHash2, { valid: true, level: 0, details: {} })

      // Access first entry to promote it
      cache.get(msgHash1, sig1, pubHash1)

      // Add third entry - should evict second (oldest now)
      const msgHash3 = new Uint8Array(32).fill(3)
      const sig3: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64).fill(3) }
      const pubHash3 = new Uint8Array(32).fill(3)
      cache.set(msgHash3, sig3, pubHash3, { valid: true, level: 0, details: {} })

      // First should still exist (was promoted)
      expect(cache.get(msgHash1, sig1, pubHash1)).not.toBeNull()
      // Second should be evicted
      expect(cache.get(msgHash2, sig2, pubHash2)).toBeNull()
      // Third should exist
      expect(cache.get(msgHash3, sig3, pubHash3)).not.toBeNull()
    })
  })

  describe('TTL expiration', () => {
    it('expires entries after TTL', async () => {
      const cache = new VerificationCache({ maxSize: 100, ttlMs: 50 })
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)

      cache.set(msgHash, sig, pubHash, { valid: true, level: 0, details: {} })
      expect(cache.get(msgHash, sig, pubHash)).not.toBeNull()

      await new Promise((r) => setTimeout(r, 100))

      const cached = cache.get(msgHash, sig, pubHash)
      expect(cached).toBeNull()
    })

    it('has() returns false for expired entries', async () => {
      const cache = new VerificationCache({ maxSize: 100, ttlMs: 50 })
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)

      cache.set(msgHash, sig, pubHash, { valid: true, level: 0, details: {} })
      expect(cache.has(msgHash, sig, pubHash)).toBe(true)

      await new Promise((r) => setTimeout(r, 100))

      expect(cache.has(msgHash, sig, pubHash)).toBe(false)
    })

    it('prune() removes expired entries', async () => {
      const cache = new VerificationCache({ maxSize: 100, ttlMs: 50 })

      // Add multiple entries
      for (let i = 0; i < 5; i++) {
        const msgHash = new Uint8Array(32).fill(i)
        const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64).fill(i) }
        const pubHash = new Uint8Array(32).fill(i)
        cache.set(msgHash, sig, pubHash, { valid: true, level: 0, details: {} })
      }

      expect(cache.stats().size).toBe(5)

      await new Promise((r) => setTimeout(r, 100))

      const pruned = cache.prune()
      expect(pruned).toBe(5)
      expect(cache.stats().size).toBe(0)
    })
  })

  describe('statistics', () => {
    it('tracks hits and misses', () => {
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)
      const result: VerificationResult = { valid: true, level: 0, details: {} }

      // Miss
      cache.get(msgHash, sig, pubHash)
      expect(cache.stats().misses).toBe(1)
      expect(cache.stats().hits).toBe(0)

      // Add entry
      cache.set(msgHash, sig, pubHash, result)

      // Hit
      cache.get(msgHash, sig, pubHash)
      expect(cache.stats().hits).toBe(1)
      expect(cache.stats().misses).toBe(1)

      // Another hit
      cache.get(msgHash, sig, pubHash)
      expect(cache.stats().hits).toBe(2)
    })

    it('calculates hit rate', () => {
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)
      const result: VerificationResult = { valid: true, level: 0, details: {} }

      // 1 miss
      cache.get(msgHash, sig, pubHash)

      cache.set(msgHash, sig, pubHash, result)

      // 3 hits
      cache.get(msgHash, sig, pubHash)
      cache.get(msgHash, sig, pubHash)
      cache.get(msgHash, sig, pubHash)

      // 3 hits / 4 total = 0.75
      expect(cache.stats().hitRate).toBe(0.75)
    })

    it('resets statistics', () => {
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)
      const result: VerificationResult = { valid: true, level: 0, details: {} }

      cache.set(msgHash, sig, pubHash, result)
      cache.get(msgHash, sig, pubHash)
      cache.get(new Uint8Array(32).fill(2), sig, pubHash) // miss

      expect(cache.stats().hits).toBe(1)
      expect(cache.stats().misses).toBe(1)

      cache.resetStats()

      expect(cache.stats().hits).toBe(0)
      expect(cache.stats().misses).toBe(0)
      expect(cache.stats().hitRate).toBe(0)
      // Size should not change
      expect(cache.stats().size).toBe(1)
    })
  })

  describe('global cache', () => {
    beforeEach(() => {
      setVerificationCache(null)
    })

    it('creates global cache on first access', () => {
      const cache1 = getVerificationCache()
      const cache2 = getVerificationCache()
      expect(cache1).toBe(cache2)
    })

    it('allows setting custom global cache', () => {
      const customCache = new VerificationCache({ maxSize: 50 })
      setVerificationCache(customCache)

      expect(getVerificationCache()).toBe(customCache)
      expect(getVerificationCache().stats().maxSize).toBe(50)
    })

    it('clears global cache', () => {
      const cache = getVerificationCache()
      const msgHash = new Uint8Array(32).fill(1)
      const sig: UnifiedSignature = { level: 0, ed25519: new Uint8Array(64) }
      const pubHash = new Uint8Array(32).fill(2)

      cache.set(msgHash, sig, pubHash, { valid: true, level: 0, details: {} })
      expect(cache.stats().size).toBe(1)

      clearVerificationCache()
      expect(cache.stats().size).toBe(0)
    })
  })
})
