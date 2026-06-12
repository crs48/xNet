/**
 * @xnetjs/identity/passkey - IndexedDB persistence for passkey identity records
 */
import type { PasskeyIdentity, FallbackStorage, StoredPasskeyRecord } from './types'
import type { DID } from '../types'

const DB_BASE_NAME = 'xnet-identity'
const DB_VERSION = 2
const STORE_NAME = 'passkeys'
const IDENTITY_KEY = 'primary'

/**
 * Browser storage is origin-scoped, and Pages preview deploys share
 * production's origin (xnet.fyi/pr/<N>/app/ vs xnet.fyi/app/). Hosts set this
 * global before any DB access (apps/web sets it from VITE_STORAGE_SCOPE) so
 * preview builds open their own database instead of production's.
 */
function dbName(): string {
  const scope = (globalThis as { __XNET_STORAGE_SCOPE__?: string }).__XNET_STORAGE_SCOPE__
  return scope ? `${DB_BASE_NAME}--${scope}` : DB_BASE_NAME
}

/** Object store holding resumable unlocked-session records. @internal */
export const SESSION_STORE_NAME = 'sessions'

// ─── IndexedDB Helpers ───────────────────────────────────────

/** @internal Shared with session.ts */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName(), DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
        db.createObjectStore(SESSION_STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** @internal Shared with session.ts */
export function dbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const request = tx.objectStore(store).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

/** @internal Shared with session.ts */
export function dbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/** @internal Shared with session.ts */
export function dbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// ─── Serialization ───────────────────────────────────────────

/** Uint8Arrays don't survive IndexedDB structured cloning in all browsers.
 * @internal Exported for testing only */
export type SerializedRecord = {
  passkey: {
    did: string
    publicKey: number[]
    credentialId: number[]
    createdAt: number
    rpId: string
    mode: 'prf' | 'fallback'
  }
  fallback?: {
    encryptedBundle: number[]
    nonce: number[]
    encKey: number[]
    /** @deprecated Old field name — migrated to `encKey` on read */
    salt?: number[]
  }
}

/** @internal Exported for testing only */
export function serializeRecord(record: StoredPasskeyRecord): SerializedRecord {
  const serialized: SerializedRecord = {
    passkey: {
      did: record.passkey.did,
      publicKey: Array.from(record.passkey.publicKey),
      credentialId: Array.from(record.passkey.credentialId),
      createdAt: record.passkey.createdAt,
      rpId: record.passkey.rpId,
      mode: record.passkey.mode
    }
  }
  if (record.fallback) {
    serialized.fallback = {
      encryptedBundle: Array.from(record.fallback.encryptedBundle),
      nonce: Array.from(record.fallback.nonce),
      encKey: Array.from(record.fallback.encKey)
    }
  }
  return serialized
}

/** @internal Exported for testing only */
export function deserializeRecord(raw: SerializedRecord): StoredPasskeyRecord {
  const record: StoredPasskeyRecord = {
    passkey: {
      did: raw.passkey.did as DID,
      publicKey: new Uint8Array(raw.passkey.publicKey),
      credentialId: new Uint8Array(raw.passkey.credentialId),
      createdAt: raw.passkey.createdAt,
      rpId: raw.passkey.rpId,
      mode: raw.passkey.mode
    }
  }
  if (raw.fallback) {
    // Support migration from old `salt` field name to `encKey`
    const keyData = raw.fallback.encKey ?? raw.fallback.salt
    record.fallback = {
      encryptedBundle: new Uint8Array(raw.fallback.encryptedBundle),
      nonce: new Uint8Array(raw.fallback.nonce),
      encKey: keyData ? new Uint8Array(keyData) : new Uint8Array(0)
    }
  }
  return record
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Store a passkey identity record in IndexedDB.
 * Only one identity is supported at a time (keyed as 'primary').
 */
export async function storeIdentity(
  passkey: PasskeyIdentity,
  fallback?: FallbackStorage
): Promise<void> {
  const db = await openDB()
  try {
    const record: StoredPasskeyRecord = { passkey, fallback }
    await dbPut(db, STORE_NAME, IDENTITY_KEY, serializeRecord(record))
  } finally {
    db.close()
  }
}

/**
 * Retrieve the stored passkey identity record, or null if none exists.
 */
export async function getStoredIdentity(): Promise<StoredPasskeyRecord | null> {
  const db = await openDB()
  try {
    const raw = await dbGet<SerializedRecord>(db, STORE_NAME, IDENTITY_KEY)
    if (!raw) return null
    return deserializeRecord(raw)
  } finally {
    db.close()
  }
}

/**
 * Clear the stored identity from IndexedDB.
 */
export async function clearStoredIdentity(): Promise<void> {
  const db = await openDB()
  try {
    await dbDelete(db, STORE_NAME, IDENTITY_KEY)
  } finally {
    db.close()
  }
}
