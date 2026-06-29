/**
 * @xnetjs/identity/passkey - Unified passkey authentication API
 *
 * Provides a single `createIdentityManager()` entry point that handles:
 * - PRF-based key derivation (primary path)
 * - Encrypted fallback for non-PRF authenticators
 * - IndexedDB persistence of public identity info
 * - In-memory caching of unlocked keys
 */
import type { HybridKeyBundle } from '../types'
import type { PasskeyIdentity, PasskeyCreateOptions, FallbackStorage } from './types'
import {
  createRecoverableIdentity,
  openRecoveryPhrase,
  recoveryPhraseToBundle,
  validateRecoveryPhrase
} from '../recoverable'
import {
  createRecoveryShares,
  recoverFromShares,
  type RecoveryShare,
  type SocialRecoveryConfig
} from '../seed-recovery'
import { createPasskeyIdentity } from './create'
import { discoverExistingPasskey, unlockDiscoveredPasskey } from './discovery'
import { createFallbackIdentity, unlockFallbackIdentity } from './fallback'
import { enrollRecoverableIdentity } from './recoverable'
import { persistSession, loadSession, clearSession } from './session'
import { getStoredIdentity, storeIdentity, clearStoredIdentity } from './storage'
import { detectPasskeySupport } from './support'
import { isTestBypassEnabled, createTestIdentityManager } from './test-bypass'
import { unlockPasskeyIdentity } from './unlock'

/** Options for creating/importing a recoverable identity (exploration 0243). */
export type RecoverableCreateOptions = {
  /** Words in the generated phrase (default 24). */
  words?: number
  /** Relying party ID for the gating passkey (default: current hostname). */
  rpId?: string
}

/** Result of creating or importing a recoverable identity: the keys plus the phrase. */
export type RecoverableResult = {
  keyBundle: HybridKeyBundle
  /** The recovery phrase — show it once, then never again unless re-exported. */
  phrase: string
}

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
export { enrollRecoverableIdentity, type RecoverableEnrollment } from './recoverable'
export { getStoredIdentity, storeIdentity, clearStoredIdentity } from './storage'
export { deriveKeySeed } from './derive'
export {
  discoverExistingPasskey,
  unlockDiscoveredPasskey,
  type DiscoveredPasskey
} from './discovery'
export { isTestBypassEnabled, createTestIdentity, createTestIdentityManager } from './test-bypass'
export { persistSession, loadSession, clearSession, SESSION_TTL_MS } from './session'

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
  create(options?: PasskeyCreateOptions): Promise<HybridKeyBundle>

  /**
   * Create a new *recoverable* identity (exploration 0243): born from a fresh recovery
   * phrase, gated by a passkey, and stored so the phrase can recover it on any device.
   * Returns the phrase — show it once and prompt the user to save it. Opt-in: ordinary
   * `create()` stays the stronger non-recoverable default.
   */
  createRecoverable(options?: RecoverableCreateOptions): Promise<RecoverableResult>

  /**
   * Adopt an identity from a recovery phrase on this device (lost passkey / new
   * device), enrolling a local passkey to gate it. Throws on an invalid phrase.
   */
  importRecoveryPhrase(
    phrase: string,
    options?: RecoverableCreateOptions
  ): Promise<RecoverableResult>

  /**
   * Reveal the recovery phrase for a recoverable identity (Settings "view phrase").
   * Prompts for the passkey, then returns the phrase, or null if this identity isn't
   * recoverable.
   */
  exportRecoveryPhrase(): Promise<string | null>

  /** Whether the stored identity was created recoverable (has a saved phrase). */
  isRecoverable(): Promise<boolean>

  /**
   * Recover via a passkey synced from another device (iCloud Keychain / Google
   * Password Manager) — exploration 0243, P1.4. Discovers an existing xNet passkey,
   * unlocks it (same PRF → same DID), and stores it locally. Returns the key bundle,
   * or null when no synced passkey is available (the caller falls back to the phrase).
   */
  recoverViaSyncedPasskey(rpId?: string): Promise<HybridKeyBundle | null>

  /**
   * Social recovery (exploration 0243) — the Apple-ADP "recovery contacts" analogue.
   * Split this recoverable identity's phrase into `totalShares` guardian shares of
   * which any `threshold` reconstruct it (Shamir). Prompts for the passkey (it reads
   * the phrase), then returns the shares to hand to trusted guardians out of band.
   * The cloud is never involved — recovery stays zero-knowledge. Throws if the identity
   * has no recovery phrase.
   */
  createGuardianShares(config: SocialRecoveryConfig): Promise<RecoveryShare[]>

  /**
   * Recover an identity from `threshold` guardian shares on a new device: reconstruct
   * the phrase, reproduce the same DID, and enroll a local passkey. Throws if too few
   * shares are supplied or they don't belong to one group.
   */
  recoverFromGuardianShares(
    shares: RecoveryShare[],
    options?: RecoverableCreateOptions
  ): Promise<RecoverableResult>

  /** Unlock the existing identity (prompts for biometric) */
  unlock(): Promise<HybridKeyBundle>

  /**
   * Resume a previously persisted session without prompting.
   * Returns null if there is no session, it expired, or it doesn't
   * match the stored identity — call `unlock()` in that case.
   */
  resume(): Promise<HybridKeyBundle | null>

  /** Get the cached key bundle without prompting (null if locked) */
  getCached(): HybridKeyBundle | null

  /**
   * End the unlocked session (logout): drop cached keys and the
   * persisted session, but keep the identity so the user can unlock
   * again with their passkey.
   */
  lock(): Promise<void>

  /** Clear stored identity, persisted session, and cached keys */
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
 *
 * // keys.maxSecurityLevel === 2 (hybrid bundle with PQ keys)
 */
export function createIdentityManager(): IdentityManager {
  // Auto-switch to test mode if bypass is enabled
  if (isTestBypassEnabled()) {
    return createTestIdentityManager()
  }

  let cachedKeyBundle: HybridKeyBundle | null = null
  let prfSupported: boolean | null = null

  const manager: IdentityManager = {
    async preflight(): Promise<void> {
      const support = await detectPasskeySupport()
      prfSupported = support.prf
    },

    async hasIdentity(): Promise<boolean> {
      const stored = await getStoredIdentity()
      return stored !== null
    },

    async create(options?: PasskeyCreateOptions): Promise<HybridKeyBundle> {
      // IMPORTANT: Do NOT call detectPasskeySupport() here!
      // Safari/WebKit requires WebAuthn calls to be in the synchronous call stack
      // of a user gesture. Any async operation will cause the credential creation
      // to be blocked. Support detection must happen via preflight() on mount.

      let keyBundle: HybridKeyBundle
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
      await persistCurrentSession(keyBundle)

      return keyBundle
    },

    async createRecoverable(options?: RecoverableCreateOptions): Promise<RecoverableResult> {
      const { phrase, bundle } = createRecoverableIdentity(
        options?.words ? { words: options.words } : {}
      )
      const enrolled = await enrollRecoverableIdentity(bundle, phrase, options?.rpId)
      await storeIdentity(enrolled.passkey, enrolled.fallback, enrolled.recovery)
      cachedKeyBundle = enrolled.keyBundle
      await persistCurrentSession(enrolled.keyBundle)
      return { keyBundle: enrolled.keyBundle, phrase }
    },

    async importRecoveryPhrase(
      phrase: string,
      options?: RecoverableCreateOptions
    ): Promise<RecoverableResult> {
      const validation = validateRecoveryPhrase(phrase)
      if (!validation.ok) {
        throw new Error('That recovery phrase is not valid')
      }
      const normalized = validation.words.join(' ')
      const bundle = recoveryPhraseToBundle(normalized)
      const enrolled = await enrollRecoverableIdentity(bundle, normalized, options?.rpId)
      await storeIdentity(enrolled.passkey, enrolled.fallback, enrolled.recovery)
      cachedKeyBundle = enrolled.keyBundle
      await persistCurrentSession(enrolled.keyBundle)
      return { keyBundle: enrolled.keyBundle, phrase: normalized }
    },

    async exportRecoveryPhrase(): Promise<string | null> {
      await manager.unlock() // passkey gate before revealing the phrase
      const stored = await getStoredIdentity()
      if (!stored?.recovery || !stored.fallback) return null
      return openRecoveryPhrase(stored.recovery, stored.fallback.encKey)
    },

    async isRecoverable(): Promise<boolean> {
      const stored = await getStoredIdentity()
      return Boolean(stored?.recovery)
    },

    async recoverViaSyncedPasskey(rpId?: string): Promise<HybridKeyBundle | null> {
      const discovered = await discoverExistingPasskey(rpId)
      if (!discovered) return null
      const { keyBundle, passkey } = await unlockDiscoveredPasskey(discovered)
      await storeIdentity(passkey)
      cachedKeyBundle = keyBundle
      await persistCurrentSession(keyBundle)
      return keyBundle
    },

    async createGuardianShares(config: SocialRecoveryConfig): Promise<RecoveryShare[]> {
      const phrase = await manager.exportRecoveryPhrase()
      if (!phrase) {
        throw new Error('This identity has no recovery phrase to split into guardian shares')
      }
      return createRecoveryShares(phrase, config)
    },

    async recoverFromGuardianShares(
      shares: RecoveryShare[],
      options?: RecoverableCreateOptions
    ): Promise<RecoverableResult> {
      const phrase = recoverFromShares(shares) // throws if too few / mixed groups
      return manager.importRecoveryPhrase(phrase, options)
    },

    async unlock(): Promise<HybridKeyBundle> {
      if (cachedKeyBundle) {
        return cachedKeyBundle
      }

      const stored = await getStoredIdentity()
      if (!stored) {
        throw new Error('No identity found')
      }

      let keyBundle: HybridKeyBundle

      if (stored.fallback) {
        const result = await unlockFallbackIdentity(stored.passkey, stored.fallback)
        keyBundle = result.keyBundle
      } else {
        const result = await unlockPasskeyIdentity(stored.passkey)
        keyBundle = result.keyBundle
      }

      cachedKeyBundle = keyBundle
      await persistCurrentSession(keyBundle)
      return keyBundle
    },

    async resume(): Promise<HybridKeyBundle | null> {
      if (cachedKeyBundle) {
        return cachedKeyBundle
      }

      const stored = await getStoredIdentity()
      const keyBundle = stored ? await loadSessionForIdentity(stored.passkey.did) : null
      if (keyBundle) {
        cachedKeyBundle = keyBundle
      }
      return cachedKeyBundle
    },

    getCached(): HybridKeyBundle | null {
      return cachedKeyBundle
    },

    async lock(): Promise<void> {
      await clearSession()
      cachedKeyBundle = null
    },

    async clear(): Promise<void> {
      await clearSession().catch(() => {})
      await clearStoredIdentity()
      cachedKeyBundle = null
    }
  }

  return manager
}

/** Session persistence is best-effort: never fail an unlock over it. */
async function persistCurrentSession(keyBundle: HybridKeyBundle): Promise<void> {
  try {
    await persistSession(keyBundle)
  } catch (err) {
    console.warn('[identity] Could not persist session; next reload will re-prompt.', err)
  }
}

/** A session left behind by a previous identity must not unlock this one. */
async function loadSessionForIdentity(expectedDid: string): Promise<HybridKeyBundle | null> {
  const keyBundle = await loadSession()
  if (!keyBundle) {
    return null
  }
  if (keyBundle.identity.did !== expectedDid) {
    await clearSession().catch(() => {})
    return null
  }
  return keyBundle
}
