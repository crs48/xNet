/**
 * Key derivation and management
 */
import type { KeyBundle, Identity } from './types'
import {
  hkdf,
  generateSigningKeyPair,
  generateKeyPair,
  getSigningPublicKeyFromPrivate
} from '@xnet/crypto'
import { createDID } from './did'

/**
 * Derive signing and encryption keys from a master seed using HKDF.
 *
 * Uses proper HKDF (RFC 5869) with SHA-256 for cryptographically sound
 * key derivation with entropy extraction.
 */
export function deriveKeyBundle(masterSeed: Uint8Array): KeyBundle {
  // Derive signing key using HKDF with context
  const signingKey = hkdf(masterSeed, 'xnet-signing-key', 32)

  // Derive encryption key using HKDF with different context
  const encryptionKey = hkdf(masterSeed, 'xnet-encryption-key', 32)

  // Create identity from signing key
  const signingPublic = getSigningPublicKeyFromPrivate(signingKey)
  const identity: Identity = {
    did: createDID(signingPublic),
    publicKey: signingPublic,
    created: Date.now()
  }

  return {
    signingKey,
    encryptionKey,
    identity
  }
}

/**
 * Generate a new key bundle with random keys
 */
export function generateKeyBundle(): KeyBundle {
  const { publicKey: signingPublic, privateKey: signingKey } = generateSigningKeyPair()
  const { privateKey: encryptionKey } = generateKeyPair()

  return {
    signingKey,
    encryptionKey,
    identity: {
      did: createDID(signingPublic),
      publicKey: signingPublic,
      created: Date.now()
    }
  }
}

/**
 * Serialize a key bundle to bytes for storage
 */
export function serializeKeyBundle(bundle: KeyBundle): Uint8Array {
  const json = JSON.stringify({
    signingKey: Array.from(bundle.signingKey),
    encryptionKey: Array.from(bundle.encryptionKey),
    identity: {
      did: bundle.identity.did,
      publicKey: Array.from(bundle.identity.publicKey),
      created: bundle.identity.created
    }
  })
  return new TextEncoder().encode(json)
}

/**
 * Deserialize a key bundle from bytes
 */
export function deserializeKeyBundle(data: Uint8Array): KeyBundle {
  const json = new TextDecoder().decode(data)
  const parsed = JSON.parse(json)
  return {
    signingKey: new Uint8Array(parsed.signingKey),
    encryptionKey: new Uint8Array(parsed.encryptionKey),
    identity: {
      did: parsed.identity.did,
      publicKey: new Uint8Array(parsed.identity.publicKey),
      created: parsed.identity.created
    }
  }
}
