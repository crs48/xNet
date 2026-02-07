/**
 * DID:key implementation for Ed25519 keys
 */
import type { Identity, DID } from './types'
import { generateSigningKeyPair, getSigningPublicKeyFromPrivate } from '@xnet/crypto'
import { base58btc } from 'multiformats/bases/base58'

// Multicodec prefix for Ed25519 public key (0xed01)
const ED25519_PREFIX = new Uint8Array([0xed, 0x01])

/**
 * Create a DID:key from an Ed25519 public key
 */
export function createDID(publicKey: Uint8Array): DID {
  if (publicKey.length !== 32) {
    throw new Error('Public key must be 32 bytes')
  }
  const prefixed = new Uint8Array(ED25519_PREFIX.length + publicKey.length)
  prefixed.set(ED25519_PREFIX)
  prefixed.set(publicKey, ED25519_PREFIX.length)
  const encoded = base58btc.encode(prefixed)
  return `did:key:${encoded}` as DID
}

/**
 * Parse a DID:key to extract the Ed25519 public key
 */
export function parseDID(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Invalid DID format: must start with did:key:z')
  }
  const encoded = did.slice(8) // Remove 'did:key:'
  const decoded = base58btc.decode(encoded)
  // Verify Ed25519 prefix
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Not an Ed25519 DID')
  }
  return decoded.slice(2) // Remove prefix, return public key
}

/**
 * Generate a new identity with a random key pair
 */
export function generateIdentity(): { identity: Identity; privateKey: Uint8Array } {
  const { publicKey, privateKey } = generateSigningKeyPair()
  const did = createDID(publicKey)
  return {
    identity: {
      did,
      publicKey,
      created: Date.now()
    },
    privateKey
  }
}

/**
 * Create an identity from an existing private key
 */
export function identityFromPrivateKey(privateKey: Uint8Array): Identity {
  const publicKey = getSigningPublicKeyFromPrivate(privateKey)
  return {
    did: createDID(publicKey),
    publicKey,
    created: Date.now()
  }
}

/**
 * Check if a string is a valid DID:key
 */
export function isValidDID(did: string): boolean {
  try {
    parseDID(did)
    return true
  } catch {
    return false
  }
}
