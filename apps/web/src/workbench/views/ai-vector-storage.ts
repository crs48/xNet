/**
 * IndexedDB-backed blob store for the AI chat's semantic vector tier (0211).
 *
 * Lets `createVectorEntrySearch` restore the embedding index across sessions
 * instead of re-embedding the whole graph every time. Thin glue over IndexedDB
 * (durable, holds the ~tens-of-KB serialized index, no size cap like
 * localStorage). Returns `undefined` where IndexedDB is unavailable, in which
 * case the tier simply re-backfills — still correct, just not persisted.
 *
 * Note: IndexedDB round-trips bytes through structured clone, which can hand back
 * a cross-realm `Uint8Array`; the `@xnetjs/brain` persist layer is realm-robust
 * for exactly this reason.
 */
import type { BlobStore } from '@xnetjs/brain'

const DB_NAME = 'xnet-ai-vectors'
const STORE_NAME = 'tier'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runRequest<T>(
  makeRequest: (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode
) {
  return async (): Promise<T> => {
    const db = await openDb()
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = makeRequest(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  }
}

/**
 * Create an IndexedDB-backed `BlobStore`, or `undefined` when IndexedDB is
 * unavailable (SSR, locked-down environments) — the caller treats that as
 * "no persistence" and falls back to re-embedding.
 */
export function createVectorBlobStore(): BlobStore | undefined {
  if (typeof indexedDB === 'undefined') return undefined
  return {
    async getBlob(key) {
      const value = await runRequest<unknown>((store) => store.get(key), 'readonly')()
      return value instanceof Uint8Array
        ? value
        : value == null
          ? null
          : new Uint8Array(value as ArrayBuffer)
    },
    setBlob(key, data) {
      return runRequest((store) => store.put(data, key), 'readwrite')().then(() => undefined)
    }
  }
}
