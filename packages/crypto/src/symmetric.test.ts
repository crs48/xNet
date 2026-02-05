import { describe, it, expect } from 'vitest'
import { generateKey, encrypt, decrypt, KEY_SIZE, NONCE_SIZE } from './symmetric'

describe('Symmetric Encryption', () => {
  it('should generate 32-byte key', () => {
    const key = generateKey()
    expect(key.length).toBe(KEY_SIZE)
  })

  it('should encrypt and decrypt', () => {
    const key = generateKey()
    const plaintext = new TextEncoder().encode('secret message')
    const encrypted = encrypt(plaintext, key)
    const decrypted = decrypt(encrypted, key)
    expect(new TextDecoder().decode(decrypted)).toBe('secret message')
  })

  it('should produce nonce of correct size', () => {
    const key = generateKey()
    const encrypted = encrypt(new TextEncoder().encode('test'), key)
    expect(encrypted.nonce.length).toBe(NONCE_SIZE)
  })

  it('should fail with wrong key', () => {
    const key1 = generateKey()
    const key2 = generateKey()
    const encrypted = encrypt(new TextEncoder().encode('test'), key1)
    expect(() => decrypt(encrypted, key2)).toThrow()
  })

  it('should produce different ciphertext for same plaintext', () => {
    const key = generateKey()
    const plaintext = new TextEncoder().encode('same')
    const a = encrypt(plaintext, key)
    const b = encrypt(plaintext, key)
    // Different nonces should produce different ciphertext
    expect(a.nonce).not.toEqual(b.nonce)
    expect(a.ciphertext).not.toEqual(b.ciphertext)
  })

  it('should reject invalid key size', () => {
    const shortKey = new Uint8Array(16)
    const plaintext = new TextEncoder().encode('test')
    expect(() => encrypt(plaintext, shortKey)).toThrow()
  })

  it('should handle empty plaintext', () => {
    const key = generateKey()
    const plaintext = new Uint8Array(0)
    const encrypted = encrypt(plaintext, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted.length).toBe(0)
  })

  it('should handle large plaintext', () => {
    const key = generateKey()
    const plaintext = new Uint8Array(10 * 1024) // 10KB (logic is size-independent)
    for (let i = 0; i < plaintext.length; i++) plaintext[i] = i % 256
    const encrypted = encrypt(plaintext, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted).toEqual(plaintext)
  })
})
