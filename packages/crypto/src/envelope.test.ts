/**
 * Tests for encrypted envelopes.
 */
import type { DID } from './key-resolution'
import { ed25519 } from '@noble/curves/ed25519.js'
import { describe, it, expect } from 'vitest'
import {
  generateContentKey,
  wrapKeyForRecipient,
  unwrapKey,
  createEncryptedEnvelope,
  decryptEnvelopeContent,
  verifyEnvelopeSignature,
  updateEnvelopeRecipients,
  isPublicEnvelope,
  PUBLIC_CONTENT_KEY,
  PUBLIC_RECIPIENT,
  type EnvelopeMetadata
} from './envelope'
import {
  ed25519ToX25519,
  ed25519PrivToX25519,
  createDIDFromEd25519PublicKey
} from './key-resolution'
import { generateSigningKeyPair } from './signing'
import { bytesToHex } from './utils'

describe('envelope', () => {
  describe('generateContentKey', () => {
    it('generates a 32-byte key', () => {
      const key = generateContentKey()
      expect(key.length).toBe(32)
    })

    it('generates unique keys', () => {
      const key1 = generateContentKey()
      const key2 = generateContentKey()
      expect(bytesToHex(key1)).not.toBe(bytesToHex(key2))
    })
  })

  describe('wrapKeyForRecipient / unwrapKey', () => {
    it('wraps and unwraps a content key', () => {
      const contentKey = generateContentKey()

      // Generate recipient keys
      const ed25519PrivKey = new Uint8Array(32).fill(42)
      const ed25519PubKey = ed25519.getPublicKey(ed25519PrivKey)
      const x25519PubKey = ed25519ToX25519(ed25519PubKey)
      const x25519PrivKey = ed25519PrivToX25519(ed25519PrivKey)

      // Wrap
      const wrapped = wrapKeyForRecipient(contentKey, x25519PubKey)

      expect(wrapped.algorithm).toBe('X25519-XChaCha20')
      expect(wrapped.ephemeralPublicKey.length).toBe(32)
      expect(wrapped.wrappedKey.length).toBeGreaterThan(0)
      expect(wrapped.nonce.length).toBe(24) // XChaCha20 nonce

      // Unwrap
      const unwrapped = unwrapKey(wrapped, x25519PrivKey)
      expect(bytesToHex(unwrapped)).toBe(bytesToHex(contentKey))
    })

    it('wrapped key cannot be unwrapped with wrong private key', () => {
      const contentKey = generateContentKey()

      // Recipient 1 keys
      const ed25519PrivKey1 = new Uint8Array(32).fill(42)
      const ed25519PubKey1 = ed25519.getPublicKey(ed25519PrivKey1)
      const x25519PubKey1 = ed25519ToX25519(ed25519PubKey1)

      // Recipient 2 keys (different)
      const ed25519PrivKey2 = new Uint8Array(32).fill(43)
      const x25519PrivKey2 = ed25519PrivToX25519(ed25519PrivKey2)

      // Wrap for recipient 1
      const wrapped = wrapKeyForRecipient(contentKey, x25519PubKey1)

      // Try to unwrap with recipient 2's key - should fail
      expect(() => unwrapKey(wrapped, x25519PrivKey2)).toThrow()
    })
  })

  describe('createEncryptedEnvelope / decryptEnvelopeContent', () => {
    function createTestRecipient(seed: number) {
      const ed25519PrivKey = new Uint8Array(32).fill(seed)
      const ed25519PubKey = ed25519.getPublicKey(ed25519PrivKey)
      const x25519PubKey = ed25519ToX25519(ed25519PubKey)
      const x25519PrivKey = ed25519PrivToX25519(ed25519PrivKey)
      const did = createDIDFromEd25519PublicKey(ed25519PubKey)
      return { did, ed25519PrivKey, ed25519PubKey, x25519PubKey, x25519PrivKey }
    }

    it('creates and decrypts an envelope for a single recipient', () => {
      const alice = createTestRecipient(1)
      const { privateKey: signingKey } = generateSigningKeyPair()

      const content = new TextEncoder().encode('Hello, World!')
      const metadata: EnvelopeMetadata = {
        id: 'node-1',
        schema: 'xnet://test/Thing@1.0.0' as const,
        createdBy: alice.did,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lamport: 1
      }

      const recipientKeys = new Map<DID, Uint8Array>()
      recipientKeys.set(alice.did, alice.x25519PubKey)

      const envelope = createEncryptedEnvelope(content, metadata, recipientKeys, signingKey)

      expect(envelope.version).toBe(1)
      expect(envelope.id).toBe('node-1')
      expect(envelope.recipients).toContain(alice.did)
      expect(envelope.encryptedKeys[alice.did]).toBeDefined()
      expect(envelope.signature.length).toBe(64) // Ed25519 signature

      // Decrypt
      const decrypted = decryptEnvelopeContent(envelope, alice.did, alice.x25519PrivKey)
      expect(new TextDecoder().decode(decrypted)).toBe('Hello, World!')
    })

    it('creates envelope for multiple recipients', () => {
      const alice = createTestRecipient(1)
      const bob = createTestRecipient(2)
      const { privateKey: signingKey } = generateSigningKeyPair()

      const content = new TextEncoder().encode('Secret message')
      const metadata: EnvelopeMetadata = {
        id: 'node-2',
        schema: 'xnet://test/Thing@1.0.0' as const,
        createdBy: alice.did,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lamport: 1
      }

      const recipientKeys = new Map<DID, Uint8Array>()
      recipientKeys.set(alice.did, alice.x25519PubKey)
      recipientKeys.set(bob.did, bob.x25519PubKey)

      const envelope = createEncryptedEnvelope(content, metadata, recipientKeys, signingKey)

      expect(envelope.recipients).toHaveLength(2)
      expect(envelope.recipients).toContain(alice.did)
      expect(envelope.recipients).toContain(bob.did)

      // Both can decrypt
      const decryptedByAlice = decryptEnvelopeContent(envelope, alice.did, alice.x25519PrivKey)
      const decryptedByBob = decryptEnvelopeContent(envelope, bob.did, bob.x25519PrivKey)

      expect(new TextDecoder().decode(decryptedByAlice)).toBe('Secret message')
      expect(new TextDecoder().decode(decryptedByBob)).toBe('Secret message')
    })

    it('non-recipient cannot decrypt', () => {
      const alice = createTestRecipient(1)
      const carol = createTestRecipient(3)
      const { privateKey: signingKey } = generateSigningKeyPair()

      const content = new TextEncoder().encode('Secret')
      const metadata: EnvelopeMetadata = {
        id: 'node-3',
        schema: 'xnet://test/Thing@1.0.0' as const,
        createdBy: alice.did,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lamport: 1
      }

      const recipientKeys = new Map<DID, Uint8Array>()
      recipientKeys.set(alice.did, alice.x25519PubKey)

      const envelope = createEncryptedEnvelope(content, metadata, recipientKeys, signingKey)

      // Carol is not a recipient
      expect(() => decryptEnvelopeContent(envelope, carol.did, carol.x25519PrivKey)).toThrow(
        `No wrapped key for recipient ${carol.did}`
      )
    })
  })

  describe('verifyEnvelopeSignature', () => {
    it('verifies valid signature', () => {
      const alice = createTestRecipient(1)
      const { privateKey: signingKey, publicKey: signingPubKey } = generateSigningKeyPair()

      const content = new TextEncoder().encode('Test')
      const metadata: EnvelopeMetadata = {
        id: 'node-4',
        schema: 'xnet://test/Thing@1.0.0' as const,
        createdBy: alice.did,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lamport: 1
      }

      const recipientKeys = new Map<DID, Uint8Array>()
      recipientKeys.set(alice.did, alice.x25519PubKey)

      const envelope = createEncryptedEnvelope(content, metadata, recipientKeys, signingKey)

      expect(verifyEnvelopeSignature(envelope, signingPubKey)).toBe(true)
    })

    it('rejects tampered envelope', () => {
      const alice = createTestRecipient(1)
      const { privateKey: signingKey, publicKey: signingPubKey } = generateSigningKeyPair()

      const content = new TextEncoder().encode('Test')
      const metadata: EnvelopeMetadata = {
        id: 'node-5',
        schema: 'xnet://test/Thing@1.0.0' as const,
        createdBy: alice.did,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lamport: 1
      }

      const recipientKeys = new Map<DID, Uint8Array>()
      recipientKeys.set(alice.did, alice.x25519PubKey)

      const envelope = createEncryptedEnvelope(content, metadata, recipientKeys, signingKey)

      // Tamper with the envelope
      envelope.lamport = 999

      expect(verifyEnvelopeSignature(envelope, signingPubKey)).toBe(false)
    })

    it('rejects wrong public key', () => {
      const alice = createTestRecipient(1)
      const { privateKey: signingKey } = generateSigningKeyPair()
      const { publicKey: wrongPubKey } = generateSigningKeyPair()

      const content = new TextEncoder().encode('Test')
      const metadata: EnvelopeMetadata = {
        id: 'node-6',
        schema: 'xnet://test/Thing@1.0.0' as const,
        createdBy: alice.did,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lamport: 1
      }

      const recipientKeys = new Map<DID, Uint8Array>()
      recipientKeys.set(alice.did, alice.x25519PubKey)

      const envelope = createEncryptedEnvelope(content, metadata, recipientKeys, signingKey)

      expect(verifyEnvelopeSignature(envelope, wrongPubKey)).toBe(false)
    })
  })

  describe('updateEnvelopeRecipients', () => {
    it('adds a new recipient', () => {
      const alice = createTestRecipient(1)
      const bob = createTestRecipient(2)
      const { privateKey: signingKey, publicKey: signingPubKey } = generateSigningKeyPair()

      const content = new TextEncoder().encode('Test')
      const contentKey = generateContentKey()
      const metadata: EnvelopeMetadata = {
        id: 'node-7',
        schema: 'xnet://test/Thing@1.0.0' as const,
        createdBy: alice.did,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lamport: 1
      }

      // Create with just Alice
      const recipientKeys1 = new Map<DID, Uint8Array>()
      recipientKeys1.set(alice.did, alice.x25519PubKey)
      const envelope1 = createEncryptedEnvelope(content, metadata, recipientKeys1, signingKey)

      // Update to add Bob
      const recipientKeys2 = new Map<DID, Uint8Array>()
      recipientKeys2.set(alice.did, alice.x25519PubKey)
      recipientKeys2.set(bob.did, bob.x25519PubKey)

      // We need to get the content key to update - normally this comes from decryption
      // For this test, we create a new envelope with the same content key
      const envelope2 = updateEnvelopeRecipients(envelope1, contentKey, recipientKeys2, signingKey)

      expect(envelope2.recipients).toHaveLength(2)
      expect(envelope2.recipients).toContain(bob.did)
      expect(verifyEnvelopeSignature(envelope2, signingPubKey)).toBe(true)
    })

    it('prevents revoked recipients from decrypting after key rotation', () => {
      const alice = createTestRecipient(11)
      const bob = createTestRecipient(12)
      const { privateKey: signingKey } = generateSigningKeyPair()

      const oldContent = new TextEncoder().encode('Before revocation')
      const metadata: EnvelopeMetadata = {
        id: 'node-rotate-1',
        schema: 'xnet://test/Thing@1.0.0' as const,
        createdBy: alice.did,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lamport: 1
      }

      const initialRecipients = new Map<DID, Uint8Array>()
      initialRecipients.set(alice.did, alice.x25519PubKey)
      initialRecipients.set(bob.did, bob.x25519PubKey)
      const initialEnvelope = createEncryptedEnvelope(
        oldContent,
        metadata,
        initialRecipients,
        signingKey
      )

      const before = decryptEnvelopeContent(initialEnvelope, bob.did, bob.x25519PrivKey)
      expect(new TextDecoder().decode(before)).toBe('Before revocation')

      const rotatedContentKey = generateContentKey()
      const rotatedRecipients = new Map<DID, Uint8Array>()
      rotatedRecipients.set(alice.did, alice.x25519PubKey)
      const rotatedEnvelope = updateEnvelopeRecipients(
        initialEnvelope,
        rotatedContentKey,
        rotatedRecipients,
        signingKey
      )

      expect(() => decryptEnvelopeContent(rotatedEnvelope, bob.did, bob.x25519PrivKey)).toThrow(
        `No wrapped key for recipient ${bob.did}`
      )
    })
  })

  describe('PUBLIC_CONTENT_KEY', () => {
    it('is all zeros', () => {
      expect(PUBLIC_CONTENT_KEY.length).toBe(32)
      expect(PUBLIC_CONTENT_KEY.every((b) => b === 0)).toBe(true)
    })
  })

  describe('PUBLIC_RECIPIENT', () => {
    it('is the string PUBLIC', () => {
      expect(PUBLIC_RECIPIENT).toBe('PUBLIC')
    })
  })

  describe('isPublicEnvelope', () => {
    it('returns true for envelope with PUBLIC recipient', () => {
      const envelope = {
        recipients: [PUBLIC_RECIPIENT, 'did:key:z6MkTest' as DID]
      } as unknown as { recipients: DID[] }

      expect(isPublicEnvelope(envelope as ReturnType<typeof createEncryptedEnvelope>)).toBe(true)
    })

    it('returns false for private envelope', () => {
      const envelope = {
        recipients: ['did:key:z6MkTest' as DID]
      } as unknown as { recipients: DID[] }

      expect(isPublicEnvelope(envelope as ReturnType<typeof createEncryptedEnvelope>)).toBe(false)
    })
  })

  // Helper to create test recipients
  function createTestRecipient(seed: number) {
    const ed25519PrivKey = new Uint8Array(32).fill(seed)
    const ed25519PubKey = ed25519.getPublicKey(ed25519PrivKey)
    const x25519PubKey = ed25519ToX25519(ed25519PubKey)
    const x25519PrivKey = ed25519PrivToX25519(ed25519PrivKey)
    const did = createDIDFromEd25519PublicKey(ed25519PubKey)
    return { did, ed25519PrivKey, ed25519PubKey, x25519PubKey, x25519PrivKey }
  }
})
