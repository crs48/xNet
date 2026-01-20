/**
 * Digital signatures using Ed25519
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { randomBytes } from './random'

/**
 * Ed25519 key pair for signing
 */
export interface SigningKeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

/**
 * Generate an Ed25519 key pair for signing
 */
export function generateSigningKeyPair(): SigningKeyPair {
  const privateKey = randomBytes(32)
  const publicKey = ed25519.getPublicKey(privateKey)
  return { publicKey, privateKey }
}

/**
 * Sign a message with a private key
 */
export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey)
}

/**
 * Verify a signature
 */
export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

/**
 * Get public key from private key
 */
export function getSigningPublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey)
}
