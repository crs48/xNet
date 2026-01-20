/**
 * Passkey/WebAuthn integration for key storage
 */
import { encrypt, decrypt, generateKey } from '@xnet/crypto'
import type { StoredKey, KeyBundle } from './types'
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
 * Browser implementation using WebAuthn
 * Note: This is a simplified implementation. Production use would
 * integrate with actual WebAuthn credentials for key derivation.
 */
export class BrowserPasskeyStorage implements PasskeyStorage {
  isAvailable(): boolean {
    return typeof globalThis !== 'undefined' && 'crypto' in globalThis
  }

  async store(keyBundle: KeyBundle, credentialId: string): Promise<StoredKey> {
    // In a real implementation, we would use WebAuthn to derive a key
    // For now, we generate a random key and store it alongside
    // (This would be replaced with PRF extension or similar)
    const key = generateKey()
    const serialized = serializeKeyBundle(keyBundle)
    const encrypted = encrypt(serialized, key)

    return {
      id: credentialId,
      encryptedKey: concatBytes(encrypted.nonce, encrypted.ciphertext),
      salt: key, // In real impl, this would be derived from credential
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
 * In-memory passkey storage for testing
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
