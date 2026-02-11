/**
 * Encrypted envelope types and operations.
 *
 * An encrypted envelope wraps node content with:
 * - Per-node content key (XChaCha20-Poly1305)
 * - Content key wrapped for each recipient (X25519 ECDH)
 * - Public metadata (schema, creator, recipients list)
 * - Ed25519 signature for integrity
 */

import type { DID } from './key-resolution'
import { x25519 } from '@noble/curves/ed25519.js'
import { randomBytes } from './random'
import { sign, verify } from './signing'
import { generateKey, encrypt, decrypt } from './symmetric'

/**
 * Schema IRI type.
 */
export type SchemaIRI = `xnet://${string}/${string}`

/**
 * A key wrapped for a specific recipient.
 */
export interface WrappedKey {
  /** Algorithm identifier */
  algorithm: 'X25519-XChaCha20'
  /** Ephemeral public key used for ECDH */
  ephemeralPublicKey: Uint8Array
  /** Content key encrypted with shared secret */
  wrappedKey: Uint8Array
  /** Nonce used for XChaCha20 encryption */
  nonce: Uint8Array
}

/**
 * Metadata extracted from a node for envelope creation.
 */
export interface EnvelopeMetadata {
  id: string
  schema: SchemaIRI
  createdBy: DID
  createdAt: number
  updatedAt: number
  lamport: number
}

/**
 * An encrypted envelope containing node content.
 *
 * The envelope preserves public metadata (for hub filtering)
 * while encrypting the actual content.
 */
export interface EncryptedEnvelope {
  /** Envelope format version */
  version: 1
  /** Node ID */
  id: string
  /** Schema IRI */
  schema: SchemaIRI
  /** Creator DID */
  createdBy: DID
  /** Creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
  /** Lamport timestamp for ordering */
  lamport: number
  /** DIDs that can decrypt this envelope (or 'PUBLIC') */
  recipients: DID[]
  /** Public properties (unencrypted) */
  publicProps?: Record<string, unknown>
  /** Content key wrapped for each recipient */
  encryptedKeys: Record<string, WrappedKey>
  /** Encrypted content */
  ciphertext: Uint8Array
  /** Nonce for content encryption */
  nonce: Uint8Array
  /** Ed25519 signature over the envelope */
  signature: Uint8Array
}

// ─── Well-Known Constants ─────────────────────────────────────────────────────

/**
 * Well-known content key for public nodes.
 * All zeros - anyone can "decrypt" because the key is public knowledge.
 *
 * This preserves the same code path (encrypt/decrypt) for all nodes,
 * simplifying the implementation. The security boundary is enforced by
 * the recipients list, not the key secrecy.
 */
export const PUBLIC_CONTENT_KEY = new Uint8Array(32)

/**
 * Sentinel DID in recipients list indicating public access.
 * Hub recognizes this and serves the node to any authenticated user.
 */
export const PUBLIC_RECIPIENT = 'PUBLIC' as DID

// ─── Content Key Operations ───────────────────────────────────────────────────

/**
 * Generate a random 256-bit content key for a node.
 */
export function generateContentKey(): Uint8Array {
  return generateKey()
}

/**
 * Generate an X25519 ephemeral key pair for key wrapping.
 */
function generateX25519KeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const privateKey = randomBytes(32)
  const publicKey = x25519.getPublicKey(privateKey)
  return { publicKey, privateKey }
}

/**
 * Wrap a content key for a specific recipient using X25519 ECDH.
 *
 * @param contentKey - The 32-byte content key to wrap
 * @param recipientX25519PublicKey - Recipient's X25519 public key
 * @returns Wrapped key structure
 */
export function wrapKeyForRecipient(
  contentKey: Uint8Array,
  recipientX25519PublicKey: Uint8Array
): WrappedKey {
  // Generate ephemeral key pair
  const ephemeral = generateX25519KeyPair()

  // Perform ECDH to derive shared secret
  const sharedSecret = x25519.getSharedSecret(ephemeral.privateKey, recipientX25519PublicKey)

  // Encrypt the content key with the shared secret
  const encrypted = encrypt(contentKey, sharedSecret)

  return {
    algorithm: 'X25519-XChaCha20',
    ephemeralPublicKey: ephemeral.publicKey,
    wrappedKey: encrypted.ciphertext,
    nonce: encrypted.nonce
  }
}

/**
 * Unwrap a content key using the recipient's X25519 private key.
 *
 * @param wrapped - The wrapped key structure
 * @param recipientX25519PrivateKey - Recipient's X25519 private key
 * @returns The 32-byte content key
 */
export function unwrapKey(wrapped: WrappedKey, recipientX25519PrivateKey: Uint8Array): Uint8Array {
  // Perform ECDH to derive shared secret
  const sharedSecret = x25519.getSharedSecret(recipientX25519PrivateKey, wrapped.ephemeralPublicKey)

  // Decrypt the content key
  return decrypt({ ciphertext: wrapped.wrappedKey, nonce: wrapped.nonce }, sharedSecret)
}

// ─── Envelope Operations ──────────────────────────────────────────────────────

/**
 * Create the message to sign for envelope integrity.
 */
function createSignatureMessage(envelope: Omit<EncryptedEnvelope, 'signature'>): Uint8Array {
  // Serialize envelope fields (excluding signature) for signing
  const encoder = new TextEncoder()
  const fields = [
    envelope.version.toString(),
    envelope.id,
    envelope.schema,
    envelope.createdBy,
    envelope.createdAt.toString(),
    envelope.updatedAt.toString(),
    envelope.lamport.toString(),
    envelope.recipients.join(','),
    JSON.stringify(envelope.publicProps ?? {}),
    JSON.stringify(Object.keys(envelope.encryptedKeys).sort())
  ]
  return encoder.encode(fields.join('|'))
}

/**
 * Sign an envelope with an Ed25519 key.
 */
function signEnvelope(
  envelope: Omit<EncryptedEnvelope, 'signature'>,
  signingKey: Uint8Array
): Uint8Array {
  const message = createSignatureMessage(envelope)
  return sign(message, signingKey)
}

/**
 * Verify an envelope's signature.
 */
export function verifyEnvelopeSignature(
  envelope: EncryptedEnvelope,
  signingPublicKey: Uint8Array
): boolean {
  const { signature, ...rest } = envelope
  const message = createSignatureMessage(rest)
  return verify(message, signature, signingPublicKey)
}

/**
 * Create an encrypted envelope for node content.
 *
 * @param content - Serialized node content to encrypt
 * @param metadata - Node metadata (id, schema, creator, timestamps)
 * @param recipientPublicKeys - Map of DID -> X25519 public key
 * @param signingKey - Ed25519 private key for signing
 * @param publicProps - Optional properties to leave unencrypted
 * @returns Encrypted envelope
 */
export function createEncryptedEnvelope(
  content: Uint8Array,
  metadata: EnvelopeMetadata,
  recipientPublicKeys: Map<DID, Uint8Array>,
  signingKey: Uint8Array,
  publicProps?: Record<string, unknown>
): EncryptedEnvelope {
  // Generate content key
  const contentKey = generateContentKey()

  // Encrypt content
  const encrypted = encrypt(content, contentKey)

  // Wrap content key for each recipient
  const encryptedKeys: Record<string, WrappedKey> = {}
  for (const [did, pubKey] of recipientPublicKeys) {
    encryptedKeys[did] = wrapKeyForRecipient(contentKey, pubKey)
  }

  // Build envelope without signature
  const envelope: Omit<EncryptedEnvelope, 'signature'> = {
    version: 1,
    id: metadata.id,
    schema: metadata.schema,
    createdBy: metadata.createdBy,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    lamport: metadata.lamport,
    recipients: [...recipientPublicKeys.keys()],
    publicProps,
    encryptedKeys,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce
  }

  // Sign the envelope
  const signature = signEnvelope(envelope, signingKey)

  return { ...envelope, signature }
}

/**
 * Decrypt an envelope's content.
 *
 * @param envelope - The encrypted envelope
 * @param recipientDID - The recipient's DID
 * @param recipientX25519PrivateKey - The recipient's X25519 private key
 * @returns Decrypted content
 * @throws If the recipient doesn't have access
 */
export function decryptEnvelopeContent(
  envelope: EncryptedEnvelope,
  recipientDID: DID,
  recipientX25519PrivateKey: Uint8Array
): Uint8Array {
  // Check if recipient has access
  const wrappedKey = envelope.encryptedKeys[recipientDID]
  if (!wrappedKey) {
    throw new Error(`No wrapped key for recipient ${recipientDID}`)
  }

  // Unwrap the content key
  const contentKey = unwrapKey(wrappedKey, recipientX25519PrivateKey)

  // Decrypt the content
  return decrypt({ ciphertext: envelope.ciphertext, nonce: envelope.nonce }, contentKey)
}

/**
 * Check if an envelope is public.
 */
export function isPublicEnvelope(envelope: EncryptedEnvelope): boolean {
  return envelope.recipients.includes(PUBLIC_RECIPIENT)
}

/**
 * Update an envelope's recipients (for grant/revoke).
 * Requires re-encrypting the content key for new recipients.
 *
 * @param envelope - The existing envelope
 * @param contentKey - The existing content key (must have been decrypted)
 * @param newRecipientPublicKeys - New set of recipient keys
 * @param signingKey - Ed25519 private key for re-signing
 * @returns Updated envelope
 */
export function updateEnvelopeRecipients(
  envelope: EncryptedEnvelope,
  contentKey: Uint8Array,
  newRecipientPublicKeys: Map<DID, Uint8Array>,
  signingKey: Uint8Array
): EncryptedEnvelope {
  // Wrap content key for new recipients
  const encryptedKeys: Record<string, WrappedKey> = {}
  for (const [did, pubKey] of newRecipientPublicKeys) {
    encryptedKeys[did] = wrapKeyForRecipient(contentKey, pubKey)
  }

  // Build updated envelope without signature
  const updated: Omit<EncryptedEnvelope, 'signature'> = {
    ...envelope,
    recipients: [...newRecipientPublicKeys.keys()],
    encryptedKeys,
    updatedAt: Date.now()
  }

  // Re-sign
  const signature = signEnvelope(updated, signingKey)

  return { ...updated, signature }
}
