import type { LamportTimestamp } from './clock'
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { describe, it, expect } from 'vitest'
import {
  createUnsignedChange,
  computeChangeHash,
  signChange,
  verifyChange,
  verifyChangeHash,
  createChangeId
} from './change'

describe('Change', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
  const testLamport: LamportTimestamp = { time: 1, author: testDID }

  describe('createUnsignedChange', () => {
    it('creates an unsigned change with provided values', () => {
      const unsigned = createUnsignedChange({
        id: 'test-1',
        type: 'test',
        payload: { data: 'hello' },
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      expect(unsigned.id).toBe('test-1')
      expect(unsigned.type).toBe('test')
      expect(unsigned.payload).toEqual({ data: 'hello' })
      expect(unsigned.parentHash).toBeNull()
      expect(unsigned.authorDID).toBe(testDID)
      expect(unsigned.lamport).toEqual(testLamport)
      expect(unsigned.wallTime).toBe(1000)
    })

    it('uses current timestamp when wallTime not provided', () => {
      const before = Date.now()
      const unsigned = createUnsignedChange({
        id: 'test-2',
        type: 'test',
        payload: {},
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport
      })
      const after = Date.now()

      expect(unsigned.wallTime).toBeGreaterThanOrEqual(before)
      expect(unsigned.wallTime).toBeLessThanOrEqual(after)
    })
  })

  describe('computeChangeHash', () => {
    it('produces consistent hashes for same input', () => {
      const unsigned = createUnsignedChange({
        id: 'test-hash',
        type: 'test',
        payload: { value: 42 },
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const hash1 = computeChangeHash(unsigned)
      const hash2 = computeChangeHash(unsigned)

      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^cid:blake3:[a-f0-9]+$/)
    })

    it('produces different hashes for different inputs', () => {
      const unsigned1 = createUnsignedChange({
        id: 'test-1',
        type: 'test',
        payload: { value: 1 },
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const unsigned2 = createUnsignedChange({
        id: 'test-2',
        type: 'test',
        payload: { value: 2 },
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const hash1 = computeChangeHash(unsigned1)
      const hash2 = computeChangeHash(unsigned2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('signChange', () => {
    it('signs and produces a valid change', () => {
      const keyPair = generateSigningKeyPair()
      const unsigned = createUnsignedChange({
        id: 'test-sign',
        type: 'test',
        payload: { data: 'sign me' },
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const signed = signChange(unsigned, keyPair.privateKey)

      expect(signed.id).toBe(unsigned.id)
      expect(signed.type).toBe(unsigned.type)
      expect(signed.payload).toEqual(unsigned.payload)
      expect(signed.hash).toMatch(/^cid:blake3:/)
      expect(signed.signature).toBeInstanceOf(Uint8Array)
      expect(signed.signature.length).toBe(64) // Ed25519 signatures are 64 bytes
    })
  })

  describe('verifyChange', () => {
    it('verifies a valid signature', () => {
      const keyPair = generateSigningKeyPair()
      const unsigned = createUnsignedChange({
        id: 'test-verify',
        type: 'test',
        payload: { data: 'verify me' },
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const signed = signChange(unsigned, keyPair.privateKey)
      const valid = verifyChange(signed, keyPair.publicKey)

      expect(valid).toBe(true)
    })

    it('rejects signature from wrong key', () => {
      const keyPair1 = generateSigningKeyPair()
      const keyPair2 = generateSigningKeyPair()

      const unsigned = createUnsignedChange({
        id: 'test-wrong-key',
        type: 'test',
        payload: {},
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const signed = signChange(unsigned, keyPair1.privateKey)
      const valid = verifyChange(signed, keyPair2.publicKey)

      expect(valid).toBe(false)
    })

    it('rejects invalid signature', () => {
      const keyPair = generateSigningKeyPair()
      const unsigned = createUnsignedChange({
        id: 'test-invalid',
        type: 'test',
        payload: {},
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const signed = signChange(unsigned, keyPair.privateKey)
      const tampered = { ...signed, signature: new Uint8Array(64) }
      const valid = verifyChange(tampered, keyPair.publicKey)

      expect(valid).toBe(false)
    })
  })

  describe('verifyChangeHash', () => {
    it('verifies correct hash', () => {
      const keyPair = generateSigningKeyPair()
      const unsigned = createUnsignedChange({
        id: 'test-hash-verify',
        type: 'test',
        payload: { value: 123 },
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const signed = signChange(unsigned, keyPair.privateKey)
      expect(verifyChangeHash(signed)).toBe(true)
    })

    it('detects tampered payload', () => {
      const keyPair = generateSigningKeyPair()
      const unsigned = createUnsignedChange({
        id: 'test-tamper',
        type: 'test',
        payload: { value: 'original' },
        parentHash: null,
        authorDID: testDID,
        lamport: testLamport,
        wallTime: 1000
      })

      const signed = signChange(unsigned, keyPair.privateKey)
      const tampered = { ...signed, payload: { value: 'tampered' } }

      expect(verifyChangeHash(tampered)).toBe(false)
    })
  })

  describe('createChangeId', () => {
    it('creates unique IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(createChangeId())
      }
      expect(ids.size).toBe(100)
    })

    it('creates IDs in expected format', () => {
      const id = createChangeId()
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })
  })

  describe('chain linkage', () => {
    it('creates changes with parent hash linkage', () => {
      const keyPair = generateSigningKeyPair()

      // First change (root)
      const change1 = signChange(
        createUnsignedChange({
          id: 'change-1',
          type: 'test',
          payload: { seq: 1 },
          parentHash: null,
          authorDID: testDID,
          lamport: { time: 1, author: testDID },
          wallTime: 1000
        }),
        keyPair.privateKey
      )

      // Second change (links to first)
      const change2 = signChange(
        createUnsignedChange({
          id: 'change-2',
          type: 'test',
          payload: { seq: 2 },
          parentHash: change1.hash,
          authorDID: testDID,
          lamport: { time: 2, author: testDID },
          wallTime: 2000
        }),
        keyPair.privateKey
      )

      expect(change1.parentHash).toBeNull()
      expect(change2.parentHash).toBe(change1.hash)
    })
  })

  describe('Lamport timestamp ordering', () => {
    it('changes include Lamport timestamp for ordering', () => {
      const keyPair = generateSigningKeyPair()

      const change = signChange(
        createUnsignedChange({
          id: 'test-lamport',
          type: 'test',
          payload: {},
          parentHash: null,
          authorDID: testDID,
          lamport: { time: 42, author: testDID },
          wallTime: 1000
        }),
        keyPair.privateKey
      )

      expect(change.lamport.time).toBe(42)
      expect(change.lamport.author).toBe(testDID)
    })
  })
})
