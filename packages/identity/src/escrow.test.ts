import { describe, expect, it } from 'vitest'
import {
  MIN_ESCROW_PIN_LENGTH,
  deserializeEscrow,
  openEscrow,
  sealEscrow,
  serializeEscrow
} from './escrow'

const secret = new Uint8Array(32).map((_, i) => (i * 7) & 0xff)

describe('sealEscrow / openEscrow', () => {
  it('round-trips the secret with the right PIN', () => {
    const env = sealEscrow(secret, '1234')
    expect(openEscrow(env, '1234')).toEqual(secret)
  })

  it('does not store the secret in the clear', () => {
    const env = sealEscrow(secret, '1234')
    expect(env.ciphertext).not.toEqual(secret)
  })

  it('fails to open with the wrong PIN', () => {
    const env = sealEscrow(secret, '1234')
    expect(() => openEscrow(env, '9999')).toThrow()
  })

  it('rejects a too-short PIN', () => {
    expect(() => sealEscrow(secret, '1'.repeat(MIN_ESCROW_PIN_LENGTH - 1))).toThrow()
  })

  it('uses a fresh salt + nonce each time (same input → different envelope)', () => {
    const a = sealEscrow(secret, '1234')
    const b = sealEscrow(secret, '1234')
    expect(a.salt).not.toEqual(b.salt)
    expect(a.ciphertext).not.toEqual(b.ciphertext)
  })
})

describe('serializeEscrow / deserializeEscrow', () => {
  it('round-trips through opaque bytes and still opens', () => {
    const env = sealEscrow(secret, 'abcd')
    const restored = deserializeEscrow(serializeEscrow(env))
    expect(openEscrow(restored, 'abcd')).toEqual(secret)
  })

  it('rejects a malformed blob', () => {
    expect(() => deserializeEscrow(new TextEncoder().encode('{"v":2}'))).toThrow()
  })
})
