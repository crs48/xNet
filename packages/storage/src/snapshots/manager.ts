/**
 * Snapshot management for document persistence
 */
import type { StorageAdapter } from '../types'
import type { Snapshot, SignedUpdate, SnapshotTriggers, ContentId } from '@xnet/core'
import { shouldCreateSnapshot, hashContent, createContentId } from '@xnet/core'
import { sign } from '@xnet/crypto'
import pako from 'pako'

/**
 * Options for snapshot manager
 */
export interface SnapshotManagerOptions {
  adapter: StorageAdapter
  triggers: SnapshotTriggers
  signingKey: Uint8Array
  creatorDID: string
}

/**
 * Manages document snapshots for efficient persistence
 */
export class SnapshotManager {
  private adapter: StorageAdapter
  private triggers: SnapshotTriggers
  private signingKey: Uint8Array
  private creatorDID: string
  private lastSnapshotTime = new Map<string, number>()

  constructor(options: SnapshotManagerOptions) {
    this.adapter = options.adapter
    this.triggers = options.triggers
    this.signingKey = options.signingKey
    this.creatorDID = options.creatorDID
  }

  /**
   * Load document with snapshot + updates since
   */
  async loadDocument(docId: string): Promise<{
    snapshot: Snapshot | null
    updates: SignedUpdate[]
  }> {
    const snapshot = await this.adapter.getSnapshot(docId)
    const updates = await this.adapter.getUpdates(docId)
    return { snapshot, updates }
  }

  /**
   * Check if snapshot should be created
   */
  async shouldSnapshot(docId: string): Promise<boolean> {
    const updateCount = await this.adapter.getUpdateCount(docId)
    const lastTime = this.lastSnapshotTime.get(docId) ?? 0
    // Estimate storage - simplified
    return shouldCreateSnapshot(updateCount, lastTime, 0, 100, this.triggers)
  }

  /**
   * Create snapshot of current state
   */
  async createSnapshot(docId: string, state: Uint8Array): Promise<Snapshot> {
    const compressed = pako.deflate(state)
    const stateVector = new Uint8Array(0) // Would be actual state vector

    // Calculate content ID from compressed state
    const contentHash = hashContent(compressed)
    const contentId = createContentId(contentHash)

    const snapshotData = {
      id: `${docId}-${Date.now()}`,
      documentId: docId,
      stateVector,
      compressedState: compressed,
      timestamp: Date.now(),
      creatorDID: this.creatorDID
    }

    const dataToSign = new TextEncoder().encode(
      JSON.stringify({
        id: snapshotData.id,
        documentId: snapshotData.documentId,
        timestamp: snapshotData.timestamp,
        contentId
      })
    )
    const signature = sign(dataToSign, this.signingKey)

    const snapshot: Snapshot = {
      ...snapshotData,
      signature,
      contentId
    }

    await this.adapter.setSnapshot(docId, snapshot)
    this.lastSnapshotTime.set(docId, Date.now())

    return snapshot
  }

  /**
   * Decompress snapshot state
   */
  decompressState(snapshot: Snapshot): Uint8Array {
    return pako.inflate(snapshot.compressedState)
  }

  /**
   * Get the content ID for a snapshot's compressed data
   */
  getSnapshotContentId(snapshot: Snapshot): ContentId {
    return snapshot.contentId
  }
}
