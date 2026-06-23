/**
 * NodeStoreSyncProvider - Sync NodeChange events via hub ConnectionManager.
 *
 * Anti-flood design (exploration 0206):
 *  - A persisted per-room cursor (lastSyncedLamport) is loaded on connect, so
 *    a reload no longer replays the entire change log (getChangesSince(0)).
 *  - Request-sync-first: on connect we ask the hub for its high-water mark
 *    before pushing, so when the hub is already ahead we push nothing.
 *  - A throttled send queue caps outbound node-change messages per second so a
 *    genuine backlog can't trip the hub's per-connection rate limiter (1008).
 */
import type { ConnectionManager } from './connection-manager'
import type { ContentId, DID } from '@xnetjs/core'
import type { NodeChange, NodePayload, NodeStore } from '@xnetjs/data'
import { base64ToBytes, bytesToBase64 } from '@xnetjs/crypto'

// ─── Known Change Types ─────────────────────────────────────────────────────
// Change types that this version knows how to process.
// Unknown types are stored but not processed (forward compatibility).
const KNOWN_CHANGE_TYPES = new Set(['node-change'])

// Outbound throttle: at most MAX_SENDS_PER_WINDOW node-change messages per
// SEND_WINDOW_MS, comfortably under the hub's 100 msg/sec limit while leaving
// headroom for awareness/doc-sync traffic on the same connection (0206).
const MAX_SENDS_PER_WINDOW = 40
const SEND_WINDOW_MS = 1000

// How long to wait for the hub's node-sync-response before pushing local
// changes anyway (request-sync-first, with a fallback so we never hang).
const SYNC_RESPONSE_TIMEOUT_MS = 4000

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
  protocolVersion?: number
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
  /** Confirmed, persisted high-water mark (advanced from the hub's response). */
  private lastSyncedLamport = 0
  /** Optimistic in-memory cursor: lamport of the last change actually sent. */
  private pushedThrough = 0
  private cursorLoaded = false

  private connection: ConnectionManager | null = null
  private roomCleanup: (() => void) | null = null
  private statusCleanup: (() => void) | null = null
  private messageCleanup: (() => void) | null = null
  private storeCleanup: (() => void) | null = null
  private unknownChangeTypeListeners = new Set<UnknownChangeTypeListener>()

  // Throttled send queue.
  private sendQueue: NodeChange[] = []
  private queuedHashes = new Set<string>()
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private sentInWindow = 0

  // Request-sync-first: resolver for the in-flight node-sync-response wait.
  private syncResponseResolver: (() => void) | null = null

  // One-shot: emit a performance mark when the first remote change BEGINS
  // applying to the local store (marked just before the awaited write, so it
  // captures when the inbound write burst starts contending with reads on the
  // single SQLite worker). Makes that contention visible on the boot timeline
  // and in DevTools (exploration 0212).
  private firstRemoteApplyMarked = false

  constructor(
    private store: NodeStore,
    private room: string
  ) {}

  /**
   * Mark the first remote apply once. Platform-agnostic and defensive: a
   * missing `performance` global, or a throw, is a no-op — instrumentation
   * must never break sync.
   */
  private markFirstRemoteApply(): void {
    if (this.firstRemoteApplyMarked) return
    this.firstRemoteApplyMarked = true
    try {
      performance?.mark?.('xnet:sync:first-remote-apply')
    } catch {
      // no-op
    }
  }

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
        void this.onConnected()
      } else {
        this.onDisconnected()
      }
    })

    this.storeCleanup = this.store.subscribe((event) => {
      if (event.isRemote) return
      this.enqueueChange(event.change)
    })

    if (connection.status === 'connected') {
      void this.onConnected()
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
    this.clearSendQueue()
    this.resolveSyncResponse()
  }

  // ─── Connect lifecycle ──────────────────────────────────────────────────

  /**
   * On connect: load the persisted cursor, ask the hub for its high-water mark
   * FIRST, then push only the changes the hub is actually missing. Combined
   * with the persisted cursor, a normal reload of an in-sync workspace pushes
   * nothing (exploration 0206).
   */
  private async onConnected(): Promise<void> {
    await this.ensureCursorLoaded()
    if (!this.connection || this.connection.status !== 'connected') return

    this.requestSync()
    await this.waitForSyncResponse()
    await this.syncLocalChanges()
  }

  private onDisconnected(): void {
    // Drop the in-flight queue; syncLocalChanges() rebuilds it from
    // pushedThrough (which only advances on a real send) when we reconnect, so
    // nothing is lost and nothing is double-queued.
    this.clearSendQueue()
    this.resolveSyncResponse()
  }

  private async ensureCursorLoaded(): Promise<void> {
    if (this.cursorLoaded) return
    try {
      const stored = await this.store.getSyncCursor(this.room)
      this.lastSyncedLamport = Math.max(this.lastSyncedLamport, stored)
      this.pushedThrough = Math.max(this.pushedThrough, this.lastSyncedLamport)
    } catch (err) {
      console.warn('[NodeStoreSync] failed to load sync cursor; replaying from 0:', err)
    }
    this.cursorLoaded = true
  }

  private waitForSyncResponse(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.syncResponseResolver = resolve
      setTimeout(() => this.resolveSyncResponse(), SYNC_RESPONSE_TIMEOUT_MS)
    })
  }

  private resolveSyncResponse(): void {
    const resolve = this.syncResponseResolver
    this.syncResponseResolver = null
    resolve?.()
  }

  // ─── Inbound ────────────────────────────────────────────────────────────

  private handleRoomMessage(data: Record<string, unknown>): void {
    if (data.type === 'node-change') {
      const change = data.change as SerializedNodeChange
      void this.handleRemoteChange(change)
    }
  }

  private handleDirectMessage(message: Record<string, unknown>): void {
    if (message.type === 'node-error') {
      // The hub rejected a change (invalid/unauthorized/duplicate). Log it and
      // move on — don't treat it as a reason to resend and re-flood (0206).
      console.warn(
        '[NodeStoreSync] hub rejected a node change:',
        message.code ?? 'UNKNOWN',
        message.error ?? message.message ?? ''
      )
      return
    }
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

    try {
      this.markFirstRemoteApply()
      await this.store.applyRemoteChange(change)
    } catch (err) {
      // One bad relayed change must not become an unhandled rejection (0206).
      console.warn(
        `[NodeStoreSync] skipping un-appliable remote change for node ${change.payload?.nodeId}:`,
        err instanceof Error ? err.message : err
      )
    }
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
        this.markFirstRemoteApply()
        await this.store.applyRemoteChanges(knownChanges)
      }
    }

    // The hub's high-water mark is the only positive confirmation that the hub
    // durably holds changes up to this point. Advance and PERSIST the cursor
    // from it (not from local sends) so a reload never replays already-synced
    // history (exploration 0206).
    if (response.highWaterMark > this.lastSyncedLamport) {
      this.lastSyncedLamport = response.highWaterMark
      this.pushedThrough = Math.max(this.pushedThrough, this.lastSyncedLamport)
      try {
        await this.store.setSyncCursor(this.room, this.lastSyncedLamport)
      } catch (err) {
        console.warn('[NodeStoreSync] failed to persist sync cursor:', err)
      }
    }

    this.resolveSyncResponse()
  }

  // ─── Outbound (throttled) ────────────────────────────────────────────────

  /** Enqueue every local change since the last confirmed send, then drain. */
  private async syncLocalChanges(): Promise<void> {
    if (!this.connection || this.connection.status !== 'connected') return

    const changes = await this.store.getChangesSince(this.pushedThrough)
    if (changes.length === 0) return

    changes.sort((a, b) => a.lamport - b.lamport || a.authorDID.localeCompare(b.authorDID))
    for (const change of changes) {
      this.enqueueChange(change)
    }
  }

  /** Queue a change for throttled broadcast (deduped by hash). */
  private enqueueChange(change: NodeChange): void {
    if (change.lamport <= this.pushedThrough) return
    if (this.queuedHashes.has(change.hash)) return
    this.queuedHashes.add(change.hash)
    this.sendQueue.push(change)
    this.scheduleDrain(0)
  }

  private scheduleDrain(delayMs: number): void {
    if (this.sendTimer) return
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null
      this.drain()
    }, delayMs)
  }

  private drain(): void {
    if (!this.connection || this.connection.status !== 'connected') return

    this.sentInWindow = 0
    while (this.sendQueue.length > 0 && this.sentInWindow < MAX_SENDS_PER_WINDOW) {
      const change = this.sendQueue.shift()!
      this.queuedHashes.delete(change.hash)
      this.publishChange(change)
      this.sentInWindow += 1
    }

    // More queued than this window allows → drain the rest after the window.
    if (this.sendQueue.length > 0) {
      this.scheduleDrain(SEND_WINDOW_MS)
    }
  }

  private publishChange(change: NodeChange): void {
    if (!this.connection) return
    this.connection.publish(this.room, {
      type: 'node-change',
      room: this.room,
      change: this.serializeChange(change)
    })
    // Optimistic in-memory advance — keeps us from re-sending within a session.
    // The PERSISTED cursor only advances on the hub's high-water mark.
    this.pushedThrough = Math.max(this.pushedThrough, change.lamport)
  }

  private clearSendQueue(): void {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer)
      this.sendTimer = null
    }
    this.sendQueue = []
    this.queuedHashes.clear()
    this.sentInWindow = 0
  }

  private serializeChange(change: NodeChange): SerializedNodeChange {
    return {
      id: change.id,
      type: change.type,
      hash: change.hash,
      room: this.room,
      nodeId: change.payload.nodeId,
      schemaId: change.payload.schemaId,
      lamportTime: change.lamport,
      lamportAuthor: change.authorDID,
      authorDid: change.authorDID,
      wallTime: change.wallTime,
      parentHash: change.parentHash,
      payload: change.payload,
      signatureB64: bytesToBase64(change.signature),
      // protocolVersion is part of the hashed fields — dropping it makes
      // every relayed change fail verifyChangeHash on the receiving side
      protocolVersion: change.protocolVersion,
      batchId: change.batchId,
      batchIndex: change.batchIndex,
      batchSize: change.batchSize
    }
  }

  private deserializeChange(serialized: SerializedNodeChange): NodeChange {
    // schemaId is carried both in the payload and (redundantly) at the top
    // level. If the payload's is missing, fall back to the top-level field so a
    // first change still materializes instead of throwing "must include
    // schemaId" and aborting the batch (exploration 0206).
    const payload =
      serialized.payload && !serialized.payload.schemaId && serialized.schemaId
        ? { ...serialized.payload, schemaId: serialized.schemaId as NodePayload['schemaId'] }
        : serialized.payload
    return {
      id: serialized.id,
      type: serialized.type,
      hash: serialized.hash as ContentId,
      parentHash: serialized.parentHash as ContentId | null,
      authorDID: serialized.authorDid as DID,
      signature: base64ToBytes(serialized.signatureB64),
      wallTime: serialized.wallTime,
      lamport: serialized.lamportTime,
      payload,
      protocolVersion: serialized.protocolVersion,
      batchId: serialized.batchId,
      batchIndex: serialized.batchIndex,
      batchSize: serialized.batchSize
    }
  }
}
