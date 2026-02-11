import type { StorageAdapter } from '../types'
import type { ContentId } from '@xnet/core'

export class MemoryAdapter implements StorageAdapter {
  private blobs = new Map<string, Uint8Array>()

  async open(): Promise<void> {}
  async close(): Promise<void> {}

  async clear(): Promise<void> {
    this.blobs.clear()
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
