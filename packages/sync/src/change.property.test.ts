/**
 * Property-based tests for Change hashing and signing (exploration 0272,
 * Pillar 1).
 *
 * The conformance vectors (conformance/vectors/change/) pin a handful of
 * known-good byte-level cases across four language implementations; these
 * properties pin the LAWS for millions of generated cases:
 *
 *   - canonicalisation: the content hash is independent of object key
 *     insertion order, at any nesting depth;
 *   - round-trip: any signed change verifies (hash and signature);
 *   - tamper-evidence: changing ANY hashed field breaks verifyChangeHash,
 *     and flipping any signature byte breaks verifyChange.
 *
 * fast-check prints a seed + counterexample path on failure; re-run with
 * `fc.assert(..., { seed, path })` to replay. Depth via XNET_PBT_RUNS.
 */

import { generateSigningKeyPair } from '@xnetjs/crypto'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  computeChangeHash,
  createUnsignedChange,
  signChange,
  verifyChange,
  verifyChangeHash,
  type UnsignedChange
} from './change'

const RUNS = Number.parseInt(process.env.XNET_PBT_RUNS ?? '', 10) || 50
const KEY_POOL = ['alpha', 'beta', 'gamma', 'delta', 'nested', 'x1'] as const

const { publicKey, privateKey } = generateSigningKeyPair()

/** JSON-safe payloads with contested keys and some nesting. */
const arbPayload = fc.record({
  nodeId: fc.constantFrom('node-a', 'node-b'),
  schemaId: fc.constantFrom('xnet://xnet.fyi/Task', 'xnet://xnet.fyi/Page'),
  properties: fc.dictionary(
    fc.constantFrom(...KEY_POOL),
    fc.oneof(
      fc.integer(),
      fc.string(),
      fc.boolean(),
      fc.dictionary(fc.constantFrom(...KEY_POOL), fc.integer(), { maxKeys: 3 })
    ),
    { maxKeys: 5 }
  )
})

const arbUnsigned = fc
  .record({
    payload: arbPayload,
    lamport: fc.integer({ min: 1, max: 1_000_000 }),
    wallTime: fc.integer({ min: 1, max: 4_000_000_000_000 }),
    id: fc.uuid()
  })
  .map(({ payload, lamport, wallTime, id }) =>
    createUnsignedChange({
      id,
      type: 'node-change',
      payload,
      parentHash: null,
      authorDID: 'did:key:z6MkpropertyTestAuthor0272',
      lamport,
      wallTime
    })
  )

/** Deep copy with every object's key insertion order reversed. */
function reverseKeyOrder(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(reverseKeyOrder)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).reverse()) {
    out[key] = reverseKeyOrder((value as Record<string, unknown>)[key])
  }
  return out
}

describe('Change hash/signature properties (0272)', () => {
  it('the content hash is independent of key insertion order at any depth', () => {
    fc.assert(
      fc.property(arbUnsigned, (unsigned) => {
        const reordered = reverseKeyOrder(unsigned) as UnsignedChange<unknown>
        expect(Object.keys(reordered)).not.toEqual(Object.keys(unsigned)) // reorder is real
        expect(computeChangeHash(reordered)).toBe(computeChangeHash(unsigned))
      }),
      { numRuns: RUNS }
    )
  })

  it('every signed change round-trips: hash verifies and signature verifies', () => {
    fc.assert(
      fc.property(arbUnsigned, (unsigned) => {
        const signed = signChange(unsigned, privateKey)
        expect(verifyChangeHash(signed)).toBe(true)
        expect(verifyChange(signed, publicKey)).toBe(true)
      }),
      { numRuns: RUNS }
    )
  })

  it('tampering with any hashed field breaks hash verification', () => {
    const arbTamper = fc.constantFrom<'lamport' | 'wallTime' | 'id' | 'type' | 'payload'>(
      'lamport',
      'wallTime',
      'id',
      'type',
      'payload'
    )
    fc.assert(
      fc.property(
        arbUnsigned,
        arbTamper,
        fc.integer({ min: 1, max: 999 }),
        (unsigned, field, delta) => {
          const signed = signChange(unsigned, privateKey)
          const tampered = { ...signed }
          switch (field) {
            case 'lamport':
              tampered.lamport = signed.lamport + delta
              break
            case 'wallTime':
              tampered.wallTime = signed.wallTime + delta
              break
            case 'id':
              tampered.id = `${signed.id}-x`
              break
            case 'type':
              tampered.type = `${signed.type}-x`
              break
            case 'payload':
              tampered.payload = {
                ...signed.payload,
                properties: { ...signed.payload.properties, __tampered: delta }
              }
              break
          }
          expect(verifyChangeHash(tampered)).toBe(false)
        }
      ),
      { numRuns: RUNS }
    )
  })

  it('flipping any signature byte breaks signature verification', () => {
    fc.assert(
      fc.property(arbUnsigned, fc.nat(63), (unsigned, byteIndex) => {
        const signed = signChange(unsigned, privateKey)
        const flipped = new Uint8Array(signed.signature)
        flipped[byteIndex % flipped.length] ^= 0xff
        expect(verifyChange({ ...signed, signature: flipped }, publicKey)).toBe(false)
      }),
      { numRuns: RUNS }
    )
  })
})
