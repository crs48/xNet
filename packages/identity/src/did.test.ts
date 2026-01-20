import { describe, it, expect } from 'vitest'
import { createDID, parseDID, generateIdentity, identityFromPrivateKey, isValidDID } from './did'
import { generateSigningKeyPair } from '@xnet/crypto'

describe('DID:key', () => {
  it('should generate valid DID', () => {
    const { identity } = generateIdentity()
    expect(identity.did).toMatch(/^did:key:z6Mk/)
  })

  it('should round-trip DID to public key', () => {
    const { publicKey } = generateSigningKeyPair()
    const did = createDID(publicKey)
    const recovered = parseDID(did)
    expect(recovered).toEqual(publicKey)
  })

  it('should recreate identity from private key', () => {
    const { identity, privateKey } = generateIdentity()
    const recovered = identityFromPrivateKey(privateKey)
    expect(recovered.did).toBe(identity.did)
    expect(recovered.publicKey).toEqual(identity.publicKey)
  })

  it('should reject invalid DID format', () => {
    expect(() => parseDID('not-a-did')).toThrow()
    expect(() => parseDID('did:web:example.com')).toThrow()
    expect(() => parseDID('did:key:abc')).toThrow() // Not base58btc encoded
  })

  it('should produce deterministic DID from same key', () => {
    const { publicKey } = generateSigningKeyPair()
    const did1 = createDID(publicKey)
    const did2 = createDID(publicKey)
    expect(did1).toBe(did2)
  })

  it('should produce different DIDs for different keys', () => {
    const { publicKey: pk1 } = generateSigningKeyPair()
    const { publicKey: pk2 } = generateSigningKeyPair()
    expect(createDID(pk1)).not.toBe(createDID(pk2))
  })

  it('should validate DIDs correctly', () => {
    const { identity } = generateIdentity()
    expect(isValidDID(identity.did)).toBe(true)
    expect(isValidDID('not-a-did')).toBe(false)
    expect(isValidDID('did:web:example.com')).toBe(false)
  })

  it('should reject invalid public key size', () => {
    expect(() => createDID(new Uint8Array(16))).toThrow()
    expect(() => createDID(new Uint8Array(64))).toThrow()
  })
})
