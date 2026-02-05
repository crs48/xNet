/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPasskeysEmulator } from 'nid-webauthn-emulator'
import { discoverExistingPasskey, unlockDiscoveredPasskey } from './discovery'

describe('discoverExistingPasskey', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when PublicKeyCredential is missing', async () => {
    const saved = (globalThis as unknown as Record<string, unknown>).PublicKeyCredential
    delete (globalThis as unknown as Record<string, unknown>).PublicKeyCredential
    const savedW = (window as unknown as Record<string, unknown>).PublicKeyCredential
    delete (window as unknown as Record<string, unknown>).PublicKeyCredential

    const result = await discoverExistingPasskey()
    expect(result).toBeNull()

    // Restore
    if (saved) {
      Object.defineProperty(globalThis, 'PublicKeyCredential', { value: saved, configurable: true })
    }
    if (savedW) {
      Object.defineProperty(window, 'PublicKeyCredential', { value: savedW, configurable: true })
    }
  })

  it('returns null when conditional mediation is not available', async () => {
    // Mock PublicKeyCredential without isConditionalMediationAvailable
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        prototype: {}
      },
      configurable: true
    })

    const result = await discoverExistingPasskey()
    expect(result).toBeNull()
  })

  it('returns null when conditional mediation returns false', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: {
        isConditionalMediationAvailable: vi.fn().mockResolvedValue(false),
        prototype: {}
      },
      configurable: true
    })

    const result = await discoverExistingPasskey()
    expect(result).toBeNull()
  })
})

describe('unlockDiscoveredPasskey', () => {
  beforeEach(() => {
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when authentication is cancelled', async () => {
    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(null)

    await expect(
      unlockDiscoveredPasskey({
        credentialId: new Uint8Array([1, 2, 3]),
        rpId: 'localhost',
        userHandle: null
      })
    ).rejects.toThrow('Authentication cancelled')
  })

  it('throws when PRF extension is not available', async () => {
    const mockAssertion = {
      id: 'cred-id',
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: 'public-key',
      response: {} as AuthenticatorResponse,
      getClientExtensionResults: () => ({})
    } as unknown as PublicKeyCredential

    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(mockAssertion)

    await expect(
      unlockDiscoveredPasskey({
        credentialId: new Uint8Array([1, 2, 3]),
        rpId: 'localhost',
        userHandle: null
      })
    ).rejects.toThrow('PRF extension not available')
  })

  it('throws in SSR environment', async () => {
    // Temporarily remove navigator
    const saved = globalThis.navigator
    delete (globalThis as unknown as Record<string, unknown>).navigator

    await expect(
      unlockDiscoveredPasskey({
        credentialId: new Uint8Array([1, 2, 3]),
        rpId: 'localhost',
        userHandle: null
      })
    ).rejects.toThrow('WebAuthn not available')

    // Restore
    Object.defineProperty(globalThis, 'navigator', {
      value: saved,
      configurable: true,
      writable: true
    })
  })
})

// ─── Discovery with WebAuthn Emulator ────────────────────────

describe('discoverExistingPasskey (WebAuthn emulator)', () => {
  let emulator: ReturnType<typeof createPasskeysEmulator>

  beforeEach(() => {
    emulator = createPasskeysEmulator({
      origin: 'http://localhost',
      rpId: 'localhost',
      autofill: true
    })

    // Inject emulator PublicKeyCredential and credentials into globals
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: emulator.methods.publicKeyCredentials,
      configurable: true
    })

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        credentials: emulator.methods.credentialsContainer,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120'
      },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('discovers a pre-registered passkey via conditional mediation', async () => {
    // Seed a passkey in the emulator
    emulator.addPasskey('test-user-123')

    const discovered = await discoverExistingPasskey('localhost')

    expect(discovered).not.toBeNull()
    expect(discovered!.credentialId).toBeInstanceOf(Uint8Array)
    expect(discovered!.credentialId.length).toBeGreaterThan(0)
    expect(discovered!.rpId).toBe('localhost')
  })

  it('returns discovered passkey with userHandle when available', async () => {
    emulator.addPasskey('user-with-handle')

    const discovered = await discoverExistingPasskey('localhost')

    expect(discovered).not.toBeNull()
    // The emulator sets userHandle from the userId provided during registration
    expect(discovered!.userHandle).toBeInstanceOf(Uint8Array)
  })

  it('discovers passkey with autofill disabled returns null', async () => {
    // Create a new emulator with autofill disabled
    const noAutofill = createPasskeysEmulator({
      origin: 'http://localhost',
      rpId: 'localhost',
      autofill: false
    })

    Object.defineProperty(window, 'PublicKeyCredential', {
      value: noAutofill.methods.publicKeyCredentials,
      configurable: true
    })

    // isConditionalMediationAvailable returns false
    const result = await discoverExistingPasskey('localhost')
    expect(result).toBeNull()
  })
})

describe('unlockDiscoveredPasskey (WebAuthn emulator)', () => {
  let emulator: ReturnType<typeof createPasskeysEmulator>

  beforeEach(() => {
    emulator = createPasskeysEmulator({
      origin: 'http://localhost',
      rpId: 'localhost',
      autofill: true
    })

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        credentials: emulator.methods.credentialsContainer,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120'
      },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws PRF not available when emulator has no PRF support', async () => {
    // Create a passkey in the emulator (no PRF)
    emulator.addPasskey('prf-test-user')

    // Build a discovered passkey manually using the emulator's credential
    const cred = (await emulator.methods.credentialsContainer.create({
      publicKey: {
        challenge: new Uint8Array(32),
        rp: { id: 'localhost', name: 'xNet' },
        user: {
          id: new Uint8Array(16),
          name: 'test',
          displayName: 'test'
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' as const }],
        authenticatorSelection: {
          residentKey: 'required' as const,
          userVerification: 'required' as const
        }
      }
    })) as PublicKeyCredential

    const discovered = {
      credentialId: new Uint8Array(cred.rawId),
      rpId: 'localhost',
      userHandle: null
    }

    // unlockDiscoveredPasskey requires PRF, which the emulator doesn't provide
    await expect(unlockDiscoveredPasskey(discovered)).rejects.toThrow('PRF extension not available')
  })
})
