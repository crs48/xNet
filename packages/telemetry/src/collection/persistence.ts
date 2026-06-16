/**
 * Durable telemetry buffer — closes the "collection is in-memory only" gap
 * (exploration 0187).
 *
 * The TelemetryCollector keeps a live in-memory working set, but without a
 * backing store nothing survives a reload, so any un-synced records are lost.
 * A TelemetryBufferStore is an optional write-through cache the collector
 * mirrors into: web uses IndexedDB, native shells (electron/expo) can supply a
 * SQLite-backed adapter, and tests use the in-memory implementation.
 *
 * The interface is intentionally tiny and storage-agnostic: append a record,
 * read them all back (for hydrate-on-startup), flip statuses, and prune
 * terminal records older than a cutoff so the buffer never grows unbounded.
 */

import type { TelemetryRecord } from './collector'

export interface TelemetryBufferStore {
  /** Persist a freshly collected record. */
  append(record: TelemetryRecord): Promise<void>
  /** Read every persisted record (used to hydrate the collector on startup). */
  all(): Promise<TelemetryRecord[]>
  /** Update the status of the given records (e.g. local → pending → shared). */
  setStatus(ids: string[], status: TelemetryRecord['status']): Promise<void>
  /** Remove the given records entirely. */
  remove(ids: string[]): Promise<void>
  /** Remove all records. */
  clear(): Promise<void>
  /** Drop terminal (shared/dismissed) records whose createdAt is older than now-keepMs. */
  prune(keepMs: number): Promise<void>
}

/** Terminal statuses are safe to prune once they age out. */
const TERMINAL_STATUSES: ReadonlySet<TelemetryRecord['status']> = new Set(['shared', 'dismissed'])

/**
 * In-memory buffer. The default when no durable store is supplied and the
 * backing store for tests. Behaves like a durable store but does not persist
 * across process restarts.
 */
export class MemoryTelemetryBuffer implements TelemetryBufferStore {
  private records = new Map<string, TelemetryRecord>()

  append(record: TelemetryRecord): Promise<void> {
    this.records.set(record.id, { ...record })
    return Promise.resolve()
  }

  all(): Promise<TelemetryRecord[]> {
    return Promise.resolve([...this.records.values()].map((r) => ({ ...r })))
  }

  setStatus(ids: string[], status: TelemetryRecord['status']): Promise<void> {
    for (const id of ids) {
      const record = this.records.get(id)
      if (record) record.status = status
    }
    return Promise.resolve()
  }

  remove(ids: string[]): Promise<void> {
    for (const id of ids) this.records.delete(id)
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.records.clear()
    return Promise.resolve()
  }

  prune(keepMs: number): Promise<void> {
    const cutoff = Date.now() - keepMs
    for (const [id, record] of this.records) {
      if (TERMINAL_STATUSES.has(record.status) && record.createdAt < cutoff) {
        this.records.delete(id)
      }
    }
    return Promise.resolve()
  }
}

const DB_NAME = 'xnet-telemetry'
const STORE_NAME = 'records'
const DB_VERSION = 1

/**
 * IndexedDB-backed buffer for the web app. Keyed by record id, with an index on
 * (status, createdAt) so prune/drain stay cheap. Guarded so importing this
 * module never throws in a non-browser environment — call
 * {@link isIndexedDBAvailable} before constructing.
 */
export class IndexedDBTelemetryBuffer implements TelemetryBufferStore {
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(private dbName: string = DB_NAME) {}

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('byStatusCreatedAt', ['status', 'createdAt'])
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'))
    })
    return this.dbPromise
  }

  private async tx<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this.open()
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = fn(transaction.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('indexeddb request failed'))
    })
  }

  async append(record: TelemetryRecord): Promise<void> {
    await this.tx('readwrite', (store) => store.put(record))
  }

  async all(): Promise<TelemetryRecord[]> {
    const result = await this.tx<TelemetryRecord[]>('readonly', (store) => store.getAll())
    return result ?? []
  }

  async setStatus(ids: string[], status: TelemetryRecord['status']): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      for (const id of ids) {
        const getReq = store.get(id)
        getReq.onsuccess = () => {
          const record = getReq.result as TelemetryRecord | undefined
          if (record) store.put({ ...record, status })
        }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb tx failed'))
    })
  }

  async remove(ids: string[]): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      for (const id of ids) store.delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb tx failed'))
    })
  }

  async clear(): Promise<void> {
    await this.tx('readwrite', (store) => store.clear())
  }

  async prune(keepMs: number): Promise<void> {
    const cutoff = Date.now() - keepMs
    const all = await this.all()
    const stale = all
      .filter((r) => (r.status === 'shared' || r.status === 'dismissed') && r.createdAt < cutoff)
      .map((r) => r.id)
    if (stale.length > 0) await this.remove(stale)
  }
}

/** Whether IndexedDB is usable in the current environment. */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

/**
 * Pick the best available durable buffer: IndexedDB in the browser, in-memory
 * everywhere else. Native shells that want SQLite durability should construct
 * their own adapter instead of calling this.
 */
export function createDefaultTelemetryBuffer(): TelemetryBufferStore {
  return isIndexedDBAvailable() ? new IndexedDBTelemetryBuffer() : new MemoryTelemetryBuffer()
}
