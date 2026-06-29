/**
 * @xnetjs/identity/passkey/test-bypass - Test authentication bypass
 *
 * Allows Playwright and other automated tests to bypass WebAuthn/passkey
 * authentication by creating deterministic test identities.
 *
 * SECURITY: This MUST only be enabled in test environments via the
 * XNET_TEST_BYPASS environment variable.
 */
import type { HybridKeyBundle } from '../types'
import { createKeyBundle } from '../key-bundle'
import {
  createRecoverableIdentity,
  recoveryPhraseToBundle,
  validateRecoveryPhrase
} from '../recoverable'

const TEST_BYPASS_IDENTITY_MARKER = 'xnet:test:identity-created'
const TEST_BYPASS_SESSION_MARKER = 'xnet:test:session-active'

function readMarker(key: string): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  return localStorage.getItem(key) === 'true'
}

function writeMarker(key: string, enabled: boolean): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  if (enabled) {
    localStorage.setItem(key, 'true')
    return
  }

  localStorage.removeItem(key)
}

function readTestIdentityMarker(): boolean {
  return readMarker(TEST_BYPASS_IDENTITY_MARKER)
}

function writeTestIdentityMarker(enabled: boolean): void {
  writeMarker(TEST_BYPASS_IDENTITY_MARKER, enabled)
}

/**
 * Check if test bypass mode is enabled.
 * Returns true if XNET_TEST_BYPASS environment variable is set to 'true'.
 */
export function isTestBypassEnabled(): boolean {
  // Check browser environment variable (set via vite config)
  if (
    typeof import.meta !== 'undefined' &&
    'env' in import.meta &&
    ((import.meta as { env?: Record<string, unknown> }).env?.XNET_TEST_BYPASS === 'true' ||
      (import.meta as { env?: Record<string, unknown> }).env?.VITE_XNET_TEST_BYPASS === 'true')
  ) {
    return true
  }

  // Check Node.js environment variable
  if (typeof process !== 'undefined' && process.env?.XNET_TEST_BYPASS === 'true') {
    return true
  }

  // Check localStorage flag (for runtime testing in browser)
  if (
    typeof window !== 'undefined' &&
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('xnet:test:bypass') === 'true'
  ) {
    return true
  }

  return false
}

/**
 * Create a deterministic test identity.
 * This generates the same identity every time for consistent testing.
 *
 * SECURITY WARNING: This bypasses all authentication. Only use in test environments.
 *
 * @param seed - Optional seed string for creating different test identities (default: 'test')
 */
export function createTestIdentity(seed = 'test'): HybridKeyBundle {
  if (!isTestBypassEnabled()) {
    throw new Error(
      'Test bypass is not enabled. Set XNET_TEST_BYPASS=true or localStorage.setItem("xnet:test:bypass", "true")'
    )
  }

  // Create a deterministic seed from the input string
  const encoder = new TextEncoder()
  const seedBytes = encoder.encode(`xnet-test-identity-${seed}`)

  // Pad or truncate to 32 bytes for Ed25519
  const privateKey = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    privateKey[i] = seedBytes[i % seedBytes.length] ^ (i * 7) // XOR with position for variation
  }

  // Create full hybrid key bundle from the deterministic seed
  const keyBundle = createKeyBundle({ seed: privateKey })

  return keyBundle
}

/**
 * Test identity manager that bypasses WebAuthn authentication.
 * Drop-in replacement for createIdentityManager() in test environments.
 *
 * @example
 * // In test setup:
 * localStorage.setItem('xnet:test:bypass', 'true')
 * const manager = createTestIdentityManager()
 * const keys = await manager.create() // No WebAuthn prompt
 */
export function createTestIdentityManager() {
  if (!isTestBypassEnabled()) {
    throw new Error(
      'Test bypass is not enabled. Set XNET_TEST_BYPASS=true or localStorage.setItem("xnet:test:bypass", "true")'
    )
  }

  let cachedKeyBundle: HybridKeyBundle | null = null
  let storedInMemory = false
  let recoverablePhrase: string | null = null

  return {
    async preflight(): Promise<void> {
      // No-op in test mode
    },

    async hasIdentity(): Promise<boolean> {
      return storedInMemory || readTestIdentityMarker()
    },

    async create(): Promise<HybridKeyBundle> {
      const keyBundle = createTestIdentity()
      cachedKeyBundle = keyBundle
      storedInMemory = true
      writeTestIdentityMarker(true)
      writeMarker(TEST_BYPASS_SESSION_MARKER, true)
      return keyBundle
    },

    async createRecoverable(options?: { words?: number }): Promise<{
      keyBundle: HybridKeyBundle
      phrase: string
    }> {
      const { phrase, bundle } = createRecoverableIdentity(
        options?.words ? { words: options.words } : {}
      )
      recoverablePhrase = phrase
      cachedKeyBundle = bundle
      storedInMemory = true
      writeTestIdentityMarker(true)
      writeMarker(TEST_BYPASS_SESSION_MARKER, true)
      return { keyBundle: bundle, phrase }
    },

    async importRecoveryPhrase(phrase: string): Promise<{
      keyBundle: HybridKeyBundle
      phrase: string
    }> {
      const validation = validateRecoveryPhrase(phrase)
      if (!validation.ok) throw new Error('That recovery phrase is not valid')
      const normalized = validation.words.join(' ')
      const keyBundle = recoveryPhraseToBundle(normalized)
      recoverablePhrase = normalized
      cachedKeyBundle = keyBundle
      storedInMemory = true
      writeTestIdentityMarker(true)
      writeMarker(TEST_BYPASS_SESSION_MARKER, true)
      return { keyBundle, phrase: normalized }
    },

    async exportRecoveryPhrase(): Promise<string | null> {
      return recoverablePhrase
    },

    async isRecoverable(): Promise<boolean> {
      return recoverablePhrase !== null
    },

    async recoverViaSyncedPasskey(): Promise<HybridKeyBundle | null> {
      // No real WebAuthn in test mode — no synced passkey to discover.
      return null
    },

    async unlock(): Promise<HybridKeyBundle> {
      if (cachedKeyBundle) {
        return cachedKeyBundle
      }

      if (!storedInMemory && !readTestIdentityMarker()) {
        throw new Error('No test identity found')
      }

      const keyBundle = createTestIdentity()
      cachedKeyBundle = keyBundle
      storedInMemory = true
      writeMarker(TEST_BYPASS_SESSION_MARKER, true)
      return keyBundle
    },

    async resume(): Promise<HybridKeyBundle | null> {
      if (cachedKeyBundle) {
        return cachedKeyBundle
      }

      // Mirrors real semantics: resume only works while a session is active
      // (both markers are written together on create/unlock)
      if (!readMarker(TEST_BYPASS_SESSION_MARKER) || !readTestIdentityMarker()) {
        return null
      }

      const keyBundle = createTestIdentity()
      cachedKeyBundle = keyBundle
      storedInMemory = true
      return keyBundle
    },

    getCached(): HybridKeyBundle | null {
      return cachedKeyBundle
    },

    async lock(): Promise<void> {
      cachedKeyBundle = null
      writeMarker(TEST_BYPASS_SESSION_MARKER, false)
    },

    async clear(): Promise<void> {
      cachedKeyBundle = null
      storedInMemory = false
      recoverablePhrase = null
      writeTestIdentityMarker(false)
      writeMarker(TEST_BYPASS_SESSION_MARKER, false)
    }
  }
}
