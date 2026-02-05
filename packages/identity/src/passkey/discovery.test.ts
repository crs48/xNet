/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
