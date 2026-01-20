/**
 * Storage interfaces and types
 */
import type { ContentId, Snapshot, SignedUpdate } from '@xnet/core'

/**
 * Storage adapter interface for different platforms
 */
export interface StorageAdapter {
  // Document operations
  getDocument(id: string): Promise<DocumentData | null>
  setDocument(id: string, data: DocumentData): Promise<void>
  deleteDocument(id: string): Promise<void>
  listDocuments(prefix?: string): Promise<string[]>

  // Update log
  appendUpdate(docId: string, update: SignedUpdate): Promise<void>
  getUpdates(docId: string, since?: string): Promise<SignedUpdate[]>
  getUpdateCount(docId: string): Promise<number>

  // Snapshots
  getSnapshot(docId: string): Promise<Snapshot | null>
  setSnapshot(docId: string, snapshot: Snapshot): Promise<void>

  // Blobs
  getBlob(cid: ContentId): Promise<Uint8Array | null>
  setBlob(cid: ContentId, data: Uint8Array): Promise<void>
  hasBlob(cid: ContentId): Promise<boolean>

  // Lifecycle
  open(): Promise<void>
  close(): Promise<void>
  clear(): Promise<void>
}

/**
 * Document data structure
 */
export interface DocumentData {
  id: string
  content: Uint8Array
  metadata: DocumentMetadata
  version: number
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  created: number
  updated: number
  type: string
  workspace?: string
}

/**
 * Storage statistics
 */
export interface StorageStats {
  documentCount: number
  totalSize: number
  snapshotCount: number
  updateCount: number
}
