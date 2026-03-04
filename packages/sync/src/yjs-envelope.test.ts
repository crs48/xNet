/**
 * Tests for Signed Yjs Envelopes (V1 and V2 formats)
 */

import {
  generateIdentity,
  createKeyBundle,
  MemoryPQKeyRegistry,
  createPQKeyAttestation
} from '@xnetjs/identity'
import { describe, it, expect } from 'vitest'
import {
  signYjsUpdate,
  signYjsUpdateV1,
  signYjsUpdateV2,
  signYjsUpdateBatch,
  verifyYjsEnvelope,
  verifyYjsEnvelopeV1,
  verifyYjsEnvelopeV2,
  verifyYjsEnvelopeQuick,
  serializeYjsEnvelope,
  deserializeYjsEnvelope,
  envelopeSize,
  isV1Envelope,
  isV2Envelope,
  hasSignedEnvelope,
  isLegacyUpdate,
  type SignedYjsEnvelopeV1,
  type SignedYjsEnvelopeV2
} from './yjs-envelope'

// ─── V1 Tests (Legacy) ────────────────────────────────────────

describe('V1: signYjsUpdate', () => {
  it('produces valid envelope with correct fields', () => {
    const { identity, privateKey } = generateIdentity()
    const update = new Uint8Array([1, 2, 3, 4])
    const envelope = signYjsUpdateV1(update, identity.did, privateKey, 12345)

    expect(envelope.authorDID).toBe(identity.did)
    expect(envelope.update).toEqual(update)
    expect(envelope.clientId).toBe(12345)
    expect(envelope.timestamp).toBeCloseTo(Date.now(), -2)
    expect(envelope.signature).toBeInstanceOf(Uint8Array)
    expect(envelope.signature.length).toBe(64) // Ed25519 signature
  })

  it('produces different signatures for different updates', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope1 = signYjsUpdateV1(new Uint8Array([1, 2, 3]), identity.did, privateKey, 1)
    const envelope2 = signYjsUpdateV1(new Uint8Array([4, 5, 6]), identity.did, privateKey, 1)

    expect(envelope1.signature).not.toEqual(envelope2.signature)
  })

  it('produces different signatures for same update with different keys', () => {
    const { identity: id1, privateKey: key1 } = generateIdentity()
    const { identity: id2, privateKey: key2 } = generateIdentity()
    const update = new Uint8Array([1, 2, 3])

    const envelope1 = signYjsUpdateV1(update, id1.did, key1, 1)
    const envelope2 = signYjsUpdateV1(update, id2.did, key2, 1)

    expect(envelope1.signature).not.toEqual(envelope2.signature)
  })
})

describe('V1: verifyYjsEnvelope', () => {
  it('accepts correctly signed envelope', () => {
    const { identity, privateKey } = generateIdentity()
    const update = new Uint8Array([1, 2, 3])
    const envelope = signYjsUpdateV1(update, identity.did, privateKey, 1)

    const result = verifyYjsEnvelopeV1(envelope)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('rejects envelope with tampered update', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdateV1(new Uint8Array([1, 2, 3]), identity.did, privateKey, 1)
    envelope.update = new Uint8Array([9, 9, 9]) // tamper

    const result = verifyYjsEnvelopeV1(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects envelope with wrong DID (key mismatch)', () => {
    const { privateKey: key1 } = generateIdentity()
    const { identity: id2 } = generateIdentity()

    // Sign with key1 but claim to be id2
    const envelope = signYjsUpdateV1(new Uint8Array([1]), id2.did, key1, 1)

    const result = verifyYjsEnvelopeV1(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects envelope with tampered signature', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdateV1(new Uint8Array([1, 2, 3]), identity.did, privateKey, 1)

    // Tamper with signature
    envelope.signature = new Uint8Array(64).fill(0)

    const result = verifyYjsEnvelopeV1(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects envelope with invalid DID format', () => {
    const envelope: SignedYjsEnvelopeV1 = {
      update: new Uint8Array([1]),
      authorDID: 'did:key:invalid',
      signature: new Uint8Array(64),
      timestamp: Date.now(),
      clientId: 1
    }

    const result = verifyYjsEnvelopeV1(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('did_resolution_failed')
  })

  it('rejects envelope with non-DID string', () => {
    const envelope: SignedYjsEnvelopeV1 = {
      update: new Uint8Array([1]),
      authorDID: 'not-a-did',
      signature: new Uint8Array(64),
      timestamp: Date.now(),
      clientId: 1
    }

    const result = verifyYjsEnvelopeV1(envelope)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('did_resolution_failed')
  })

  it('handles empty update', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdateV1(new Uint8Array([]), identity.did, privateKey, 1)

    const result = verifyYjsEnvelopeV1(envelope)
    expect(result.valid).toBe(true)
  })

  it('handles large update', () => {
    const { identity, privateKey } = generateIdentity()
    const largeUpdate = new Uint8Array(100_000).fill(42)
    const envelope = signYjsUpdateV1(largeUpdate, identity.did, privateKey, 1)

    const result = verifyYjsEnvelopeV1(envelope)
    expect(result.valid).toBe(true)
  })
})

// ─── V2 Tests (Multi-Level Signatures) ────────────────────────

describe('V2: signYjsUpdateV2', () => {
  it('creates Level 0 envelope with Ed25519 only', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3, 4])

    const envelope = signYjsUpdateV2(update, 'doc-1', 12345, bundle, { level: 0 })

    expect(envelope.v).toBe(2)
    expect(envelope.update).toEqual(update)
    expect(envelope.meta.authorDID).toBe(bundle.identity.did)
    expect(envelope.meta.clientId).toBe(12345)
    expect(envelope.meta.docId).toBe('doc-1')
    expect(envelope.signature.level).toBe(0)
    expect(envelope.signature.ed25519).toBeDefined()
    expect(envelope.signature.mlDsa).toBeUndefined()
  })

  it('creates Level 1 envelope with Ed25519 + ML-DSA', () => {
    const bundle = createKeyBundle({ includePQ: true })
    const update = new Uint8Array([1, 2, 3, 4])

    const envelope = signYjsUpdateV2(update, 'doc-1', 12345, bundle, { level: 1 })

    expect(envelope.v).toBe(2)
    expect(envelope.signature.level).toBe(1)
    expect(envelope.signature.ed25519).toBeDefined()
    expect(envelope.signature.mlDsa).toBeDefined()
  })

  it('creates Level 2 envelope with ML-DSA only', () => {
    const bundle = createKeyBundle({ includePQ: true })
    const update = new Uint8Array([1, 2, 3, 4])

    const envelope = signYjsUpdateV2(update, 'doc-1', 12345, bundle, { level: 2 })

    expect(envelope.v).toBe(2)
    expect(envelope.signature.level).toBe(2)
    expect(envelope.signature.ed25519).toBeUndefined()
    expect(envelope.signature.mlDsa).toBeDefined()
  })

  it('includes timestamp in metadata', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])
    const before = Date.now()

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle)

    const after = Date.now()
    expect(envelope.meta.timestamp).toBeGreaterThanOrEqual(before)
    expect(envelope.meta.timestamp).toBeLessThanOrEqual(after)
  })
})

describe('V2: signYjsUpdateBatch', () => {
  it('signs multiple updates', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const updates = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]

    const envelopes = signYjsUpdateBatch(updates, 'doc-1', 12345, bundle, { level: 0 })

    expect(envelopes).toHaveLength(3)
    envelopes.forEach((env, i) => {
      expect(env.v).toBe(2)
      expect(env.update).toEqual(updates[i])
      expect(env.meta.docId).toBe('doc-1')
      expect(env.meta.clientId).toBe(12345)
    })
  })
})

describe('V2: verifyYjsEnvelopeV2', () => {
  it('verifies Level 0 envelope', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })

    const result = await verifyYjsEnvelopeV2(envelope)
    expect(result.valid).toBe(true)
    expect(result.level).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(result.authorDID).toBe(bundle.identity.did)
    expect(result.clientId).toBe(1)
  })

  it('verifies Level 1 envelope with registry', async () => {
    const bundle = createKeyBundle({ includePQ: true })
    const registry = new MemoryPQKeyRegistry()

    // Register PQ key
    const attestation = createPQKeyAttestation(
      bundle.identity.did,
      bundle.signingKey,
      bundle.pqPublicKey!,
      bundle.pqSigningKey!
    )
    await registry.store(attestation)

    const update = new Uint8Array([1, 2, 3])
    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 1 })

    const result = await verifyYjsEnvelopeV2(envelope, { registry })
    expect(result.valid).toBe(true)
    expect(result.level).toBe(1)
  })

  it('rejects tampered update', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })
    envelope.update[0] ^= 0xff // Tamper

    const result = await verifyYjsEnvelopeV2(envelope)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects tampered metadata', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })
    envelope.meta.clientId = 999 // Tamper

    const result = await verifyYjsEnvelopeV2(envelope)
    expect(result.valid).toBe(false)
  })

  it('checks document ID match', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })

    const result = await verifyYjsEnvelopeV2(envelope, { expectedDocId: 'doc-2' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Document ID mismatch'))).toBe(true)
  })

  it('checks freshness (maxAge)', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })
    // Make envelope appear old
    envelope.meta.timestamp = Date.now() - 10000

    const result = await verifyYjsEnvelopeV2(envelope, { maxAge: 5000 })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('too old')
  })

  it('enforces minLevel', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })

    const result = await verifyYjsEnvelopeV2(envelope, { minLevel: 1 })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Security level too low'))).toBe(true)
  })

  it('rejects invalid DID', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(envelope.meta as any).authorDID = 'invalid-did'

    const result = await verifyYjsEnvelopeV2(envelope)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Failed to parse author DID')
  })
})

describe('V2: verifyYjsEnvelopeQuick', () => {
  it('returns true for valid envelope', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })

    const valid = await verifyYjsEnvelopeQuick(envelope)
    expect(valid).toBe(true)
  })

  it('returns false for invalid envelope', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })
    envelope.update[0] ^= 0xff // Tamper

    const valid = await verifyYjsEnvelopeQuick(envelope)
    expect(valid).toBe(false)
  })
})

// ─── Serialization Tests ──────────────────────────────────────

describe('V2: serialization', () => {
  it('round-trips through serialize/deserialize', () => {
    const bundle = createKeyBundle({ includePQ: true })
    const update = new Uint8Array([1, 2, 3, 4, 5])

    const envelope = signYjsUpdateV2(update, 'doc-1', 12345, bundle, { level: 1 })

    const wire = serializeYjsEnvelope(envelope)
    const restored = deserializeYjsEnvelope(wire)

    expect(restored.v).toBe(2)
    expect(restored.update).toEqual(envelope.update)
    expect(restored.meta).toEqual(envelope.meta)
    expect(restored.signature.level).toBe(envelope.signature.level)
    expect(restored.signature.ed25519).toEqual(envelope.signature.ed25519)
    expect(restored.signature.mlDsa).toEqual(envelope.signature.mlDsa)
  })

  it('creates valid JSON wire format', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })

    const wire = serializeYjsEnvelope(envelope)

    expect(wire.v).toBe(2)
    expect(typeof wire.u).toBe('string') // base64 encoded
    expect(wire.m.a).toBe(bundle.identity.did)
    expect(wire.m.c).toBe(1)
    expect(wire.m.d).toBe('doc-1')
    expect(wire.s.l).toBe(0)
  })

  it('rejects invalid version on deserialize', () => {
    const wire = { v: 999, u: '', m: { a: '', c: 0, t: 0, d: '' }, s: { l: 0 } }

    expect(() => deserializeYjsEnvelope(wire as unknown as never)).toThrow('Unsupported envelope')
  })

  it('verified envelope survives serialization', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([10, 20, 30])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })
    const wire = serializeYjsEnvelope(envelope)
    const restored = deserializeYjsEnvelope(wire)

    const result = await verifyYjsEnvelopeV2(restored)
    expect(result.valid).toBe(true)
  })
})

describe('V2: envelopeSize', () => {
  it('calculates size for Level 0', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array(100)

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 0 })
    const size = envelopeSize(envelope)

    // Update (100) + meta (~80-100) + Ed25519 sig (64)
    expect(size).toBeGreaterThan(200)
    expect(size).toBeLessThan(400)
  })

  it('calculates size for Level 1 (much larger due to ML-DSA)', () => {
    const bundle = createKeyBundle({ includePQ: true })
    const update = new Uint8Array(100)

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle, { level: 1 })
    const size = envelopeSize(envelope)

    // Level 1 includes ML-DSA (~3.3KB)
    expect(size).toBeGreaterThan(3000)
  })
})

// ─── Type Guards ──────────────────────────────────────────────

describe('isV1Envelope / isV2Envelope', () => {
  it('identifies V1 envelope', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdateV1(new Uint8Array([1]), identity.did, privateKey, 1)

    expect(isV1Envelope(envelope)).toBe(true)
    expect(isV2Envelope(envelope)).toBe(false)
  })

  it('identifies V2 envelope', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const envelope = signYjsUpdateV2(new Uint8Array([1]), 'doc-1', 1, bundle)

    expect(isV1Envelope(envelope)).toBe(false)
    expect(isV2Envelope(envelope)).toBe(true)
  })
})

describe('hasSignedEnvelope', () => {
  it('returns true for message with V1 envelope', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdateV1(new Uint8Array([1]), identity.did, privateKey, 1)

    expect(hasSignedEnvelope({ type: 'sync-update', room: 'test', envelope })).toBe(true)
  })

  it('returns true for message with V2 envelope', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const envelope = signYjsUpdateV2(new Uint8Array([1]), 'doc-1', 1, bundle)

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
})

describe('isLegacyUpdate', () => {
  it('returns true for legacy message with data', () => {
    expect(isLegacyUpdate({ type: 'sync-update', room: 'test', data: new Uint8Array([1]) })).toBe(
      true
    )
  })

  it('returns false for message with envelope', () => {
    const { identity, privateKey } = generateIdentity()
    const envelope = signYjsUpdateV1(new Uint8Array([1]), identity.did, privateKey, 1)

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

// ─── Unified API Tests ────────────────────────────────────────

describe('signYjsUpdate (unified)', () => {
  it('creates V1 envelope with legacy signature', () => {
    const { identity, privateKey } = generateIdentity()
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdate(update, identity.did, privateKey, 1)

    expect(isV1Envelope(envelope)).toBe(true)
    expect((envelope as SignedYjsEnvelopeV1).authorDID).toBe(identity.did)
  })

  it('creates V2 envelope with key bundle', () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdate(update, 'doc-1', 1, bundle)

    expect(isV2Envelope(envelope)).toBe(true)
    expect((envelope as SignedYjsEnvelopeV2).meta.authorDID).toBe(bundle.identity.did)
  })
})

describe('verifyYjsEnvelope (unified)', () => {
  it('verifies V1 envelope synchronously', () => {
    const { identity, privateKey } = generateIdentity()
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV1(update, identity.did, privateKey, 1)

    const result = verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(true)
  })

  it('verifies V2 envelope asynchronously', async () => {
    const bundle = createKeyBundle({ includePQ: false })
    const update = new Uint8Array([1, 2, 3])

    const envelope = signYjsUpdateV2(update, 'doc-1', 1, bundle)

    const result = await verifyYjsEnvelope(envelope)
    expect(result.valid).toBe(true)
  })
})
