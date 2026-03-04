/**
 * @xnetjs/identity - Key bundle serialization for storage
 *
 * Provides functions to serialize and deserialize HybridKeyBundle for
 * secure storage in IndexedDB or other persistent storage.
 *
 * WARNING: The serialized format contains private keys. Only use this
 * with encrypted storage or secure enclaves.
 */
import type { HybridKeyBundle, DID } from './types'
import { bytesToBase64, base64ToBytes, getSigningPublicKeyFromPrivate } from '@xnetjs/crypto'
import { createDID } from './did'

// ─── Serialized Types ────────────────────────────────────────────

/**
 * Serialized key bundle for storage.
 * Private keys are stored - this should only be in secure storage!
 */
export interface SerializedKeyBundle {
  /** Version for future compatibility */
  v: 2

  /** Ed25519 private key (base64) */
  signingKey: string

  /** X25519 private key (base64) */
  encryptionKey: string

  /** ML-DSA-65 private key (base64) */
  pqSigningKey?: string

  /** ML-DSA-65 public key (base64) */
  pqPublicKey?: string

  /** ML-KEM-768 private key (base64) */
  pqEncryptionKey?: string

  /** ML-KEM-768 public key (base64) */
  pqEncryptionPublicKey?: string

  /** Creation timestamp */
  created: number
}

// ─── Serialization ───────────────────────────────────────────────

/**
 * Serialize a key bundle for storage.
 *
 * WARNING: Contains private keys - use secure storage only!
 *
 * @example
 * ```typescript
 * const bundle = createKeyBundle()
 * const serialized = serializeHybridKeyBundle(bundle)
 *
 * // Store in IndexedDB (should be encrypted)
 * await db.put('identity', serialized)
 * ```
 */
export function serializeHybridKeyBundle(bundle: HybridKeyBundle): SerializedKeyBundle {
  const result: SerializedKeyBundle = {
    v: 2,
    signingKey: bytesToBase64(bundle.signingKey),
    encryptionKey: bytesToBase64(bundle.encryptionKey),
    created: bundle.identity.created
  }

  // Add PQ keys if present
  if (bundle.pqSigningKey) {
    result.pqSigningKey = bytesToBase64(bundle.pqSigningKey)
  }
  if (bundle.pqPublicKey) {
    result.pqPublicKey = bytesToBase64(bundle.pqPublicKey)
  }
  if (bundle.pqEncryptionKey) {
    result.pqEncryptionKey = bytesToBase64(bundle.pqEncryptionKey)
  }
  if (bundle.pqEncryptionPublicKey) {
    result.pqEncryptionPublicKey = bytesToBase64(bundle.pqEncryptionPublicKey)
  }

  return result
}

/**
 * Deserialize a key bundle from storage.
 *
 * Reconstructs the full HybridKeyBundle including the derived identity.
 *
 * @example
 * ```typescript
 * const serialized = await db.get('identity')
 * const bundle = deserializeHybridKeyBundle(serialized)
 *
 * // Bundle is ready to use
 * const sig = signWithBundle(bundle, message)
 * ```
 */
export function deserializeHybridKeyBundle(data: SerializedKeyBundle): HybridKeyBundle {
  const signingKey = base64ToBytes(data.signingKey)
  const encryptionKey = base64ToBytes(data.encryptionKey)

  // Derive public key and DID from signing key
  const publicKey = getSigningPublicKeyFromPrivate(signingKey)
  const did = createDID(publicKey) as DID

  const bundle: HybridKeyBundle = {
    signingKey,
    encryptionKey,
    identity: {
      did,
      publicKey,
      created: data.created
    },
    maxSecurityLevel: 0
  }

  // Add PQ keys if present
  if (data.pqSigningKey) {
    bundle.pqSigningKey = base64ToBytes(data.pqSigningKey)
    bundle.maxSecurityLevel = 2
  }
  if (data.pqPublicKey) {
    bundle.pqPublicKey = base64ToBytes(data.pqPublicKey)
  }
  if (data.pqEncryptionKey) {
    bundle.pqEncryptionKey = base64ToBytes(data.pqEncryptionKey)
  }
  if (data.pqEncryptionPublicKey) {
    bundle.pqEncryptionPublicKey = base64ToBytes(data.pqEncryptionPublicKey)
  }

  return bundle
}

// ─── JSON Serialization ──────────────────────────────────────────

/**
 * Convert serialized bundle to JSON string.
 */
export function serializeKeyBundleToJSON(bundle: HybridKeyBundle): string {
  return JSON.stringify(serializeHybridKeyBundle(bundle))
}

/**
 * Parse key bundle from JSON string.
 */
export function deserializeKeyBundleFromJSON(json: string): HybridKeyBundle {
  const data = JSON.parse(json) as SerializedKeyBundle
  return deserializeHybridKeyBundle(data)
}

// ─── Binary Serialization ────────────────────────────────────────

/**
 * Serialize a key bundle to a compact binary format.
 *
 * Format: [version(1)] [flags(1)] [created(8)] [signingKey(32)] [encryptionKey(32)]
 *         [pqSigningKey?(4032)] [pqPublicKey?(1952)] [pqEncryptionKey?(2400)] [pqEncryptionPublicKey?(1184)]
 *
 * Flags bit meanings:
 * - bit 0: has pqSigningKey
 * - bit 1: has pqPublicKey
 * - bit 2: has pqEncryptionKey
 * - bit 3: has pqEncryptionPublicKey
 */
export function serializeKeyBundleToBinary(bundle: HybridKeyBundle): Uint8Array {
  // Calculate total size
  let size = 1 + 1 + 8 + 32 + 32 // version + flags + created + signing + encryption

  let flags = 0
  if (bundle.pqSigningKey) {
    flags |= 0x01
    size += bundle.pqSigningKey.length
  }
  if (bundle.pqPublicKey) {
    flags |= 0x02
    size += bundle.pqPublicKey.length
  }
  if (bundle.pqEncryptionKey) {
    flags |= 0x04
    size += bundle.pqEncryptionKey.length
  }
  if (bundle.pqEncryptionPublicKey) {
    flags |= 0x08
    size += bundle.pqEncryptionPublicKey.length
  }

  const buffer = new Uint8Array(size)
  const view = new DataView(buffer.buffer)
  let offset = 0

  // Version
  buffer[offset++] = 2

  // Flags
  buffer[offset++] = flags

  // Created timestamp (8 bytes, big-endian)
  view.setBigUint64(offset, BigInt(bundle.identity.created), false)
  offset += 8

  // Classical keys
  buffer.set(bundle.signingKey, offset)
  offset += 32
  buffer.set(bundle.encryptionKey, offset)
  offset += 32

  // PQ keys (if present)
  if (bundle.pqSigningKey) {
    buffer.set(bundle.pqSigningKey, offset)
    offset += bundle.pqSigningKey.length
  }
  if (bundle.pqPublicKey) {
    buffer.set(bundle.pqPublicKey, offset)
    offset += bundle.pqPublicKey.length
  }
  if (bundle.pqEncryptionKey) {
    buffer.set(bundle.pqEncryptionKey, offset)
    offset += bundle.pqEncryptionKey.length
  }
  if (bundle.pqEncryptionPublicKey) {
    buffer.set(bundle.pqEncryptionPublicKey, offset)
    offset += bundle.pqEncryptionPublicKey.length
  }

  return buffer
}

/**
 * Deserialize a key bundle from binary format.
 */
export function deserializeKeyBundleFromBinary(data: Uint8Array): HybridKeyBundle {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 0

  // Version
  const version = data[offset++]
  if (version !== 2) {
    throw new Error(`Unsupported key bundle version: ${version}`)
  }

  // Flags
  const flags = data[offset++]

  // Created timestamp
  const created = Number(view.getBigUint64(offset, false))
  offset += 8

  // Classical keys
  const signingKey = data.slice(offset, offset + 32)
  offset += 32
  const encryptionKey = data.slice(offset, offset + 32)
  offset += 32

  // Derive public key and DID
  const publicKey = getSigningPublicKeyFromPrivate(signingKey)
  const did = createDID(publicKey) as DID

  const bundle: HybridKeyBundle = {
    signingKey,
    encryptionKey,
    identity: {
      did,
      publicKey,
      created
    },
    maxSecurityLevel: 0
  }

  // PQ signing key (4032 bytes)
  if (flags & 0x01) {
    bundle.pqSigningKey = data.slice(offset, offset + 4032)
    offset += 4032
    bundle.maxSecurityLevel = 2
  }

  // PQ public key (1952 bytes)
  if (flags & 0x02) {
    bundle.pqPublicKey = data.slice(offset, offset + 1952)
    offset += 1952
  }

  // PQ encryption key (2400 bytes)
  if (flags & 0x04) {
    bundle.pqEncryptionKey = data.slice(offset, offset + 2400)
    offset += 2400
  }

  // PQ encryption public key (1184 bytes)
  if (flags & 0x08) {
    bundle.pqEncryptionPublicKey = data.slice(offset, offset + 1184)
    offset += 1184
  }

  return bundle
}
