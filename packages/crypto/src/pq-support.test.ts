import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'
import { describe, it, expect } from 'vitest'
import {
  ML_DSA_65_PUBLIC_KEY_SIZE,
  ML_DSA_65_PRIVATE_KEY_SIZE,
  ML_DSA_65_SIGNATURE_SIZE,
  ML_KEM_768_PUBLIC_KEY_SIZE,
  ML_KEM_768_PRIVATE_KEY_SIZE,
  ML_KEM_768_CIPHERTEXT_SIZE,
  ML_KEM_768_SHARED_SECRET_SIZE
} from './index'

describe('@noble/post-quantum ML-DSA-65', () => {
  it('can import ML-DSA-65', () => {
    expect(ml_dsa65).toBeDefined()
    expect(ml_dsa65.keygen).toBeDefined()
    expect(ml_dsa65.sign).toBeDefined()
    expect(ml_dsa65.verify).toBeDefined()
  })

  it('generates keypair with correct sizes', () => {
    const keys = ml_dsa65.keygen()

    expect(keys.publicKey).toBeInstanceOf(Uint8Array)
    expect(keys.secretKey).toBeInstanceOf(Uint8Array)
    expect(keys.publicKey.length).toBe(ML_DSA_65_PUBLIC_KEY_SIZE)
    expect(keys.secretKey.length).toBe(ML_DSA_65_PRIVATE_KEY_SIZE)
  })

  it('signs message with correct signature size', () => {
    const keys = ml_dsa65.keygen()
    const message = new TextEncoder().encode('test message')

    // API: sign(message, secretKey)
    const signature = ml_dsa65.sign(message, keys.secretKey)

    expect(signature).toBeInstanceOf(Uint8Array)
    expect(signature.length).toBe(ML_DSA_65_SIGNATURE_SIZE)
  })

  it('verifies valid signature', () => {
    const keys = ml_dsa65.keygen()
    const message = new TextEncoder().encode('test message')

    // API: sign(message, secretKey), verify(signature, message, publicKey)
    const signature = ml_dsa65.sign(message, keys.secretKey)
    const valid = ml_dsa65.verify(signature, message, keys.publicKey)

    expect(valid).toBe(true)
  })

  it('rejects tampered signature', () => {
    const keys = ml_dsa65.keygen()
    const message = new TextEncoder().encode('test message')

    const signature = ml_dsa65.sign(message, keys.secretKey)
    // Tamper with signature
    signature[0] ^= 0xff

    const valid = ml_dsa65.verify(signature, message, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('rejects tampered message', () => {
    const keys = ml_dsa65.keygen()
    const message = new TextEncoder().encode('test message')

    const signature = ml_dsa65.sign(message, keys.secretKey)
    const tamperedMessage = new TextEncoder().encode('tampered message')

    const valid = ml_dsa65.verify(signature, tamperedMessage, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('rejects wrong public key', () => {
    const keys1 = ml_dsa65.keygen()
    const keys2 = ml_dsa65.keygen()
    const message = new TextEncoder().encode('test message')

    const signature = ml_dsa65.sign(message, keys1.secretKey)
    const valid = ml_dsa65.verify(signature, message, keys2.publicKey)

    expect(valid).toBe(false)
  })

  it('handles empty message', () => {
    const keys = ml_dsa65.keygen()
    const message = new Uint8Array(0)

    const signature = ml_dsa65.sign(message, keys.secretKey)
    const valid = ml_dsa65.verify(signature, message, keys.publicKey)

    expect(valid).toBe(true)
  })

  it('handles large message', () => {
    const keys = ml_dsa65.keygen()
    // 1MB message
    const message = new Uint8Array(1024 * 1024).fill(0x42)

    const signature = ml_dsa65.sign(message, keys.secretKey)
    const valid = ml_dsa65.verify(signature, message, keys.publicKey)

    expect(valid).toBe(true)
  })
})

describe('@noble/post-quantum ML-KEM-768', () => {
  it('can import ML-KEM-768', () => {
    expect(ml_kem768).toBeDefined()
    expect(ml_kem768.keygen).toBeDefined()
    expect(ml_kem768.encapsulate).toBeDefined()
    expect(ml_kem768.decapsulate).toBeDefined()
  })

  it('generates keypair with correct sizes', () => {
    const keys = ml_kem768.keygen()

    expect(keys.publicKey).toBeInstanceOf(Uint8Array)
    expect(keys.secretKey).toBeInstanceOf(Uint8Array)
    expect(keys.publicKey.length).toBe(ML_KEM_768_PUBLIC_KEY_SIZE)
    expect(keys.secretKey.length).toBe(ML_KEM_768_PRIVATE_KEY_SIZE)
  })

  it('encapsulates with correct sizes', () => {
    const keys = ml_kem768.keygen()
    const result = ml_kem768.encapsulate(keys.publicKey)

    expect(result.cipherText).toBeInstanceOf(Uint8Array)
    expect(result.sharedSecret).toBeInstanceOf(Uint8Array)
    expect(result.cipherText.length).toBe(ML_KEM_768_CIPHERTEXT_SIZE)
    expect(result.sharedSecret.length).toBe(ML_KEM_768_SHARED_SECRET_SIZE)
  })

  it('decapsulates to same shared secret', () => {
    const keys = ml_kem768.keygen()
    const { cipherText, sharedSecret: encapSecret } = ml_kem768.encapsulate(keys.publicKey)
    const decapSecret = ml_kem768.decapsulate(cipherText, keys.secretKey)

    expect(decapSecret).toEqual(encapSecret)
  })

  it('produces different shared secrets for different key pairs', () => {
    const keys1 = ml_kem768.keygen()
    const keys2 = ml_kem768.keygen()

    const { sharedSecret: secret1 } = ml_kem768.encapsulate(keys1.publicKey)
    const { sharedSecret: secret2 } = ml_kem768.encapsulate(keys2.publicKey)

    expect(secret1).not.toEqual(secret2)
  })

  it('produces different ciphertexts for same public key', () => {
    const keys = ml_kem768.keygen()

    const result1 = ml_kem768.encapsulate(keys.publicKey)
    const result2 = ml_kem768.encapsulate(keys.publicKey)

    // Ciphertexts should be different due to randomness
    expect(result1.cipherText).not.toEqual(result2.cipherText)
    // But both should decapsulate correctly
    expect(ml_kem768.decapsulate(result1.cipherText, keys.secretKey)).toEqual(result1.sharedSecret)
    expect(ml_kem768.decapsulate(result2.cipherText, keys.secretKey)).toEqual(result2.sharedSecret)
  })
})

describe('Post-quantum performance', () => {
  it('ML-DSA-65 keygen is reasonably fast', () => {
    const start = performance.now()
    for (let i = 0; i < 10; i++) {
      ml_dsa65.keygen()
    }
    const elapsed = performance.now() - start

    // Should complete 10 keygens in under 5 seconds
    expect(elapsed).toBeLessThan(5000)
    // Log for info
    console.log(`ML-DSA-65 keygen: ${(elapsed / 10).toFixed(2)}ms average`)
  })

  it('ML-DSA-65 sign/verify is reasonably fast', () => {
    const keys = ml_dsa65.keygen()
    const message = new TextEncoder().encode('test message for benchmarking')

    const signStart = performance.now()
    const signatures: Uint8Array[] = []
    for (let i = 0; i < 10; i++) {
      signatures.push(ml_dsa65.sign(message, keys.secretKey))
    }
    const signElapsed = performance.now() - signStart

    const verifyStart = performance.now()
    for (const sig of signatures) {
      ml_dsa65.verify(sig, message, keys.publicKey)
    }
    const verifyElapsed = performance.now() - verifyStart

    // Should complete operations in reasonable time
    expect(signElapsed).toBeLessThan(5000)
    expect(verifyElapsed).toBeLessThan(5000)

    console.log(`ML-DSA-65 sign: ${(signElapsed / 10).toFixed(2)}ms average`)
    console.log(`ML-DSA-65 verify: ${(verifyElapsed / 10).toFixed(2)}ms average`)
  })

  it('ML-KEM-768 encap/decap is reasonably fast', () => {
    const keys = ml_kem768.keygen()

    const encapStart = performance.now()
    const results: { cipherText: Uint8Array; sharedSecret: Uint8Array }[] = []
    for (let i = 0; i < 10; i++) {
      results.push(ml_kem768.encapsulate(keys.publicKey))
    }
    const encapElapsed = performance.now() - encapStart

    const decapStart = performance.now()
    for (const { cipherText } of results) {
      ml_kem768.decapsulate(cipherText, keys.secretKey)
    }
    const decapElapsed = performance.now() - decapStart

    expect(encapElapsed).toBeLessThan(5000)
    expect(decapElapsed).toBeLessThan(5000)

    console.log(`ML-KEM-768 encapsulate: ${(encapElapsed / 10).toFixed(2)}ms average`)
    console.log(`ML-KEM-768 decapsulate: ${(decapElapsed / 10).toFixed(2)}ms average`)
  })
})
