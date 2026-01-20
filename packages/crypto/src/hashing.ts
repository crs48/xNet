/**
 * Cryptographic hashing functions
 */
import { blake3 } from '@noble/hashes/blake3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from './utils'

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
 * Convert bytes to base64url
 */
function bytesToBase64url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
