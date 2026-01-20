/**
 * IndexedDB storage adapter for browser
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { StorageAdapter, DocumentData } from '../types'
import type { ContentId, Snapshot, SignedUpdate } from '@xnet/core'

const DB_NAME = 'xnet-storage'
const DB_VERSION = 1

interface XNetDB {
  documents: DocumentData
  updates: { docId: string; updateHash: string; update: SignedUpdate }
  snapshots: { docId: string; snapshot: Snapshot }
  blobs: { cid: string; data: Uint8Array }
}

/**
 * IndexedDB-based storage adapter for browser environments
 */
export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBPDatabase<XNetDB> | null = null

  async open(): Promise<void> {
    this.db = await openDB<XNetDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Documents store
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' })
        }

        // Updates store
        if (!db.objectStoreNames.contains('updates')) {
          const store = db.createObjectStore('updates', { keyPath: ['docId', 'updateHash'] })
          store.createIndex('byDoc', 'docId')
        }

        // Snapshots store
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'docId' })
        }

        // Blobs store
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'cid' })
        }
      }
    })
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    const tx = this.db.transaction(['documents', 'updates', 'snapshots', 'blobs'], 'readwrite')
    await Promise.all([
      tx.objectStore('documents').clear(),
      tx.objectStore('updates').clear(),
      tx.objectStore('snapshots').clear(),
      tx.objectStore('blobs').clear(),
      tx.done
    ])
  }

  // Document operations
  async getDocument(id: string): Promise<DocumentData | null> {
    if (!this.db) throw new Error('Database not open')
    return (await this.db.get('documents', id)) ?? null
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.put('documents', data)
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.delete('documents', id)
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not open')
    const all = await this.db.getAllKeys('documents')
    if (!prefix) return all as string[]
    return (all as string[]).filter((id) => id.startsWith(prefix))
  }

  // Update operations
  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.add('updates', { docId, updateHash: update.updateHash, update })
  }

  async getUpdates(docId: string, _since?: string): Promise<SignedUpdate[]> {
    if (!this.db) throw new Error('Database not open')
    const all = await this.db.getAllFromIndex('updates', 'byDoc', docId)
    return all.map((row) => row.update)
  }

  async getUpdateCount(docId: string): Promise<number> {
    if (!this.db) throw new Error('Database not open')
    return this.db.countFromIndex('updates', 'byDoc', docId)
  }

  // Snapshot operations
  async getSnapshot(docId: string): Promise<Snapshot | null> {
    if (!this.db) throw new Error('Database not open')
    const row = await this.db.get('snapshots', docId)
    return row?.snapshot ?? null
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.put('snapshots', { docId, snapshot })
  }

  // Blob operations
  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    if (!this.db) throw new Error('Database not open')
    const row = await this.db.get('blobs', cid)
    return row?.data ?? null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.put('blobs', { cid, data })
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    if (!this.db) throw new Error('Database not open')
    const count = await this.db.count('blobs', cid)
    return count > 0
  }
}
