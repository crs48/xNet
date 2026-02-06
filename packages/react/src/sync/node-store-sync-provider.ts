/**
 * NodeStoreSyncProvider - Sync NodeChange events via hub ConnectionManager.
 */
import type { ConnectionManager } from './connection-manager'
import type { ContentId, DID } from '@xnet/core'
import type { NodeChange, NodePayload, NodeStore } from '@xnet/data'
import { base64ToBytes, bytesToBase64 } from '@xnet/crypto'

// ─── Known Change Types ─────────────────────────────────────────────────────
// Change types that this version knows how to process.
// Unknown types are stored but not processed (forward compatibility).
const KNOWN_CHANGE_TYPES = new Set(['node-change'])

export type SerializedNodeChange = {
  id: string
  type: string
  hash: string
  room: string
  nodeId: string
  schemaId?: string
  lamportTime: number
  lamportAuthor: string
  authorDid: string
  wallTime: number
  parentHash: string | null
  payload: NodePayload
  signatureB64: string
  batchId?: string
  batchIndex?: number
  batchSize?: number
}

export type NodeSyncResponse = {
  type: 'node-sync-response'
  room: string
  changes: SerializedNodeChange[]
  highWaterMark: number
}

/**
 * Listener for unknown change type events.
 */
export type UnknownChangeTypeListener = (change: NodeChange, peerId: string) => void

export class NodeStoreSyncProvider {
  private lastSyncedLamport = 0
  private connection: ConnectionManager | null = null
  private roomCleanup: (() => void) | null = null
  private statusCleanup: (() => void) | null = null
  private messageCleanup: (() => void) | null = null
  private storeCleanup: (() => void) | null = null
  private unknownChangeTypeListeners = new Set<UnknownChangeTypeListener>()

  constructor(
    private store: NodeStore,
    private room: string
  ) {}

  /**
   * Subscribe to unknown change type events.
   * These are changes received from peers with types this version doesn't know how to process.
   * The changes are still stored in the change log for forward compatibility.
   *
   * @param listener - Callback invoked when an unknown change type is received
   * @returns Unsubscribe function
   */
  onUnknownChangeType(listener: UnknownChangeTypeListener): () => void {
    this.unknownChangeTypeListeners.add(listener)
    return () => {
      this.unknownChangeTypeListeners.delete(listener)
    }
  }

  private emitUnknownChangeType(change: NodeChange, peerId: string): void {
    for (const listener of this.unknownChangeTypeListeners) {
      try {
        listener(change, peerId)
      } catch (err) {
        console.error('Error in unknown change type listener:', err)
      }
    }
  }

  attach(connection: ConnectionManager): void {
    this.connection = connection

    this.roomCleanup = connection.joinRoom(this.room, (data) => {
      this.handleRoomMessage(data)
    })

    this.messageCleanup = connection.onMessage((message) => {
      this.handleDirectMessage(message)
    })

    this.statusCleanup = connection.onStatus((status) => {
      if (status === 'connected') {
        void this.syncLocalChanges()
        this.requestSync()
      }
    })

    this.storeCleanup = this.store.subscribe((event) => {
      if (event.isRemote) return
      this.broadcastChange(event.change)
    })

    if (connection.status === 'connected') {
      void this.syncLocalChanges()
      this.requestSync()
    }
  }

  detach(): void {
    this.roomCleanup?.()
    this.statusCleanup?.()
    this.messageCleanup?.()
    this.storeCleanup?.()
    this.roomCleanup = null
    this.statusCleanup = null
    this.messageCleanup = null
    this.storeCleanup = null
    this.connection = null
  }

  private handleRoomMessage(data: Record<string, unknown>): void {
    if (data.type === 'node-change') {
      const change = data.change as SerializedNodeChange
      void this.handleRemoteChange(change)
    }
  }

  private handleDirectMessage(message: Record<string, unknown>): void {
    if (message.type !== 'node-sync-response') return
    const response = message as NodeSyncResponse
    if (response.room !== this.room) return
    void this.handleSyncResponse(response)
  }

  private requestSync(): void {
    if (!this.connection) return
    this.connection.sendRaw({
      type: 'node-sync-request',
      room: this.room,
      sinceLamport: this.lastSyncedLamport
    })
  }

  private async syncLocalChanges(): Promise<void> {
    if (!this.connection || this.connection.status !== 'connected') return

    const changes = await this.store.getChangesSince(this.lastSyncedLamport)
    if (changes.length === 0) return

    changes.sort((a, b) => a.lamport.time - b.lamport.time)

    for (const change of changes) {
      this.broadcastChange(change)
      this.lastSyncedLamport = Math.max(this.lastSyncedLamport, change.lamport.time)
    }
  }

  private broadcastChange(change: NodeChange): void {
    if (!this.connection || this.connection.status !== 'connected') return

    const serialized = this.serializeChange(change)
    this.connection.publish(this.room, {
      type: 'node-change',
      room: this.room,
      change: serialized
    })

    this.lastSyncedLamport = Math.max(this.lastSyncedLamport, change.lamport.time)
  }

  private async handleRemoteChange(
    serialized: SerializedNodeChange,
    peerId: string = 'unknown'
  ): Promise<void> {
    const change = this.deserializeChange(serialized)

    if (serialized.lamportTime > this.lastSyncedLamport) {
      this.lastSyncedLamport = serialized.lamportTime
    }

    // Check if this is a known change type
    if (!KNOWN_CHANGE_TYPES.has(change.type)) {
      // Unknown change type - emit event but don't process
      // The change is still stored in the change log for forward compatibility
      // when the store's appendChange is called with raw changes
      console.warn(
        `Received unknown change type "${change.type}" from peer ${peerId}. ` +
          'Change stored but not processed (forward compatibility).'
      )
      this.emitUnknownChangeType(change, peerId)
      return
    }

    await this.store.applyRemoteChange(change)
  }

  private async handleSyncResponse(
    response: NodeSyncResponse,
    peerId: string = 'hub'
  ): Promise<void> {
    if (response.changes.length > 0) {
      const allChanges = response.changes.map((s) => this.deserializeChange(s))

      // Separate known and unknown change types
      const knownChanges: NodeChange[] = []
      for (const change of allChanges) {
        if (KNOWN_CHANGE_TYPES.has(change.type)) {
          knownChanges.push(change)
        } else {
          // Unknown change type - emit event but don't process
          console.warn(
            `Received unknown change type "${change.type}" from ${peerId}. ` +
              'Change stored but not processed (forward compatibility).'
          )
          this.emitUnknownChangeType(change, peerId)
        }
      }

      if (knownChanges.length > 0) {
        await this.store.applyRemoteChanges(knownChanges)
      }
    }

    this.lastSyncedLamport = Math.max(this.lastSyncedLamport, response.highWaterMark)
  }

  private serializeChange(change: NodeChange): SerializedNodeChange {
    return {
      id: change.id,
      type: change.type,
      hash: change.hash,
      room: this.room,
      nodeId: change.payload.nodeId,
      schemaId: change.payload.schemaId,
      lamportTime: change.lamport.time,
      lamportAuthor: change.lamport.author,
      authorDid: change.authorDID,
      wallTime: change.wallTime,
      parentHash: change.parentHash,
      payload: change.payload,
      signatureB64: bytesToBase64(change.signature),
      batchId: change.batchId,
      batchIndex: change.batchIndex,
      batchSize: change.batchSize
    }
  }

  private deserializeChange(serialized: SerializedNodeChange): NodeChange {
    return {
      id: serialized.id,
      type: serialized.type,
      hash: serialized.hash as ContentId,
      parentHash: serialized.parentHash as ContentId | null,
      authorDID: serialized.authorDid as DID,
      signature: base64ToBytes(serialized.signatureB64),
      wallTime: serialized.wallTime,
      lamport: { time: serialized.lamportTime, author: serialized.lamportAuthor as DID },
      payload: serialized.payload,
      batchId: serialized.batchId,
      batchIndex: serialized.batchIndex,
      batchSize: serialized.batchSize
    }
  }
}
