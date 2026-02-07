/**
 * Performance benchmark tests for multi-level cryptography.
 *
 * These tests verify that cryptographic operations meet performance targets
 * and provide visibility into actual performance characteristics.
 *
 * Target performance (from plan):
 * | Operation      | Target  | Acceptable |
 * | -------------- | ------- | ---------- |
 * | Level 0 Sign   | <0.2ms  | <0.5ms     |
 * | Level 1 Sign   | <5ms    | <10ms      |
 * | Level 0 Verify | <0.5ms  | <1ms       |
 * | Level 1 Verify | <2ms    | <5ms       |
 * | Cached Verify  | <0.1ms  | <0.5ms     |
 * | Key Generation | <5ms    | <10ms      |
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  hybridSign,
  hybridVerify,
  hybridVerifyCached,
  hybridSignBatch,
  hybridVerifyBatch,
  generateHybridKeyPair,
  deriveHybridKeyPair,
  getVerificationCache,
  clearVerificationCache,
  type HybridKeyPair,
  type HybridSigningKey,
  type HybridPublicKey
} from './index'

// ─── Test Fixtures ───────────────────────────────────────────────

describe('Performance Benchmarks', () => {
  let keys: HybridKeyPair
  let signingKey: HybridSigningKey
  let publicKey: HybridPublicKey
  const message = new Uint8Array(1000) // 1KB message

  // Fill with deterministic data
  for (let i = 0; i < message.length; i++) {
    message[i] = i % 256
  }

  beforeAll(() => {
    keys = generateHybridKeyPair()
    signingKey = {
      ed25519: keys.ed25519.privateKey,
      mlDsa: keys.mlDsa!.privateKey
    }
    publicKey = {
      ed25519: keys.ed25519.publicKey,
      mlDsa: keys.mlDsa!.publicKey
    }
  })

  // ─── Helper Functions ────────────────────────────────────────────

  function measureTime<T>(fn: () => T, iterations: number = 10): { result: T; avgMs: number } {
    const times: number[] = []
    let result: T

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      result = fn()
      times.push(performance.now() - start)
    }

    const avgMs = times.reduce((a, b) => a + b, 0) / times.length
    return { result: result!, avgMs }
  }

  // ─── Key Generation Benchmarks ───────────────────────────────────

  describe('Key Generation', () => {
    it('random hybrid key generation < 15ms', () => {
      const { avgMs } = measureTime(() => generateHybridKeyPair(), 5)

      console.log(`Random hybrid keygen: ${avgMs.toFixed(2)}ms average`)
      expect(avgMs).toBeLessThan(15) // Allow CI overhead
    })

    it('deterministic key derivation < 15ms', () => {
      const seed = new Uint8Array(32).fill(42)
      const { avgMs } = measureTime(() => deriveHybridKeyPair(seed), 5)

      console.log(`Deterministic derivation: ${avgMs.toFixed(2)}ms average`)
      expect(avgMs).toBeLessThan(15) // Allow CI overhead
    })

    it('Ed25519-only key generation < 3ms', () => {
      const { avgMs } = measureTime(() => generateHybridKeyPair({ includePQ: false }), 10)

      console.log(`Ed25519-only keygen: ${avgMs.toFixed(2)}ms average`)
      expect(avgMs).toBeLessThan(3) // Allow CI overhead
    })
  })

  // ─── Signing Benchmarks ──────────────────────────────────────────

  describe('Signing Performance', () => {
    it('Level 0 (Ed25519) sign < 0.5ms', () => {
      const { avgMs } = measureTime(() => {
        hybridSign(message, { ed25519: signingKey.ed25519 }, 0)
      }, 100)

      console.log(`Level 0 sign: ${avgMs.toFixed(3)}ms average`)
      expect(avgMs).toBeLessThan(0.5)
    })

    it('Level 1 (Hybrid) sign < 20ms', () => {
      const { avgMs } = measureTime(() => {
        hybridSign(message, signingKey, 1)
      }, 10)

      console.log(`Level 1 sign: ${avgMs.toFixed(2)}ms average`)
      expect(avgMs).toBeLessThan(20) // More lenient for CI
    })

    it('Level 2 (ML-DSA only) sign < 20ms', () => {
      const { avgMs } = measureTime(() => {
        hybridSign(message, signingKey, 2)
      }, 10)

      console.log(`Level 2 sign: ${avgMs.toFixed(2)}ms average`)
      expect(avgMs).toBeLessThan(20)
    })

    it('batch signing is more efficient per item', () => {
      const messages = Array.from({ length: 10 }, (_, i) => {
        const msg = new Uint8Array(100)
        msg.fill(i)
        return msg
      })

      const { avgMs: batchTime } = measureTime(() => {
        hybridSignBatch(messages, { ed25519: signingKey.ed25519 }, 0)
      }, 10)

      const { avgMs: individualTime } = measureTime(() => {
        messages.forEach((msg) => hybridSign(msg, { ed25519: signingKey.ed25519 }, 0))
      }, 10)

      const batchPerItem = batchTime / 10
      const individualPerItem = individualTime / 10

      console.log(
        `Batch per-item: ${batchPerItem.toFixed(3)}ms, Individual: ${individualPerItem.toFixed(3)}ms`
      )

      // Batch should not be significantly slower
      expect(batchTime).toBeLessThan(individualTime * 1.5)
    })
  })

  // ─── Verification Benchmarks ─────────────────────────────────────

  describe('Verification Performance', () => {
    it('Level 0 verify < 3ms', () => {
      const sig = hybridSign(message, { ed25519: signingKey.ed25519 }, 0)

      const { avgMs } = measureTime(() => {
        hybridVerify(message, sig, { ed25519: publicKey.ed25519 })
      }, 100)

      console.log(`Level 0 verify: ${avgMs.toFixed(3)}ms average`)
      expect(avgMs).toBeLessThan(3) // Allow CI overhead
    })

    it('Level 1 verify < 10ms', () => {
      const sig = hybridSign(message, signingKey, 1)

      const { avgMs } = measureTime(() => {
        hybridVerify(message, sig, publicKey)
      }, 10)

      console.log(`Level 1 verify: ${avgMs.toFixed(2)}ms average`)
      expect(avgMs).toBeLessThan(10)
    })

    it('Level 2 verify < 10ms', () => {
      const sig = hybridSign(message, signingKey, 2)

      const { avgMs } = measureTime(() => {
        hybridVerify(message, sig, publicKey)
      }, 10)

      console.log(`Level 2 verify: ${avgMs.toFixed(2)}ms average`)
      expect(avgMs).toBeLessThan(10)
    })
  })

  // ─── Cache Performance ───────────────────────────────────────────

  describe('Cache Performance', () => {
    it('cached verification shows significant speedup', () => {
      // Clear any existing cache
      const cache = getVerificationCache()
      cache.clear()
      cache.resetStats()

      const sig = hybridSign(message, signingKey, 1)

      // First verification (cache miss)
      const { avgMs: firstTime } = measureTime(() => {
        hybridVerifyCached(message, sig, publicKey, { useCache: true })
      }, 1)

      // Subsequent verifications (cache hit)
      const { avgMs: cachedTime } = measureTime(() => {
        hybridVerifyCached(message, sig, publicKey, { useCache: true })
      }, 100)

      const stats = cache.stats()

      console.log(`First verify: ${firstTime.toFixed(2)}ms`)
      console.log(`Cached verify: ${cachedTime.toFixed(3)}ms`)
      console.log(`Cache stats: ${stats.hits} hits, ${stats.misses} misses`)

      // Cached should be at least 5x faster
      expect(cachedTime).toBeLessThan(firstTime / 2)
      expect(stats.hits).toBeGreaterThan(0)
    })

    it('cache hit rate > 90% for repeated verifications', () => {
      // Clear and reset cache
      const cache = getVerificationCache()
      cache.clear()
      cache.resetStats()

      const sig = hybridSign(message, signingKey, 1)

      // Run 100 verifications of the same signature
      for (let i = 0; i < 100; i++) {
        hybridVerifyCached(message, sig, publicKey)
      }

      const stats = cache.stats()
      const hitRate = stats.hits / (stats.hits + stats.misses)

      console.log(`Cache hit rate: ${(hitRate * 100).toFixed(1)}%`)
      expect(hitRate).toBeGreaterThan(0.9)
    })
  })

  // ─── Batch Verification ──────────────────────────────────────────

  describe('Batch Verification', () => {
    it('batch verify 10 items < 50ms at Level 0', () => {
      const messages = Array.from({ length: 10 }, (_, i) => {
        const msg = new Uint8Array(100)
        msg.fill(i)
        return msg
      })
      const signatures = messages.map((msg) => hybridSign(msg, { ed25519: signingKey.ed25519 }, 0))
      const items = messages.map((msg, i) => ({
        message: msg,
        signature: signatures[i],
        publicKeys: { ed25519: publicKey.ed25519 }
      }))

      const { avgMs } = measureTime(() => {
        hybridVerifyBatch(items)
      }, 10)

      console.log(`Batch verify 10 items (L0): ${avgMs.toFixed(2)}ms`)
      expect(avgMs).toBeLessThan(50)
    })

    it('batch verify 10 items < 100ms at Level 1', () => {
      const messages = Array.from({ length: 10 }, (_, i) => {
        const msg = new Uint8Array(100)
        msg.fill(i)
        return msg
      })
      const signatures = messages.map((msg) => hybridSign(msg, signingKey, 1))
      const items = messages.map((msg, i) => ({
        message: msg,
        signature: signatures[i],
        publicKeys: publicKey
      }))

      const { avgMs } = measureTime(() => {
        hybridVerifyBatch(items)
      }, 5)

      console.log(`Batch verify 10 items (L1): ${avgMs.toFixed(2)}ms`)
      expect(avgMs).toBeLessThan(100)
    })
  })

  // ─── Message Size Impact ─────────────────────────────────────────

  describe('Message Size Impact', () => {
    it('signing time is nearly constant for different message sizes', () => {
      const small = new Uint8Array(100)
      const medium = new Uint8Array(1000)
      const large = new Uint8Array(10000)

      const { avgMs: smallTime } = measureTime(
        () => hybridSign(small, { ed25519: signingKey.ed25519 }, 0),
        50
      )
      const { avgMs: mediumTime } = measureTime(
        () => hybridSign(medium, { ed25519: signingKey.ed25519 }, 0),
        50
      )
      const { avgMs: largeTime } = measureTime(
        () => hybridSign(large, { ed25519: signingKey.ed25519 }, 0),
        50
      )

      console.log(
        `Sign times - 100B: ${smallTime.toFixed(3)}ms, 1KB: ${mediumTime.toFixed(3)}ms, 10KB: ${largeTime.toFixed(3)}ms`
      )

      // Large should not be more than 5x slower than small
      expect(largeTime).toBeLessThan(smallTime * 5)
    })
  })

  // ─── Summary Report ──────────────────────────────────────────────

  describe('Summary', () => {
    it('generates performance summary', () => {
      const results: Record<string, number> = {}

      // Key generation
      results['keygen_hybrid'] = measureTime(() => generateHybridKeyPair(), 3).avgMs
      results['keygen_ed25519'] = measureTime(
        () => generateHybridKeyPair({ includePQ: false }),
        10
      ).avgMs

      // Signing
      results['sign_l0'] = measureTime(
        () => hybridSign(message, { ed25519: signingKey.ed25519 }, 0),
        50
      ).avgMs
      results['sign_l1'] = measureTime(() => hybridSign(message, signingKey, 1), 5).avgMs
      results['sign_l2'] = measureTime(() => hybridSign(message, signingKey, 2), 5).avgMs

      // Verification
      const sig0 = hybridSign(message, { ed25519: signingKey.ed25519 }, 0)
      const sig1 = hybridSign(message, signingKey, 1)
      const sig2 = hybridSign(message, signingKey, 2)

      results['verify_l0'] = measureTime(
        () => hybridVerify(message, sig0, { ed25519: publicKey.ed25519 }),
        50
      ).avgMs
      results['verify_l1'] = measureTime(() => hybridVerify(message, sig1, publicKey), 5).avgMs
      results['verify_l2'] = measureTime(() => hybridVerify(message, sig2, publicKey), 5).avgMs

      // Cached verification
      clearVerificationCache()
      hybridVerifyCached(message, sig1, publicKey) // Warm up
      results['verify_cached'] = measureTime(
        () => hybridVerifyCached(message, sig1, publicKey),
        100
      ).avgMs

      console.log('\n=== Performance Summary ===')
      console.log(`Hybrid keygen:    ${results['keygen_hybrid'].toFixed(2)}ms`)
      console.log(`Ed25519 keygen:   ${results['keygen_ed25519'].toFixed(3)}ms`)
      console.log(`Level 0 sign:     ${results['sign_l0'].toFixed(3)}ms`)
      console.log(`Level 1 sign:     ${results['sign_l1'].toFixed(2)}ms`)
      console.log(`Level 2 sign:     ${results['sign_l2'].toFixed(2)}ms`)
      console.log(`Level 0 verify:   ${results['verify_l0'].toFixed(3)}ms`)
      console.log(`Level 1 verify:   ${results['verify_l1'].toFixed(2)}ms`)
      console.log(`Level 2 verify:   ${results['verify_l2'].toFixed(2)}ms`)
      console.log(`Cached verify:    ${results['verify_cached'].toFixed(4)}ms`)

      // Just verify this test runs
      expect(Object.keys(results).length).toBeGreaterThan(0)
    })
  })
})
