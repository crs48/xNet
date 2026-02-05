/**
 * Key derivation and management
 */
import {
  hash,
  generateSigningKeyPair,
  generateKeyPair,
  getSigningPublicKeyFromPrivate
} from '@xnet/crypto'
import type { KeyBundle, Identity } from './types'
import { createDID } from './did'

/**
 * Derive signing and encryption keys from a master seed using HKDF-like derivation
 */
export function deriveKeyBundle(masterSeed: Uint8Array): KeyBundle {
  // Derive signing key by hashing seed with context
  const signingContext = new TextEncoder().encode('xnet-signing-key')
  const signingInput = new Uint8Array(masterSeed.length + signingContext.length)
  signingInput.set(masterSeed)
  signingInput.set(signingContext, masterSeed.length)
  const signingKey = hash(signingInput)

  // Derive encryption key with different context
  const encryptionContext = new TextEncoder().encode('xnet-encryption-key')
  const encryptionInput = new Uint8Array(masterSeed.length + encryptionContext.length)
  encryptionInput.set(masterSeed)
  encryptionInput.set(encryptionContext, masterSeed.length)
  const encryptionKey = hash(encryptionInput)

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
