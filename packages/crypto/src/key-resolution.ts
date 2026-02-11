/**
 * X25519 key resolution for encryption key wrapping.
 *
 * The primary challenge: DID:key encodes Ed25519 public keys, but we need
 * X25519 keys for ECDH key wrapping. This module provides deterministic
 * key resolution using the birational map between Edwards25519 and Curve25519.
 *
 * PRIMARY PATH: Ed25519 -> X25519 birational conversion (zero network)
 * Uses edwardsToMontgomeryPub() from @noble/curves which implements the
 * well-known birational map.
 *
 * FALLBACK PATH: Hub key registry lookup (for post-quantum keys)
 * For ML-KEM keys that can't be derived from Ed25519.
 */

import { ed25519 } from '@noble/curves/ed25519.js'
import { hexToBytes as utilHexToBytes } from './utils'

/**
 * DID type for decentralized identifiers.
 */
export type DID = `did:key:${string}`

/**
 * Multicodec prefix for Ed25519 public keys.
 * 0xed = 237 decimal, followed by 0x01
 */
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])

// ─── Base58btc Implementation ─────────────────────────────────────────────────
// Minimal base58btc encoder/decoder for DID:key processing

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_MAP = new Map<string, number>()
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], i)
}

/**
 * Decode a base58btc string (with 'z' multibase prefix) to bytes.
 */
function base58btcDecode(encoded: string): Uint8Array {
  // Remove 'z' multibase prefix if present
  const str = encoded.startsWith('z') ? encoded.slice(1) : encoded

  // Count leading zeros (which become 0x00 bytes)
  let leadingZeros = 0
  for (const c of str) {
    if (c === '1') leadingZeros++
    else break
  }

  // Decode base58 to bigint, then to bytes
  let num = 0n
  for (const c of str) {
    const val = BASE58_MAP.get(c)
    if (val === undefined) throw new Error(`Invalid base58 character: ${c}`)
    num = num * 58n + BigInt(val)
  }

  // Convert bigint to bytes
  const bytes: number[] = []
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn))
    num = num >> 8n
  }

  // Add leading zeros
  const result = new Uint8Array(leadingZeros + bytes.length)
  result.set(bytes, leadingZeros)

  return result
}

/**
 * Encode bytes to base58btc string (with 'z' multibase prefix).
 */
function base58btcEncode(bytes: Uint8Array): string {
  // Count leading zeros
  let leadingZeros = 0
  for (const b of bytes) {
    if (b === 0) leadingZeros++
    else break
  }

  // Convert bytes to bigint
  let num = 0n
  for (const b of bytes) {
    num = num * 256n + BigInt(b)
  }

  // Convert bigint to base58
  let result = ''
  while (num > 0n) {
    result = BASE58_ALPHABET[Number(num % 58n)] + result
    num = num / 58n
  }

  // Add leading '1's for each leading zero byte
  return 'z' + '1'.repeat(leadingZeros) + result
}

/**
 * Interface for resolving DIDs to X25519 public keys.
 */
export interface PublicKeyResolver {
  /** Resolve a DID to its X25519 public key for key wrapping */
  resolve(did: DID): Promise<Uint8Array | null>

  /** Resolve multiple DIDs in batch (parallelized) */
  resolveBatch(dids: DID[]): Promise<Map<DID, Uint8Array>>
}

/**
 * Extract Ed25519 public key bytes from a did:key DID.
 *
 * did:key:z6Mk... encodes a multicodec-prefixed Ed25519 public key:
 * - 'z' prefix = base58btc encoding
 * - First two bytes = multicodec prefix (0xed01 for Ed25519)
 * - Remaining 32 bytes = Ed25519 public key
 *
 * @param did - The DID to extract the key from
 * @returns The 32-byte Ed25519 public key, or null if not an Ed25519 DID
 */
export function extractEd25519PubKey(did: DID): Uint8Array | null {
  // Only handle did:key:z6Mk... (Ed25519)
  if (!did.startsWith('did:key:z6Mk')) {
    return null
  }

  try {
    // Extract the base58btc-encoded part (everything after 'did:key:')
    const encoded = did.slice(8)

    // Decode base58btc (the 'z' prefix is part of the multibase encoding)
    // The 'z' character itself indicates base58btc
    const decoded = base58btcDecode(encoded)

    // Verify multicodec prefix (0xed01 for Ed25519)
    if (
      decoded[0] !== ED25519_MULTICODEC_PREFIX[0] ||
      decoded[1] !== ED25519_MULTICODEC_PREFIX[1]
    ) {
      return null
    }

    // Return the 32-byte Ed25519 public key
    return decoded.slice(2)
  } catch {
    return null
  }
}

/**
 * Convert an Ed25519 public key to X25519 using the birational map.
 *
 * This is a well-established cryptographic operation:
 * - Used by libsodium's crypto_sign_ed25519_pk_to_curve25519()
 * - Documented in RFC 7748 and the Ed25519/Curve25519 papers
 * - Implemented in @noble/curves as ed25519.utils.toMontgomery()
 *
 * Security note: This conversion is safe for key agreement but the
 * resulting X25519 key MUST only be used for ECDH, never for signing.
 *
 * @param ed25519PubKey - 32-byte Ed25519 public key
 * @returns 32-byte X25519 public key
 */
export function ed25519ToX25519(ed25519PubKey: Uint8Array): Uint8Array {
  return ed25519.utils.toMontgomery(ed25519PubKey)
}

/**
 * Convert an Ed25519 private key to X25519 using the birational map.
 *
 * @param ed25519PrivKey - 32-byte Ed25519 private key seed
 * @returns 32-byte X25519 private key
 */
export function ed25519PrivToX25519(ed25519PrivKey: Uint8Array): Uint8Array {
  return ed25519.utils.toMontgomerySecret(ed25519PrivKey)
}

/**
 * Default implementation of PublicKeyResolver.
 *
 * 1. Try birational conversion (instant, no network)
 * 2. Fall back to hub key registry (network required)
 * 3. Cache results for performance
 */
export class DefaultPublicKeyResolver implements PublicKeyResolver {
  private cache = new Map<DID, Uint8Array>()

  constructor(
    private hubKeyRegistryUrl?: string,
    private maxCacheSize = 10_000
  ) {}

  async resolve(did: DID): Promise<Uint8Array | null> {
    // Check cache
    const cached = this.cache.get(did)
    if (cached) return cached

    // Path 1: Birational conversion (Ed25519 -> X25519)
    const ed25519Key = extractEd25519PubKey(did)
    if (ed25519Key) {
      const x25519Key = ed25519ToX25519(ed25519Key)
      this.cacheKey(did, x25519Key)
      return x25519Key
    }

    // Path 2: Hub key registry fallback
    if (this.hubKeyRegistryUrl) {
      try {
        const response = await fetch(
          `${this.hubKeyRegistryUrl}/keys/${encodeURIComponent(did)}/x25519`
        )
        if (response.ok) {
          const keyBytes = new Uint8Array(await response.arrayBuffer())
          this.cacheKey(did, keyBytes)
          return keyBytes
        }
      } catch {
        // Network error - key not available
      }
    }

    return null
  }

  async resolveBatch(dids: DID[]): Promise<Map<DID, Uint8Array>> {
    const results = new Map<DID, Uint8Array>()
    const needsNetwork: DID[] = []

    // Fast path: resolve all Ed25519 DIDs locally
    for (const did of dids) {
      const cached = this.cache.get(did)
      if (cached) {
        results.set(did, cached)
        continue
      }

      const ed25519Key = extractEd25519PubKey(did)
      if (ed25519Key) {
        const x25519Key = ed25519ToX25519(ed25519Key)
        this.cacheKey(did, x25519Key)
        results.set(did, x25519Key)
      } else {
        needsNetwork.push(did)
      }
    }

    // Slow path: batch resolve from hub registry
    if (needsNetwork.length > 0 && this.hubKeyRegistryUrl) {
      const batchResults = await this.fetchBatchKeys(needsNetwork)
      for (const [did, key] of batchResults) {
        this.cacheKey(did, key)
        results.set(did, key)
      }
    }

    return results
  }

  /**
   * Clear the key cache.
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get the current cache size.
   */
  getCacheSize(): number {
    return this.cache.size
  }

  private cacheKey(did: DID, key: Uint8Array): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Simple eviction: remove oldest entry
      const oldest = this.cache.keys().next().value
      if (oldest) this.cache.delete(oldest)
    }
    this.cache.set(did, key)
  }

  private async fetchBatchKeys(dids: DID[]): Promise<Map<DID, Uint8Array>> {
    // POST /keys/batch with DID list, returns map of DID -> X25519 key
    try {
      const response = await fetch(`${this.hubKeyRegistryUrl}/keys/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dids })
      })
      if (!response.ok) return new Map()

      const data = (await response.json()) as { keys: Record<string, string> }
      const results = new Map<DID, Uint8Array>()

      for (const [did, keyHex] of Object.entries(data.keys)) {
        results.set(did as DID, utilHexToBytes(keyHex))
      }
      return results
    } catch {
      return new Map()
    }
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Create a DID from an Ed25519 public key.
 *
 * @param ed25519PubKey - 32-byte Ed25519 public key
 * @returns DID in the format did:key:z6Mk...
 */
export function createDIDFromEd25519PublicKey(ed25519PubKey: Uint8Array): DID {
  // Prepend multicodec prefix
  const prefixed = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + ed25519PubKey.length)
  prefixed.set(ED25519_MULTICODEC_PREFIX)
  prefixed.set(ed25519PubKey, ED25519_MULTICODEC_PREFIX.length)

  // Encode with base58btc (includes 'z' prefix)
  const encoded = base58btcEncode(prefixed)

  return `did:key:${encoded}` as DID
}
