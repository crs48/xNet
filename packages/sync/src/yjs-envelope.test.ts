/**
 * Tests for Signed Yjs Envelopes
 */

import { generateIdentity } from '@xnet/identity'
import { describe, it, expect } from 'vitest'
import {
  signYjsUpdate,
  verifyYjsEnvelope,
  hasSignedEnvelope,
  isLegacyUpdate,
  type SignedYjsEnvelope
} from './yjs-envelope'

describe('signYjsUpdate', () => {
  it('produces valid envelope with correct fields', () => {
    const { identity, privateKey } = generateIdentity()
    const update = new Uint8Array([1, 2, 3, 4])
    const envelope = signYjsUpdate(update, identity.did, privateKey, 12345)

    expect(envelope.authorDID).toBe(identity.did)
    expect(envelope.update).toEqual(update)
    expect(envelope.clientId).toBe(12345)
    expect(envelope.timestamp).toBeCloseTo(Date.now(), -2)
    expect(envelope.signature).toBeInstanceOf(Uint8Array)
    expect(envelope.signature.length).toBe(64) // Ed25519 signature
  })

  it('produces different signatures for different updates', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope1 = signYjsUpdate(new Uint8Array([1, 2, 3]), identity.did, privateKey, 1)
    const envelope2 = signYjsUpdate(new Uint8Array([4, 5, 6]), identity.did, privateKey, 1)

    expect(envelope1.signature).not.toEqual(envelope2.signature)
  })

  it('produces different signatures for same update with different keys', () => {
    const { identity: id1, privateKey: key1 } = generateIdentity()
    const { identity: id2, privateKey: key2 } = generateIdentity()
    const update = new Uint8Array([1, 2, 3])

    const envelope1 = signYjsUpdate(update, id1.did, key1, 1)
    const envelope2 = signYjsUpdate(update, id2.did, key2, 1)

    expect(envelope1.signature).not.toEqual(envelope2.signature)
  })
})

describe('verifyYjsEnvelope', () => {
  it('accepts correctly signed envelope', () => {
    const { identity, privateKey } = generateIdentity()
    const update = new Uint8Array([1, 2, 3])
    const envelope = signYjsUpdate(update, identity.did, privateKey, 1)

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('rejects envelope with tampered update', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdate(new Uint8Array([1, 2, 3]), identity.did, privateKey, 1)
    envelope.update = new Uint8Array([9, 9, 9]) // tamper

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects envelope with wrong DID (key mismatch)', () => {
    const { privateKey: key1 } = generateIdentity()
    const { identity: id2 } = generateIdentity()

    // Sign with key1 but claim to be id2
    const envelope = signYjsUpdate(new Uint8Array([1]), id2.did, key1, 1)

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects envelope with tampered signature', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdate(new Uint8Array([1, 2, 3]), identity.did, privateKey, 1)

    // Tamper with signature
    envelope.signature = new Uint8Array(64).fill(0)

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects envelope with invalid DID format', () => {
    const envelope: SignedYjsEnvelope = {
      update: new Uint8Array([1]),
      authorDID: 'did:key:invalid',
      signature: new Uint8Array(64),
      timestamp: Date.now(),
      clientId: 1
    }

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('did_resolution_failed')
  })

  it('rejects envelope with non-DID string', () => {
    const envelope: SignedYjsEnvelope = {
      update: new Uint8Array([1]),
      authorDID: 'not-a-did',
      signature: new Uint8Array(64),
      timestamp: Date.now(),
      clientId: 1
    }

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('did_resolution_failed')
  })

  it('handles empty update', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdate(new Uint8Array([]), identity.did, privateKey, 1)

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(true)
  })

  it('handles large update', () => {
    const { identity, privateKey } = generateIdentity()
    const largeUpdate = new Uint8Array(100_000).fill(42)
    const envelope = signYjsUpdate(largeUpdate, identity.did, privateKey, 1)

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(true)
  })
})

describe('hasSignedEnvelope', () => {
  it('returns true for message with envelope', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdate(new Uint8Array([1]), identity.did, privateKey, 1)

    expect(hasSignedEnvelope({ type: 'sync-update', room: 'test', envelope })).toBe(true)
  })

  it('returns false for message without envelope', () => {
    expect(
      hasSignedEnvelope({ type: 'sync-update', room: 'test', data: new Uint8Array([1]) })
    ).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(hasSignedEnvelope(null)).toBe(false)
    expect(hasSignedEnvelope(undefined)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(hasSignedEnvelope('string')).toBe(false)
    expect(hasSignedEnvelope(123)).toBe(false)
  })

  it('returns false for envelope missing required fields', () => {
    expect(hasSignedEnvelope({ envelope: { update: new Uint8Array() } })).toBe(false)
    expect(hasSignedEnvelope({ envelope: { authorDID: 'did:key:z...' } })).toBe(false)
  })
})

describe('isLegacyUpdate', () => {
  it('returns true for legacy message with data', () => {
    expect(isLegacyUpdate({ type: 'sync-update', room: 'test', data: new Uint8Array([1]) })).toBe(
      true
    )
  })

  it('returns false for message with envelope', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdate(new Uint8Array([1]), identity.did, privateKey, 1)

    expect(isLegacyUpdate({ type: 'sync-update', room: 'test', envelope })).toBe(false)
  })

  it('returns false if data is not Uint8Array', () => {
    expect(isLegacyUpdate({ type: 'sync-update', room: 'test', data: [1, 2, 3] })).toBe(false)
    expect(isLegacyUpdate({ type: 'sync-update', room: 'test', data: 'string' })).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isLegacyUpdate(null)).toBe(false)
    expect(isLegacyUpdate(undefined)).toBe(false)
  })
})
