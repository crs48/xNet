/**
 * Symmetric encryption using XChaCha20-Poly1305
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from './random'

export const NONCE_SIZE = 24
export const KEY_SIZE = 32
export const TAG_SIZE = 16

/**
 * Encrypted data with nonce
 */
export interface EncryptedData {
  nonce: Uint8Array
  ciphertext: Uint8Array
}

/**
 * Generate a random encryption key
 */
export function generateKey(): Uint8Array {
  return randomBytes(KEY_SIZE)
}

/**
 * Encrypt plaintext with a key (generates random nonce)
 */
export function encrypt(plaintext: Uint8Array, key: Uint8Array): EncryptedData {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes`)
  }
  const nonce = randomBytes(NONCE_SIZE)
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(plaintext)
  return { nonce, ciphertext }
}

/**
 * Decrypt ciphertext with a key
 */
export function decrypt(encrypted: EncryptedData, key: Uint8Array): Uint8Array {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes`)
  }
  const cipher = xchacha20poly1305(key, encrypted.nonce)
  return cipher.decrypt(encrypted.ciphertext)
}

/**
 * Encrypt with a specific nonce (use only when you need deterministic encryption)
 */
export function encryptWithNonce(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes`)
  }
  if (nonce.length !== NONCE_SIZE) {
    throw new Error(`Nonce must be ${NONCE_SIZE} bytes`)
  }
  const cipher = xchacha20poly1305(key, nonce)
  return cipher.encrypt(plaintext)
}

/**
 * Decrypt with a specific nonce
 */
export function decryptWithNonce(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes`)
  }
  if (nonce.length !== NONCE_SIZE) {
    throw new Error(`Nonce must be ${NONCE_SIZE} bytes`)
  }
  const cipher = xchacha20poly1305(key, nonce)
  return cipher.decrypt(ciphertext)
}
