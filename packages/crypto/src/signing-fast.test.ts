import { describe, expect, it, beforeEach } from 'vitest'
import { generateSigningKeyPair, sign, verify } from './signing'
import {
  hasNativeEd25519,
  resetFastVerifyCaches,
  verifyFast,
  verifyMany,
  type VerifyRequest
} from './signing-fast'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('fast Ed25519 verification seam', () => {
  beforeEach(() => {
    resetFastVerifyCaches()
  })

  it('accepts a valid signature', async () => {
    const keys = generateSigningKeyPair()
    const message = encode('cid:blake3:0123456789abcdef')
    const signature = sign(message, keys.privateKey)

    await expect(verifyFast(message, signature, keys.publicKey)).resolves.toBe(true)
  })

  it('rejects a tampered message', async () => {
    const keys = generateSigningKeyPair()
    const signature = sign(encode('cid:blake3:aaa'), keys.privateKey)

    await expect(verifyFast(encode('cid:blake3:bbb'), signature, keys.publicKey)).resolves.toBe(
      false
    )
  })

  it('rejects a signature from a different key', async () => {
    const signer = generateSigningKeyPair()
    const other = generateSigningKeyPair()
    const message = encode('cid:blake3:shared-message')
    const signature = sign(message, signer.privateKey)

    await expect(verifyFast(message, signature, other.publicKey)).resolves.toBe(false)
  })

  it('rejects a malformed signature instead of throwing', async () => {
    const keys = generateSigningKeyPair()
    const message = encode('cid:blake3:short-signature')

    await expect(verifyFast(message, new Uint8Array(8), keys.publicKey)).resolves.toBe(false)
  })

  // The convergence guard: if native and pure-JS ever disagree on any vector,
  // two replicas can disagree on whether a change is valid. Disable the native
  // path rather than relaxing this test.
  it('agrees with the pure-JS verifier on every vector', async () => {
    const keys = generateSigningKeyPair()
    const other = generateSigningKeyPair()
    const message = encode('cid:blake3:parity-vector')
    const signature = sign(message, keys.privateKey)

    const flippedSignature = Uint8Array.from(signature)
    flippedSignature[0] ^= 0x01
    const flippedTail = Uint8Array.from(signature)
    flippedTail[flippedTail.length - 1] ^= 0x80

    const vectors: VerifyRequest[] = [
      { message, signature, publicKey: keys.publicKey },
      { message, signature, publicKey: other.publicKey },
      { message: encode('cid:blake3:other'), signature, publicKey: keys.publicKey },
      { message, signature: flippedSignature, publicKey: keys.publicKey },
      { message, signature: flippedTail, publicKey: keys.publicKey },
      { message: new Uint8Array(0), signature, publicKey: keys.publicKey },
      { message, signature: new Uint8Array(64), publicKey: keys.publicKey }
    ]

    for (const vector of vectors) {
      const nativeResult = await verifyFast(vector.message, vector.signature, vector.publicKey)
      const pureResult = verify(vector.message, vector.signature, vector.publicKey)
      expect(nativeResult).toBe(pureResult)
    }
  })

  it('verifies many signatures positionally', async () => {
    const keys = generateSigningKeyPair()
    const requests: VerifyRequest[] = Array.from({ length: 24 }, (_, index) => {
      const message = encode(`cid:blake3:batch-${index}`)
      return { message, signature: sign(message, keys.privateKey), publicKey: keys.publicKey }
    })
    // Corrupt two entries in the middle of the set.
    requests[7] = { ...requests[7], message: encode('cid:blake3:tampered') }
    requests[19] = { ...requests[19], signature: new Uint8Array(64) }

    const results = await verifyMany(requests)

    expect(results).toHaveLength(24)
    expect(results[7]).toBe(false)
    expect(results[19]).toBe(false)
    expect(results.filter((ok) => ok)).toHaveLength(22)
  })

  it('verifies a mixed-author batch against the right keys', async () => {
    const alice = generateSigningKeyPair()
    const bob = generateSigningKeyPair()
    const message = encode('cid:blake3:mixed-author')

    const results = await verifyMany([
      { message, signature: sign(message, alice.privateKey), publicKey: alice.publicKey },
      { message, signature: sign(message, bob.privateKey), publicKey: bob.publicKey },
      // Bob's signature checked against Alice's key must fail.
      { message, signature: sign(message, bob.privateKey), publicKey: alice.publicKey }
    ])

    expect(results).toEqual([true, true, false])
  })

  it('returns an empty result for an empty batch', async () => {
    await expect(verifyMany([])).resolves.toEqual([])
  })

  it('reports whether the native path is in use', async () => {
    // Informational, not a hard requirement: CI runtimes without WebCrypto
    // Ed25519 exercise the pure-JS fallback and every other test still holds.
    await expect(hasNativeEd25519()).resolves.toBeTypeOf('boolean')
  })
})
