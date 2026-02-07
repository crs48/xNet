/**
 * LRU cache for verification results.
 *
 * Cache keys are computed from (message hash + signature + public keys).
 * This avoids redundant cryptographic operations for repeated verifications.
 */

import type { UnifiedSignature, VerificationResult } from '../unified-signature'
import { hash } from '../hashing'

// ─── Types ────────────────────────────────────────────────────────

/**
 * Cache entry with result and expiration.
 */
interface CacheEntry {
  result: VerificationResult
  expiresAt: number
}

/**
 * Cache configuration options.
 */
export interface VerificationCacheOptions {
  /** Maximum number of entries (default: 10000) */
  maxSize?: number

  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttlMs?: number
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Current number of cached entries */
  size: number

  /** Maximum cache size */
  maxSize: number

  /** Cache hit rate (0-1) */
  hitRate: number

  /** Total cache hits */
  hits: number

  /** Total cache misses */
  misses: number
}

// ─── Cache Implementation ─────────────────────────────────────────

/**
 * LRU cache for signature verification results.
 *
 * Uses a Map for O(1) access with LRU eviction on capacity.
 * Cache keys are derived from message hash + signature + public key hashes.
 *
 * @example
 * ```typescript
 * const cache = new VerificationCache({ maxSize: 1000, ttlMs: 60_000 })
 *
 * // Check cache before verification
 * const cached = cache.get(messageHash, signature, publicKeyHash)
 * if (cached) return cached
 *
 * // Perform verification
 * const result = hybridVerify(message, signature, publicKeys)
 *
 * // Cache the result
 * cache.set(messageHash, signature, publicKeyHash, result)
 * ```
 */
export class VerificationCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number
  private ttlMs: number

  // Statistics
  private _hits = 0
  private _misses = 0

  constructor(options: VerificationCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 10000
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000 // 5 minutes default
  }

  /**
   * Compute cache key for a verification.
   *
   * The key is derived from:
   * - Message hash (32 bytes)
   * - Security level (1 byte)
   * - Ed25519 signature (if present)
   * - ML-DSA signature (if present)
   * - Public key hash (32 bytes)
   */
  private computeKey(
    messageHash: Uint8Array,
    signature: UnifiedSignature,
    publicKeyHash: Uint8Array
  ): string {
    // Calculate total size
    const ed25519Len = signature.ed25519?.length ?? 0
    const mlDsaLen = signature.mlDsa?.length ?? 0
    const totalSize = messageHash.length + 1 + ed25519Len + mlDsaLen + publicKeyHash.length

    const combined = new Uint8Array(totalSize)

    let offset = 0
    combined.set(messageHash, offset)
    offset += messageHash.length

    combined[offset++] = signature.level

    if (signature.ed25519) {
      combined.set(signature.ed25519, offset)
      offset += signature.ed25519.length
    }

    if (signature.mlDsa) {
      combined.set(signature.mlDsa, offset)
      offset += signature.mlDsa.length
    }

    combined.set(publicKeyHash, offset)

    // Hash to fixed size for memory efficiency
    const keyHash = hash(combined, 'blake3')
    return Array.from(keyHash.slice(0, 16))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Get cached verification result.
   *
   * @returns Cached result or null if not found/expired
   */
  get(
    messageHash: Uint8Array,
    signature: UnifiedSignature,
    publicKeyHash: Uint8Array
  ): VerificationResult | null {
    const key = this.computeKey(messageHash, signature, publicKeyHash)
    const entry = this.cache.get(key)

    if (!entry) {
      this._misses++
      return null
    }

    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this._misses++
      return null
    }

    // Move to end for LRU (delete and re-add)
    this.cache.delete(key)
    this.cache.set(key, entry)

    this._hits++
    return entry.result
  }

  /**
   * Store verification result in cache.
   */
  set(
    messageHash: Uint8Array,
    signature: UnifiedSignature,
    publicKeyHash: Uint8Array,
    result: VerificationResult
  ): void {
    const key = this.computeKey(messageHash, signature, publicKeyHash)

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.ttlMs
    })
  }

  /**
   * Check if a verification result is cached.
   */
  has(messageHash: Uint8Array, signature: UnifiedSignature, publicKeyHash: Uint8Array): boolean {
    const key = this.computeKey(messageHash, signature, publicKeyHash)
    const entry = this.cache.get(key)

    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics.
   */
  stats(): CacheStats {
    const total = this._hits + this._misses
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this._hits / total : 0,
      hits: this._hits,
      misses: this._misses
    }
  }

  /**
   * Reset statistics counters.
   */
  resetStats(): void {
    this._hits = 0
    this._misses = 0
  }

  /**
   * Prune expired entries.
   *
   * Called automatically during get(), but can be called manually
   * to clean up expired entries proactively.
   */
  prune(): number {
    const now = Date.now()
    let pruned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        pruned++
      }
    }

    return pruned
  }
}

// ─── Global Cache Instance ────────────────────────────────────────

let globalCache: VerificationCache | null = null

/**
 * Get the global verification cache instance.
 *
 * Creates a new cache with default options if none exists.
 */
export function getVerificationCache(): VerificationCache {
  if (!globalCache) {
    globalCache = new VerificationCache()
  }
  return globalCache
}

/**
 * Set the global verification cache instance.
 *
 * Useful for configuring custom cache options or replacing the cache.
 */
export function setVerificationCache(cache: VerificationCache | null): void {
  globalCache = cache
}

/**
 * Clear the global verification cache.
 */
export function clearVerificationCache(): void {
  if (globalCache) {
    globalCache.clear()
  }
}
