/**
 * @vitest-environment jsdom
 */
import { createPasskeysEmulator } from 'nid-webauthn-emulator'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { deriveKeySeed, PRF_INPUT } from './derive'
import { detectPasskeySupport } from './support'

// ─── HKDF Key Derivation ────────────────────────────────────

describe('deriveKeySeed', () => {
  it('derives a 32-byte seed from PRF output', async () => {
    const prfOutput = new Uint8Array(32).fill(42)
    const seed = await deriveKeySeed(prfOutput)

    expect(seed).toBeInstanceOf(Uint8Array)
    expect(seed.length).toBe(32)
  })

  it('produces deterministic output for same input', async () => {
    const prfOutput = new Uint8Array(32).fill(99)
    const seed1 = await deriveKeySeed(prfOutput)
    const seed2 = await deriveKeySeed(prfOutput)

    expect(seed1).toEqual(seed2)
  })

  it('produces different output for different input', async () => {
    const prf1 = new Uint8Array(32).fill(1)
    const prf2 = new Uint8Array(32).fill(2)

    const seed1 = await deriveKeySeed(prf1)
    const seed2 = await deriveKeySeed(prf2)

    expect(seed1).not.toEqual(seed2)
  })

  it('PRF_INPUT is a fixed constant', () => {
    expect(PRF_INPUT.length).toBeGreaterThan(0)
    expect(PRF_INPUT.constructor.name).toBe('Uint8Array')
    // Ensure it's the same value each time (constant)
    const expected = new TextEncoder().encode('xnet-identity-key')
    expect(Array.from(PRF_INPUT)).toEqual(Array.from(expected))
  })
})

// ─── Full Create/Unlock Integration ─────────────────────────

describe('createPasskeyIdentity + unlockPasskeyIdentity', () => {
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
          return {
            prf: { results: { first: prfOutput.buffer } }
          }
        }
        return {}
      }
    } as unknown as PublicKeyCredential
  }

  function createMockAssertion(prfOutput: Uint8Array | null): PublicKeyCredential {
    return {
      id: 'mock-credential-id',
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {} as AuthenticatorResponse,
      getClientExtensionResults: () => {
        if (prfOutput) {
          return {
            prf: { results: { first: prfOutput.buffer } }
          }
        }
        return {}
      }
    } as unknown as PublicKeyCredential
  }

  beforeEach(() => {
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates identity with PRF-derived key', async () => {
    const { createPasskeyIdentity } = await import('./create')

    const mockCred = createMockCredential(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(mockCred)

    const result = await createPasskeyIdentity({ rpId: 'localhost' })

    expect(result.keyBundle.identity.did).toMatch(/^did:key:z/)
    expect(result.keyBundle.signingKey).toBeInstanceOf(Uint8Array)
    expect(result.keyBundle.signingKey.length).toBe(32)
    expect(result.passkey.mode).toBe('prf')
    expect(result.passkey.did).toBe(result.keyBundle.identity.did)
  })

  it('throws if PRF not supported by authenticator', async () => {
    const { createPasskeyIdentity } = await import('./create')

    const mockCred = createMockCredential(null) // no PRF output
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(mockCred)

    await expect(createPasskeyIdentity({ rpId: 'localhost' })).rejects.toThrow(
      'PRF extension not supported'
    )
  })

  it('throws if creation cancelled', async () => {
    const { createPasskeyIdentity } = await import('./create')

    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(null)

    await expect(createPasskeyIdentity({ rpId: 'localhost' })).rejects.toThrow(
      'Passkey creation cancelled'
    )
  })

  it('derives same key from same PRF output on unlock', async () => {
    const { createPasskeyIdentity } = await import('./create')
    const { unlockPasskeyIdentity } = await import('./unlock')

    // Create
    const createMock = createMockCredential(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(createMock)
    const created = await createPasskeyIdentity({ rpId: 'localhost' })

    // Unlock with same PRF output
    const getMock = createMockAssertion(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(getMock)
    const unlocked = await unlockPasskeyIdentity(created.passkey)

    expect(unlocked.keyBundle.identity.did).toBe(created.keyBundle.identity.did)
    expect(unlocked.keyBundle.signingKey).toEqual(created.keyBundle.signingKey)
    expect(unlocked.keyBundle.encryptionKey).toEqual(created.keyBundle.encryptionKey)
  })

  it('throws identity mismatch on wrong PRF output', async () => {
    const { createPasskeyIdentity } = await import('./create')
    const { unlockPasskeyIdentity } = await import('./unlock')

    // Create with one PRF output
    const createMock = createMockCredential(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(createMock)
    const created = await createPasskeyIdentity({ rpId: 'localhost' })

    // Unlock with different PRF output
    const differentPrf = new Uint8Array(32).fill(0xff)
    const getMock = createMockAssertion(differentPrf)
    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(getMock)

    await expect(unlockPasskeyIdentity(created.passkey)).rejects.toThrow('Identity mismatch')
  })

  it('throws if unlock cancelled', async () => {
    const { unlockPasskeyIdentity } = await import('./unlock')
    const { createPasskeyIdentity } = await import('./create')

    const createMock = createMockCredential(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(createMock)
    const created = await createPasskeyIdentity({ rpId: 'localhost' })

    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(null)

    await expect(unlockPasskeyIdentity(created.passkey)).rejects.toThrow('Authentication cancelled')
  })

  it('throws if PRF not available on unlock', async () => {
    const { unlockPasskeyIdentity } = await import('./unlock')
    const { createPasskeyIdentity } = await import('./create')

    const createMock = createMockCredential(FIXED_PRF_OUTPUT)
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(createMock)
    const created = await createPasskeyIdentity({ rpId: 'localhost' })

    const noPrfMock = createMockAssertion(null)
    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(noPrfMock)

    await expect(unlockPasskeyIdentity(created.passkey)).rejects.toThrow(
      'PRF extension not available'
    )
  })
})

// ─── Support Detection ───────────────────────────────────────

describe('detectPasskeySupport', () => {
  const originalPKC = globalThis.PublicKeyCredential

  afterEach(() => {
    // Restore
    if (originalPKC) {
      Object.defineProperty(globalThis, 'PublicKeyCredential', {
        value: originalPKC,
        configurable: true
      })
    }
  })

  it('detects no WebAuthn when PublicKeyCredential is missing', async () => {
    // In jsdom, PublicKeyCredential doesn't exist by default
    const saved = (globalThis as Record<string, unknown>).PublicKeyCredential
    delete (globalThis as Record<string, unknown>).PublicKeyCredential

    const support = await detectPasskeySupport()
    expect(support.webauthn).toBe(false)
    expect(support.prf).toBe(false)
    expect(support.platform).toBe(false)

    // Restore
    if (saved) {
      Object.defineProperty(globalThis, 'PublicKeyCredential', {
        value: saved,
        configurable: true
      })
    }
  })

  it('detects WebAuthn when PublicKeyCredential exists', async () => {
    // Mock PublicKeyCredential
    const mockPKC = {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      prototype: {
        getClientExtensionResults: vi.fn()
      }
    }
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      value: mockPKC,
      configurable: true
    })

    const support = await detectPasskeySupport()
    expect(support.webauthn).toBe(true)
    expect(support.platform).toBe(true)
    expect(support.prf).toBe(true) // getClientExtensionResults exists on prototype
  })
})

// ─── Fallback ────────────────────────────────────────────────

describe('fallback identity', () => {
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

  it('creates and unlocks fallback identity', async () => {
    const { createFallbackIdentity, unlockFallbackIdentity } = await import('./fallback')

    // Mock credential.create (no PRF)
    const rawId = new Uint8Array([10, 20, 30, 40])
    const mockCred = {
      id: 'fallback-cred',
      rawId: rawId.buffer,
      type: 'public-key',
      response: {} as AuthenticatorResponse,
      getClientExtensionResults: () => ({})
    } as unknown as PublicKeyCredential

    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(mockCred)

    const created = await createFallbackIdentity('localhost')
    expect(created.passkey.mode).toBe('fallback')
    expect(created.fallback.encryptedBundle.length).toBeGreaterThan(0)

    // Mock credential.get for unlock
    const mockAssertion = {
      id: 'fallback-cred',
      rawId: rawId.buffer,
      type: 'public-key',
      response: {} as AuthenticatorResponse,
      getClientExtensionResults: () => ({})
    } as unknown as PublicKeyCredential

    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(mockAssertion)

    const unlocked = await unlockFallbackIdentity(created.passkey, created.fallback)
    expect(unlocked.keyBundle.identity.did).toBe(created.keyBundle.identity.did)
    expect(unlocked.keyBundle.signingKey).toEqual(created.keyBundle.signingKey)
  })

  it('throws if fallback creation cancelled', async () => {
    const { createFallbackIdentity } = await import('./fallback')
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(null)

    await expect(createFallbackIdentity('localhost')).rejects.toThrow('Passkey creation cancelled')
  })

  it('throws if fallback unlock cancelled', async () => {
    const { createFallbackIdentity, unlockFallbackIdentity } = await import('./fallback')

    const rawId = new Uint8Array([10, 20, 30, 40])
    const mockCred = {
      id: 'fallback-cred',
      rawId: rawId.buffer,
      type: 'public-key',
      response: {} as AuthenticatorResponse,
      getClientExtensionResults: () => ({})
    } as unknown as PublicKeyCredential

    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(mockCred)
    const created = await createFallbackIdentity('localhost')

    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(null)

    await expect(unlockFallbackIdentity(created.passkey, created.fallback)).rejects.toThrow(
      'Authentication cancelled'
    )
  })
})

// ─── Fallback with WebAuthn Emulator ─────────────────────────

describe('fallback identity (WebAuthn emulator)', () => {
  let emulator: ReturnType<typeof createPasskeysEmulator>

  beforeEach(() => {
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates fallback identity with real WebAuthn credential', async () => {
    const { createFallbackIdentity } = await import('./fallback')

    const result = await createFallbackIdentity('localhost')

    expect(result.keyBundle.identity.did).toMatch(/^did:key:z/)
    expect(result.keyBundle.signingKey).toBeInstanceOf(Uint8Array)
    expect(result.keyBundle.signingKey.length).toBe(32)
    expect(result.passkey.mode).toBe('fallback')
    expect(result.passkey.rpId).toBe('localhost')
    expect(result.passkey.credentialId).toBeInstanceOf(Uint8Array)
    expect(result.passkey.credentialId.length).toBeGreaterThan(0)
    expect(result.fallback.encryptedBundle.length).toBeGreaterThan(0)
    expect(result.fallback.nonce.length).toBeGreaterThan(0)
    expect(result.fallback.encKey.length).toBeGreaterThan(0)
  })

  it('creates and unlocks fallback identity with real WebAuthn responses', async () => {
    const { createFallbackIdentity, unlockFallbackIdentity } = await import('./fallback')

    // Create identity — emulator handles the credential.create call
    const created = await createFallbackIdentity('localhost')
    expect(created.passkey.mode).toBe('fallback')

    // Unlock — emulator handles the credential.get call with the same credential
    const unlocked = await unlockFallbackIdentity(created.passkey, created.fallback)

    // Should derive the exact same identity
    expect(unlocked.keyBundle.identity.did).toBe(created.keyBundle.identity.did)
    expect(unlocked.keyBundle.signingKey).toEqual(created.keyBundle.signingKey)
    expect(unlocked.keyBundle.encryptionKey).toEqual(created.keyBundle.encryptionKey)
  })

  it('produces unique identities for separate create calls', async () => {
    const { createFallbackIdentity } = await import('./fallback')

    const identity1 = await createFallbackIdentity('localhost')
    const identity2 = await createFallbackIdentity('localhost')

    // Each call generates a random keypair, so DIDs must differ
    expect(identity1.keyBundle.identity.did).not.toBe(identity2.keyBundle.identity.did)
    expect(identity1.passkey.credentialId).not.toEqual(identity2.passkey.credentialId)
  })

  it('PRF create correctly throws when emulator has no PRF support', async () => {
    const { createPasskeyIdentity } = await import('./create')

    // The emulator doesn't support PRF, so createPasskeyIdentity should throw
    await expect(createPasskeyIdentity({ rpId: 'localhost' })).rejects.toThrow(
      'PRF extension not supported'
    )
  })
})
