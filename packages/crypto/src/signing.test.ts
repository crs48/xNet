import { describe, it, expect } from 'vitest'
import { generateSigningKeyPair, sign, verify, getSigningPublicKeyFromPrivate } from './signing'

describe('Signing', () => {
  it('should sign and verify', () => {
    const kp = generateSigningKeyPair()
    const message = new TextEncoder().encode('sign this')
    const signature = sign(message, kp.privateKey)
    expect(verify(message, signature, kp.publicKey)).toBe(true)
  })

  it('should reject tampered message', () => {
    const kp = generateSigningKeyPair()
    const message = new TextEncoder().encode('original')
    const signature = sign(message, kp.privateKey)
    const tampered = new TextEncoder().encode('modified')
    expect(verify(tampered, signature, kp.publicKey)).toBe(false)
  })

  it('should reject wrong public key', () => {
    const kp1 = generateSigningKeyPair()
    const kp2 = generateSigningKeyPair()
    const message = new TextEncoder().encode('test')
    const signature = sign(message, kp1.privateKey)
    expect(verify(message, signature, kp2.publicKey)).toBe(false)
  })

  it('should produce 64-byte signatures', () => {
    const kp = generateSigningKeyPair()
    const signature = sign(new TextEncoder().encode('test'), kp.privateKey)
    expect(signature.length).toBe(64)
  })

  it('should generate 32-byte keys', () => {
    const kp = generateSigningKeyPair()
    expect(kp.publicKey.length).toBe(32)
    expect(kp.privateKey.length).toBe(32)
  })

  it('should get public key from private key', () => {
    const kp = generateSigningKeyPair()
    const derivedPublic = getSigningPublicKeyFromPrivate(kp.privateKey)
    expect(derivedPublic).toEqual(kp.publicKey)
  })

  it('should handle empty message', () => {
    const kp = generateSigningKeyPair()
    const message = new Uint8Array(0)
    const signature = sign(message, kp.privateKey)
    expect(verify(message, signature, kp.publicKey)).toBe(true)
  })

  it('should handle invalid signature gracefully', () => {
    const kp = generateSigningKeyPair()
    const message = new TextEncoder().encode('test')
    const invalidSignature = new Uint8Array(64) // All zeros
    expect(verify(message, invalidSignature, kp.publicKey)).toBe(false)
  })

  it.skipIf(process.env.VITEST_PRECOMMIT)('should verify many signatures efficiently', () => {
    const kp = generateSigningKeyPair()
    const count = 100
    const messages = Array.from({ length: count }, (_, i) =>
      new TextEncoder().encode(`message ${i}`)
    )
    const signatures = messages.map((m) => sign(m, kp.privateKey))

    const start = performance.now()
    for (let i = 0; i < count; i++) {
      verify(messages[i], signatures[i], kp.publicKey)
    }
    const elapsed = performance.now() - start

    // Should verify 100 signatures in under 1000ms (generous for loaded CI machines)
    expect(elapsed).toBeLessThan(1000)
  })
})
