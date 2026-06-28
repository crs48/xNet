import { createDIDFromEd25519PublicKey, generateSigningKeyPair, hybridSign } from '@xnetjs/crypto'
import { describe, expect, it } from 'vitest'
import { makeDidChallengeVerifier } from './verify-did'

function identity() {
  const { publicKey, privateKey } = generateSigningKeyPair()
  return {
    did: createDIDFromEd25519PublicKey(publicKey),
    sign: (nonce: string): string =>
      Buffer.from(
        hybridSign(new TextEncoder().encode(nonce), { ed25519: privateKey }, 0)
          .ed25519 as Uint8Array
      ).toString('base64url')
  }
}

describe('makeDidChallengeVerifier', () => {
  const verify = makeDidChallengeVerifier()

  it('accepts a signature over the nonce by the DID key', async () => {
    const id = identity()
    const nonce = 'server-issued-nonce'
    expect(await verify({ did: id.did, nonce, signature: id.sign(nonce) })).toBe(true)
  })

  it('rejects a signature by a different key', async () => {
    const id = identity()
    const other = identity()
    const nonce = 'n'
    expect(await verify({ did: id.did, nonce, signature: other.sign(nonce) })).toBe(false)
  })

  it('rejects a signature over a different nonce (tampered challenge)', async () => {
    const id = identity()
    const signature = id.sign('original')
    expect(await verify({ did: id.did, nonce: 'tampered', signature })).toBe(false)
  })

  it('rejects a malformed (non-base64url) signature', async () => {
    const id = identity()
    expect(await verify({ did: id.did, nonce: 'n', signature: 'not a sig!!' })).toBe(false)
  })

  it('rejects a signature of the wrong length', async () => {
    const id = identity()
    expect(
      await verify({
        did: id.did,
        nonce: 'n',
        signature: Buffer.from('short').toString('base64url')
      })
    ).toBe(false)
  })

  it('rejects a non-Ed25519 / malformed DID', async () => {
    const id = identity()
    expect(await verify({ did: 'did:web:example.com', nonce: 'n', signature: id.sign('n') })).toBe(
      false
    )
  })

  it('rejects empty fields', async () => {
    expect(await verify({ did: '', nonce: 'n', signature: 's' })).toBe(false)
    expect(await verify({ did: 'did:key:z6Mk', nonce: '', signature: 's' })).toBe(false)
    expect(await verify({ did: 'did:key:z6Mk', nonce: 'n', signature: '' })).toBe(false)
  })
})
