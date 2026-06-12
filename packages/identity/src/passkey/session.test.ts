/**
 * Tests for the resumable unlocked-session cache.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createKeyBundle } from '../key-bundle'
import { persistSession, loadSession, clearSession, SESSION_TTL_MS } from './session'

// Must match storage.ts / session.ts
const DB_NAME = 'xnet-identity'
const SESSION_STORE = 'sessions'
const SESSION_KEY = 'primary'

async function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

function openExistingDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readRawSessionRecord(): Promise<unknown> {
  const db = await openExistingDB()
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(SESSION_STORE, 'readonly')
        .objectStore(SESSION_STORE)
        .get(SESSION_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

async function writeRawSessionRecord(record: unknown): Promise<void> {
  const db = await openExistingDB()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(SESSION_STORE, 'readwrite')
        .objectStore(SESSION_STORE)
        .put(record, SESSION_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

function testBundle(seedByte: number, includePQ = false) {
  return createKeyBundle({ seed: new Uint8Array(32).fill(seedByte), includePQ })
}

describe('passkey session persistence', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it('round-trips a key bundle across persist/load', async () => {
    const bundle = testBundle(7)
    await persistSession(bundle)

    const loaded = await loadSession()
    expect(loaded).not.toBeNull()
    expect(loaded!.identity.did).toBe(bundle.identity.did)
    expect(Array.from(loaded!.signingKey)).toEqual(Array.from(bundle.signingKey))
    expect(Array.from(loaded!.encryptionKey)).toEqual(Array.from(bundle.encryptionKey))
  })

  it('returns null when nothing is persisted', async () => {
    expect(await loadSession()).toBeNull()
  })

  it('preserves post-quantum keys', async () => {
    const bundle = testBundle(9, true)
    expect(bundle.pqSigningKey).toBeDefined()

    await persistSession(bundle)
    const loaded = await loadSession()

    expect(loaded).not.toBeNull()
    expect(loaded!.maxSecurityLevel).toBe(bundle.maxSecurityLevel)
    expect(Array.from(loaded!.pqSigningKey!)).toEqual(Array.from(bundle.pqSigningKey!))
    expect(Array.from(loaded!.pqEncryptionKey!)).toEqual(Array.from(bundle.pqEncryptionKey!))
  })

  it('does not store private keys in plaintext and keeps the wrapping key non-extractable', async () => {
    const bundle = testBundle(11)
    await persistSession(bundle)

    const raw = (await readRawSessionRecord()) as {
      wrappingKey: CryptoKey
      ciphertext: ArrayBuffer
    }
    expect(raw.wrappingKey).toBeInstanceOf(CryptoKey)
    expect(raw.wrappingKey.extractable).toBe(false)

    // Ciphertext must not contain the raw signing key bytes
    const ct = new Uint8Array(raw.ciphertext)
    const needle = bundle.signingKey
    let found = false
    outer: for (let i = 0; i + needle.length <= ct.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (ct[i + j] !== needle[j]) continue outer
      }
      found = true
      break
    }
    expect(found).toBe(false)
  })

  it('expires sessions and deletes the record on the way out', async () => {
    const bundle = testBundle(3)
    await persistSession(bundle, -1)

    expect(await loadSession()).toBeNull()
    expect(await readRawSessionRecord()).toBeUndefined()
  })

  it('uses a 7-day default TTL', () => {
    expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('clearSession removes the persisted session', async () => {
    await persistSession(testBundle(5))
    await clearSession()
    expect(await loadSession()).toBeNull()
  })

  it('rejects tampered ciphertext and clears the record', async () => {
    await persistSession(testBundle(13))

    const raw = (await readRawSessionRecord()) as { ciphertext: ArrayBuffer }
    const tampered = new Uint8Array(raw.ciphertext.slice(0))
    tampered[0] ^= 0xff
    await writeRawSessionRecord({ ...raw, ciphertext: tampered.buffer })

    expect(await loadSession()).toBeNull()
    expect(await readRawSessionRecord()).toBeUndefined()
  })

  it('persisting again overwrites the previous session', async () => {
    const first = testBundle(21)
    const second = testBundle(22)
    await persistSession(first)
    await persistSession(second)

    const loaded = await loadSession()
    expect(loaded!.identity.did).toBe(second.identity.did)
  })
})
