/**
 * Tests for recoverable identities on the IdentityManager (exploration 0243).
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { didForRecoveryPhrase, validateRecoveryPhrase } from '../recoverable'

const DB_NAME = 'xnet-identity'

async function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

function mockCredential(prfOutput?: Uint8Array): PublicKeyCredential {
  const rawId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  return {
    id: 'mock-credential-id',
    rawId: rawId.buffer,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {} as AuthenticatorResponse,
    getClientExtensionResults: () =>
      prfOutput ? { prf: { results: { first: prfOutput.buffer } } } : {}
  } as unknown as PublicKeyCredential
}

describe('recoverable identities (IdentityManager)', () => {
  beforeEach(async () => {
    await deleteDatabase()
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        credentials: {
          create: vi.fn().mockResolvedValue(mockCredential()),
          get: vi.fn().mockResolvedValue(mockCredential())
        },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120'
      },
      writable: true,
      configurable: true
    })
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        prototype: { getClientExtensionResults: vi.fn() }
      },
      configurable: true
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('createRecoverable: phrase rebuilds the same DID, is revealable, and is marked recoverable', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()

    const { keyBundle, phrase } = await manager.createRecoverable({ rpId: 'localhost' })

    expect(validateRecoveryPhrase(phrase).ok).toBe(true)
    expect(keyBundle.identity.did).toBe(didForRecoveryPhrase(phrase))
    expect(await manager.hasIdentity()).toBe(true)
    expect(await manager.isRecoverable()).toBe(true)
    // Revealing the phrase (Settings "view phrase") returns exactly what we generated.
    expect(await manager.exportRecoveryPhrase()).toBe(phrase)
  })

  it('importRecoveryPhrase: the same phrase reproduces the same DID on a fresh device', async () => {
    const { createIdentityManager } = await import('./index')
    const deviceA = createIdentityManager()
    const { phrase, keyBundle } = await deviceA.createRecoverable({ rpId: 'localhost' })

    // Simulate a new device with no stored identity (the passkey was lost).
    await deleteDatabase()
    const deviceB = createIdentityManager()
    const imported = await deviceB.importRecoveryPhrase(phrase, { rpId: 'localhost' })

    expect(imported.keyBundle.identity.did).toBe(keyBundle.identity.did)
    expect(await deviceB.isRecoverable()).toBe(true)
    expect(await deviceB.exportRecoveryPhrase()).toBe(phrase)
  })

  it('rejects an invalid recovery phrase on import', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()
    await expect(manager.importRecoveryPhrase('not enough words')).rejects.toThrow()
    expect(await manager.hasIdentity()).toBe(false)
  })

  it('an ordinary PRF identity is NOT recoverable and reveals no phrase (opt-in)', async () => {
    const { createIdentityManager } = await import('./index')
    const manager = createIdentityManager()
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue(
      mockCredential(new Uint8Array(32).fill(0xab))
    )

    await manager.create({ rpId: 'localhost' })

    expect(await manager.isRecoverable()).toBe(false)
    expect(await manager.exportRecoveryPhrase()).toBeNull()
  })
})
