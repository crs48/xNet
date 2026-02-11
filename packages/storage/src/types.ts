/**
 * Storage interfaces and types
 */
import type { ContentId } from '@xnet/core'

export interface StorageAdapter {
  // Blobs
  getBlob(cid: ContentId): Promise<Uint8Array | null>
  setBlob(cid: ContentId, data: Uint8Array): Promise<void>
  hasBlob(cid: ContentId): Promise<boolean>

  // Lifecycle
  open(): Promise<void>
  close(): Promise<void>
  clear(): Promise<void>
}
