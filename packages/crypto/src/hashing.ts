/**
 * Cryptographic hashing functions
 */
import { blake3 } from '@noble/hashes/blake3.js'
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, bytesToBase64url } from './utils'

export type HashAlgorithm = 'blake3' | 'sha256'

/**
 * Hash data using the specified algorithm
 */
export function hash(data: Uint8Array, algorithm: HashAlgorithm = 'blake3'): Uint8Array {
  switch (algorithm) {
    case 'blake3':
      return blake3(data)
    case 'sha256':
      return sha256(data)
  }
}

/**
 * Hash data and return as hex string
 */
export function hashHex(data: Uint8Array, algorithm: HashAlgorithm = 'blake3'): string {
  return bytesToHex(hash(data, algorithm))
}

/**
 * Hash data and return as base64url string
 */
export function hashBase64(data: Uint8Array, algorithm: HashAlgorithm = 'blake3'): string {
  return bytesToBase64url(hash(data, algorithm))
}

/**
 * Derive a key using HKDF (HMAC-based Extract-and-Expand Key Derivation Function).
 *
 * Uses SHA-256 as the underlying hash function. This is the recommended way to
 * derive keys from a master secret with proper entropy extraction.
 *
 * @param ikm - Input keying material (master secret/seed)
 * @param info - Application-specific context string
 * @param length - Desired output length in bytes (default: 32)
 * @param salt - Optional salt for additional randomness
 * @returns Derived key bytes
 *
 * @example
 * ```typescript
 * const masterSeed = randomBytes(32)
 * const signingKey = hkdf(masterSeed, 'xnet-signing-key', 32)
 * const encryptionKey = hkdf(masterSeed, 'xnet-encryption-key', 32)
 * ```
 */
export function hkdf(
  ikm: Uint8Array,
  info: string,
  length: number = 32,
  salt?: Uint8Array
): Uint8Array {
  const infoBytes = new TextEncoder().encode(info)
  return nobleHkdf(sha256, ikm, salt, infoBytes, length)
}
