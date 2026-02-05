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
import { createPasskeyIdentity } from './create'
import { createFallbackIdentity, unlockFallbackIdentity } from './fallback'
import { getStoredIdentity, storeIdentity, clearStoredIdentity } from './storage'
import { detectPasskeySupport } from './support'
import { unlockPasskeyIdentity } from './unlock'

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

export type IdentityManager = {
  /**
   * Pre-detect PRF support. Call on mount, before user interaction.
   * Required for Safari/WebKit which invalidates user gestures after async ops.
   */
  preflight(): Promise<void>

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
 * IMPORTANT: Call `preflight()` on mount to detect PRF support BEFORE
 * the user clicks. This is required for Safari/WebKit which invalidates
 * user gestures after any async operation.
 *
 * @example
 * const manager = createIdentityManager()
 *
 * // On component mount (before user interaction):
 * await manager.preflight()
 *
 * // On user click:
 * if (await manager.hasIdentity()) {
 *   const keys = await manager.unlock() // Touch ID prompt
 * } else {
 *   const keys = await manager.create() // Create passkey + Touch ID
 * }
 */
export function createIdentityManager(): IdentityManager {
  let cachedKeyBundle: KeyBundle | null = null
  let prfSupported: boolean | null = null

  return {
    async preflight(): Promise<void> {
      const support = await detectPasskeySupport()
      prfSupported = support.prf
    },

    async hasIdentity(): Promise<boolean> {
      const stored = await getStoredIdentity()
      return stored !== null
    },

    async create(options?: PasskeyCreateOptions): Promise<KeyBundle> {
      // IMPORTANT: Do NOT call detectPasskeySupport() here!
      // Safari/WebKit requires WebAuthn calls to be in the synchronous call stack
      // of a user gesture. Any async operation will cause the credential creation
      // to be blocked. Support detection must happen via preflight() on mount.

      let keyBundle: KeyBundle
      let passkey: PasskeyIdentity
      let fallback: FallbackStorage | undefined

      // Use cached PRF support if available, otherwise try PRF first
      const usePrf = prfSupported !== false

      if (usePrf) {
        try {
          const result = await createPasskeyIdentity(options)
          keyBundle = result.keyBundle
          passkey = result.passkey
        } catch (err) {
          // If PRF extension not supported at runtime, we can't fall back
          // because the user gesture is now consumed. Re-throw with helpful message.
          if (err instanceof Error && err.message.includes('PRF extension not supported')) {
            // Cache this for next attempt
            prfSupported = false
            throw new Error(
              'PRF extension not supported. Please try again - we will use a compatible method.'
            )
          }
          throw err
        }
      } else {
        // PRF not supported, use fallback directly
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
