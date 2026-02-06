/**
 * Passkey/WebAuthn integration for key storage
 */
import type { StoredKey, KeyBundle } from './types'
import { encrypt, decrypt, generateKey } from '@xnet/crypto'
import { serializeKeyBundle, deserializeKeyBundle } from './keys'

/**
 * Interface for passkey-protected key storage
 */
export interface PasskeyStorage {
  /** Store encrypted key bundle */
  store(keyBundle: KeyBundle, credentialId: string): Promise<StoredKey>

  /** Retrieve and decrypt key bundle */
  retrieve(storedKey: StoredKey, credentialId: string): Promise<KeyBundle>

  /** Check if passkey is available */
  isAvailable(): boolean
}

/**
 * Browser implementation using WebAuthn (INSECURE - TEST/DEVELOPMENT ONLY)
 *
 * @warning SECURITY NOTICE: This implementation provides NO real security!
 * The encryption key is stored in the `salt` field alongside the encrypted data.
 * Anyone with IndexedDB access can decrypt private keys.
 *
 * This class is intended ONLY for:
 * - Development and testing
 * - Prototyping WebAuthn integration
 * - Fallback when WebAuthn PRF extension is unavailable
 *
 * For production use, implement key derivation using:
 * - WebAuthn PRF extension (prf: { eval: { first: salt } })
 * - Hardware security keys with PRF support
 * - Platform authenticators with secure enclave
 *
 * @deprecated Use a secure implementation with WebAuthn PRF for production.
 */
export class BrowserPasskeyStorage implements PasskeyStorage {
  private static _warnedInsecure = false

  isAvailable(): boolean {
    return typeof globalThis !== 'undefined' && 'crypto' in globalThis
  }

  async store(keyBundle: KeyBundle, credentialId: string): Promise<StoredKey> {
    // Warn once about insecure usage
    if (!BrowserPasskeyStorage._warnedInsecure) {
      BrowserPasskeyStorage._warnedInsecure = true
      console.warn(
        '[BrowserPasskeyStorage] SECURITY WARNING: This implementation stores the encryption key ' +
          'alongside encrypted data and provides NO real security. Use only for development/testing. ' +
          'For production, implement WebAuthn PRF extension for secure key derivation.'
      )
    }

    // INSECURE: Key stored alongside encrypted data - no actual protection
    // In a secure implementation, use WebAuthn PRF to derive key from credential
    const key = generateKey()
    const serialized = serializeKeyBundle(keyBundle)
    const encrypted = encrypt(serialized, key)

    return {
      id: credentialId,
      encryptedKey: concatBytes(encrypted.nonce, encrypted.ciphertext),
      salt: key, // INSECURE: This defeats the purpose of encryption
      created: Date.now()
    }
  }

  async retrieve(storedKey: StoredKey, _credentialId: string): Promise<KeyBundle> {
    const nonce = storedKey.encryptedKey.slice(0, 24)
    const ciphertext = storedKey.encryptedKey.slice(24)
    const decrypted = decrypt({ nonce, ciphertext }, storedKey.salt)
    return deserializeKeyBundle(decrypted)
  }
}

/**
 * In-memory passkey storage for testing only.
 *
 * @warning TEST USE ONLY - Data is lost on page refresh.
 * This class stores keys in memory without any persistence or security.
 */
export class MemoryPasskeyStorage implements PasskeyStorage {
  private keys = new Map<string, { bundle: KeyBundle; key: Uint8Array }>()

  isAvailable(): boolean {
    return true
  }

  async store(keyBundle: KeyBundle, credentialId: string): Promise<StoredKey> {
    const key = generateKey()
    this.keys.set(credentialId, { bundle: keyBundle, key })

    const serialized = serializeKeyBundle(keyBundle)
    const encrypted = encrypt(serialized, key)

    return {
      id: credentialId,
      encryptedKey: concatBytes(encrypted.nonce, encrypted.ciphertext),
      salt: key,
      created: Date.now()
    }
  }

  async retrieve(storedKey: StoredKey, credentialId: string): Promise<KeyBundle> {
    const stored = this.keys.get(credentialId)
    if (!stored) {
      // Fall back to decryption
      const nonce = storedKey.encryptedKey.slice(0, 24)
      const ciphertext = storedKey.encryptedKey.slice(24)
      const decrypted = decrypt({ nonce, ciphertext }, storedKey.salt)
      return deserializeKeyBundle(decrypted)
    }
    return stored.bundle
  }
}

// Helper to concatenate byte arrays
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}
