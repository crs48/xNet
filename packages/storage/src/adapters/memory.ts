/**
 * In-memory storage adapter for testing
 */
import type { StorageAdapter, DocumentData } from '../types'
import type { ContentId, Snapshot, SignedUpdate } from '@xnet/core'

/**
 * In-memory storage for testing
 */
export class MemoryAdapter implements StorageAdapter {
  private documents = new Map<string, DocumentData>()
  private updates = new Map<string, SignedUpdate[]>()
  private snapshots = new Map<string, Snapshot>()
  private blobs = new Map<string, Uint8Array>()

  async open(): Promise<void> {}
  async close(): Promise<void> {}

  async clear(): Promise<void> {
    this.documents.clear()
    this.updates.clear()
    this.snapshots.clear()
    this.blobs.clear()
  }

  async getDocument(id: string): Promise<DocumentData | null> {
    return this.documents.get(id) ?? null
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    this.documents.set(id, data)
  }

  async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id)
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    const ids = Array.from(this.documents.keys())
    if (!prefix) return ids
    return ids.filter((id) => id.startsWith(prefix))
  }

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    const list = this.updates.get(docId) ?? []
    list.push(update)
    this.updates.set(docId, list)
  }

  async getUpdates(docId: string, _since?: string): Promise<SignedUpdate[]> {
    return this.updates.get(docId) ?? []
  }

  async getUpdateCount(docId: string): Promise<number> {
    return (this.updates.get(docId) ?? []).length
  }

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    return this.snapshots.get(docId) ?? null
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    this.snapshots.set(docId, snapshot)
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    return this.blobs.get(cid) ?? null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    this.blobs.set(cid, data)
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    return this.blobs.has(cid)
  }
}
