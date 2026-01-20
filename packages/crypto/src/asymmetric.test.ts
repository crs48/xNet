import { describe, it, expect } from 'vitest'
import {
  generateKeyPair,
  deriveSharedSecret,
  deriveSharedSecretWithContext,
  getPublicKeyFromPrivate
} from './asymmetric'

describe('Key Exchange', () => {
  it('should generate valid key pair', () => {
    const kp = generateKeyPair()
    expect(kp.publicKey.length).toBe(32)
    expect(kp.privateKey.length).toBe(32)
  })

  it('should derive same shared secret (Diffie-Hellman)', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()

    const aliceShared = deriveSharedSecret(alice.privateKey, bob.publicKey)
    const bobShared = deriveSharedSecret(bob.privateKey, alice.publicKey)

    expect(aliceShared).toEqual(bobShared)
  })

  it('should derive 32-byte shared secret', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const shared = deriveSharedSecret(alice.privateKey, bob.publicKey)
    expect(shared.length).toBe(32)
  })

  it('should derive different secrets with different contexts', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()

    const secret1 = deriveSharedSecretWithContext(alice.privateKey, bob.publicKey, 'context1')
    const secret2 = deriveSharedSecretWithContext(alice.privateKey, bob.publicKey, 'context2')

    expect(secret1).not.toEqual(secret2)
  })

  it('should get public key from private key', () => {
    const kp = generateKeyPair()
    const derivedPublic = getPublicKeyFromPrivate(kp.privateKey)
    expect(derivedPublic).toEqual(kp.publicKey)
  })

  it('should produce different key pairs each time', () => {
    const kp1 = generateKeyPair()
    const kp2 = generateKeyPair()
    expect(kp1.privateKey).not.toEqual(kp2.privateKey)
    expect(kp1.publicKey).not.toEqual(kp2.publicKey)
  })
})
