/**
 * Asymmetric key exchange using X25519
 */
import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { randomBytes } from './random'

/**
 * X25519 key pair for key exchange
 */
export interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

/**
 * Generate an X25519 key pair for key exchange
 */
export function generateKeyPair(): KeyPair {
  const privateKey = randomBytes(32)
  const publicKey = x25519.getPublicKey(privateKey)
  return { publicKey, privateKey }
}

/**
 * Derive a shared secret from private key and peer's public key
 * Uses HKDF to derive a 32-byte symmetric key
 */
export function deriveSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  const shared = x25519.getSharedSecret(privateKey, publicKey)
  // Derive symmetric key using HKDF
  const info = new TextEncoder().encode('xnet-key-exchange')
  return hkdf(sha256, shared, undefined, info, 32)
}

/**
 * Derive a shared secret with additional context
 */
export function deriveSharedSecretWithContext(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  context: string
): Uint8Array {
  const shared = x25519.getSharedSecret(privateKey, publicKey)
  const info = new TextEncoder().encode(context)
  return hkdf(sha256, shared, undefined, info, 32)
}

/**
 * Get public key from private key
 */
export function getPublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey)
}
