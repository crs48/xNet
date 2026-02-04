/**
 * @xnet/identity/passkey - Unified passkey authentication API
 *
 * Provides a single `createIdentityManager()` entry point that handles:
 * - PRF-based key derivation (primary path)
 * - Encrypted fallback for non-PRF authenticators
 * - IndexedDB persistence of public identity info
 * - In-memory caching of unlocked keys
 */
import type { KeyBundle } from '../types'
import type { PasskeyIdentity, PasskeyCreateOptions, FallbackStorage } from './types'
import { detectPasskeySupport } from './support'
import { createPasskeyIdentity } from './create'
import { unlockPasskeyIdentity } from './unlock'
import { createFallbackIdentity, unlockFallbackIdentity } from './fallback'
import { getStoredIdentity, storeIdentity, clearStoredIdentity } from './storage'

// ─── Public Types ────────────────────────────────────────────

export type {
  PasskeyIdentity,
  PasskeyUnlockResult,
  PasskeyCreateOptions,
  PasskeySupport,
  FallbackStorage,
  StoredPasskeyRecord
} from './types'

export { detectPasskeySupport } from './support'
export { createPasskeyIdentity } from './create'
export { unlockPasskeyIdentity } from './unlock'
export { createFallbackIdentity, unlockFallbackIdentity } from './fallback'
export { getStoredIdentity, storeIdentity, clearStoredIdentity } from './storage'
export { deriveKeySeed } from './derive'
export {
  discoverExistingPasskey,
  unlockDiscoveredPasskey,
  type DiscoveredPasskey
} from './discovery'

// ─── Identity Manager ────────────────────────────────────────

export interface IdentityManager {
  /** Check if an identity exists in storage */
  hasIdentity(): Promise<boolean>

  /** Create a new identity (prompts for biometric) */
  create(options?: PasskeyCreateOptions): Promise<KeyBundle>

  /** Unlock the existing identity (prompts for biometric) */
  unlock(): Promise<KeyBundle>

  /** Get the cached key bundle without prompting (null if locked) */
  getCached(): KeyBundle | null

  /** Clear stored identity and cached keys */
  clear(): Promise<void>
}

/**
 * Create a unified identity manager that handles passkey creation,
 * unlock, and caching.
 *
 * @example
 * const manager = createIdentityManager()
 *
 * if (await manager.hasIdentity()) {
 *   const keys = await manager.unlock() // Touch ID prompt
 * } else {
 *   const keys = await manager.create() // Create passkey + Touch ID
 * }
 */
export function createIdentityManager(): IdentityManager {
  let cachedKeyBundle: KeyBundle | null = null

  return {
    async hasIdentity(): Promise<boolean> {
      const stored = await getStoredIdentity()
      return stored !== null
    },

    async create(options?: PasskeyCreateOptions): Promise<KeyBundle> {
      const support = await detectPasskeySupport()

      if (!support.webauthn || !support.platform) {
        throw new Error('Passkeys not supported on this device')
      }

      let keyBundle: KeyBundle
      let passkey: PasskeyIdentity
      let fallback: FallbackStorage | undefined

      if (support.prf) {
        const result = await createPasskeyIdentity(options)
        keyBundle = result.keyBundle
        passkey = result.passkey
      } else {
        const result = await createFallbackIdentity(options?.rpId)
        keyBundle = result.keyBundle
        passkey = result.passkey
        fallback = result.fallback
      }

      await storeIdentity(passkey, fallback)
      cachedKeyBundle = keyBundle

      return keyBundle
    },

    async unlock(): Promise<KeyBundle> {
      if (cachedKeyBundle) {
        return cachedKeyBundle
      }

      const stored = await getStoredIdentity()
      if (!stored) {
        throw new Error('No identity found')
      }

      let keyBundle: KeyBundle

      if (stored.fallback) {
        const result = await unlockFallbackIdentity(stored.passkey, stored.fallback)
        keyBundle = result.keyBundle
      } else {
        const result = await unlockPasskeyIdentity(stored.passkey)
        keyBundle = result.keyBundle
      }

      cachedKeyBundle = keyBundle
      return keyBundle
    },

    getCached(): KeyBundle | null {
      return cachedKeyBundle
    },

    async clear(): Promise<void> {
      await clearStoredIdentity()
      cachedKeyBundle = null
    }
  }
}
