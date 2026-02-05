/**
 * Tests for the createIdentityManager facade.
 * @vitest-environment jsdom
 */
import { createPasskeysEmulator } from 'nid-webauthn-emulator'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { clearStoredIdentity, getStoredIdentity } from './storage'

// ─── Helpers ─────────────────────────────────────────────────

const FIXED_PRF_OUTPUT = new Uint8Array(32).fill(0xab)

function createMockCredential(prfOutput: Uint8Array | null): PublicKeyCredential {
  const rawId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  return {
    id: 'mock-credential-id',
    rawId: rawId.buffer,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {} as AuthenticatorResponse,
    getClientExtensionResults: () => {
      if (prfOutput) {
        return { prf: { results: { first: prfOutput.buffer } } }
      }
      return {}
    }
  } as unknown as PublicKeyCredential
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _createMockAssertion(prfOutput: Uint8Array | null): PublicKeyCredential {
  return {
    id: 'mock-credential-id',
    rawId: new Uint8Array([1, 2, 3, 4]).buffer,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {} as AuthenticatorResponse,
    getClientExtensionResults: () => {
      if (prfOutput) {
        return { prf: { results: { first: prfOutput.buffer } } }
      }
      return {}
    }
  } as unknown as PublicKeyCredential
}

// ─── Tests ───────────────────────────────────────────────────

describe('createIdentityManager', () => {
  beforeEach(async () => {
    await clearStoredIdentity()

    // Mock navigator.credentials
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        credentials: {
          create: vi.fn(),
          get: vi.fn()
        },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120'
      },
      writable: true,
      configurable: true
    })

    // Mock PublicKeyCredential with PRF + platform support
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        prototype: {
          getClientExtensionResults: vi.fn()
        }
      },
      configurable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hasIdentity returns false when no identity stored', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    expect(await manager.hasIdentity()).toBe(false)
  })

  it('create stores identity and caches key bundle', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    const mockCred = createMockCredential(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(mockCred)

    const keyBundle = await manager.create({ rpId: 'localhost' })

    expect(keyBundle.identity.did).toMatch(/^did:key:z/)
    expect(keyBundle.signingKey).toBeInstanceOf(Uint8Array)
    expect(keyBundle.signingKey.length).toBe(32)

    // Should be cached
    expect(manager.getCached()).toBe(keyBundle)

    // Should be stored in IndexedDB
    expect(await manager.hasIdentity()).toBe(true)
    const stored = await getStoredIdentity()
    expect(stored).not.toBeNull()
    expect(stored!.passkey.did).toBe(keyBundle.identity.did)
  })

  it('getCached returns null before create/unlock', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    expect(manager.getCached()).toBeNull()
  })

  it('unlock returns cached key without prompting again', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    const mockCred = createMockCredential(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(mockCred)

    const created = await manager.create({ rpId: 'localhost' })
    const unlocked = await manager.unlock()

    // Should return the same cached instance
    expect(unlocked).toBe(created)

    // navigator.credentials.get should NOT have been called (served from cache)
    expect(navigator.credentials.get).not.toHaveBeenCalled()
  })

  it('unlock throws when no identity stored', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    await expect(manager.unlock()).rejects.toThrow('No identity found')
  })

  it('clear removes identity from cache and storage', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    const mockCred = createMockCredential(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(mockCred)

    await manager.create({ rpId: 'localhost' })
    expect(manager.getCached()).not.toBeNull()
    expect(await manager.hasIdentity()).toBe(true)

    await manager.clear()

    expect(manager.getCached()).toBeNull()
    expect(await manager.hasIdentity()).toBe(false)
  })

  it('create throws when passkeys not supported', async () => {
    // Override PublicKeyCredential to report no platform authenticator
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false),
        prototype: {}
      },
      configurable: true
    })

    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    await expect(manager.create()).rejects.toThrow('Passkeys not supported')
  })
})

// ─── Identity Manager with WebAuthn Emulator (Fallback Path) ─

describe('createIdentityManager (WebAuthn emulator, fallback path)', () => {
  let emulator: ReturnType<typeof createPasskeysEmulator>

  beforeEach(async () => {
    await clearStoredIdentity()

    emulator = createPasskeysEmulator({
      origin: 'http://localhost',
      rpId: 'localhost',
      autofill: true
    })

    // Inject emulator into globals
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        credentials: emulator.methods.credentialsContainer,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120'
      },
      writable: true,
      configurable: true
    })

    // Mock PublicKeyCredential with platform support but NO PRF support
    // (no getClientExtensionResults on prototype → prf detection returns false)
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        prototype: {}
      },
      configurable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates fallback identity when PRF not supported', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    const keyBundle = await manager.create({ rpId: 'localhost' })

    expect(keyBundle.identity.did).toMatch(/^did:key:z/)
    expect(keyBundle.signingKey).toBeInstanceOf(Uint8Array)
    expect(keyBundle.signingKey.length).toBe(32)

    // Should be stored as fallback mode
    const stored = await getStoredIdentity()
    expect(stored).not.toBeNull()
    expect(stored!.passkey.mode).toBe('fallback')
    expect(stored!.fallback).toBeDefined()
    expect(stored!.fallback!.encryptedBundle.length).toBeGreaterThan(0)
  })

  it('creates and unlocks fallback identity via manager', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    await manager.create({ rpId: 'localhost' })

    // Clear cache to force unlock from storage
    await manager.clear()
    const manager2 = createIdentityManager()

    // Re-store the identity (clear removed it)
    const { createFallbackIdentity } = await import('./fallback')
    const freshResult = await createFallbackIdentity('localhost')
    const { storeIdentity } = await import('./storage')
    await storeIdentity(freshResult.passkey, freshResult.fallback)

    const unlocked = await manager2.unlock()

    // Should produce a valid key bundle
    expect(unlocked.identity.did).toMatch(/^did:key:z/)
    expect(unlocked.signingKey).toBeInstanceOf(Uint8Array)
    expect(unlocked.signingKey.length).toBe(32)

    // Should be cached after unlock
    expect(manager2.getCached()).toBe(unlocked)
  })

  it('caches key bundle after fallback create', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    expect(manager.getCached()).toBeNull()

    const keyBundle = await manager.create({ rpId: 'localhost' })

    expect(manager.getCached()).toBe(keyBundle)
  })

  it('unlock returns cache without re-prompting after create', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    const created = await manager.create({ rpId: 'localhost' })
    const unlocked = await manager.unlock()

    // Should be the exact same cached reference
    expect(unlocked).toBe(created)
  })

  it('clear removes fallback identity from storage and cache', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    await manager.create({ rpId: 'localhost' })
    expect(await manager.hasIdentity()).toBe(true)
    expect(manager.getCached()).not.toBeNull()

    await manager.clear()

    expect(manager.getCached()).toBeNull()
    expect(await manager.hasIdentity()).toBe(false)
  })
})
