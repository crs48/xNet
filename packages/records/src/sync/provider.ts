/**
 * @xnet/records - RecordSyncProvider for P2P sync of record operations
 *
 * Uses the same signaling server as y-webrtc but with a custom protocol
 * for exchanging record operations instead of Yjs updates.
 */

import type { DID, VectorClock } from '@xnet/core'
import { mergeVectorClocks, compareVectorClocks } from '@xnet/core'
import type { DatabaseId } from '../types'
import type {
  RecordOperation,
  SyncRequest,
  SyncResponse,
  OperationPush,
  OperationAck,
  SyncMessage
} from './types'
import type { RecordStore } from './store'

// ============================================================================
// Types
// ============================================================================

export interface RecordSyncProviderOptions {
  /** Signaling server URLs */
  signalingServers: string[]
  /** The record store to sync */
  store: RecordStore
  /** Database ID to sync */
  databaseId: DatabaseId
  /** Our peer ID (usually DID) */
  peerId: DID
  /** Reconnect delay in ms */
  reconnectDelay?: number
  /** Max reconnect attempts */
  maxReconnectAttempts?: number
}

export interface PeerState {
  peerId: string
  vectorClock: VectorClock
  lastSeen: number
}

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'synced'

export interface RecordSyncEvents {
  'status-change': (status: SyncStatus) => void
  'peer-join': (peerId: string) => void
  'peer-leave': (peerId: string) => void
  'operation-received': (op: RecordOperation) => void
  'sync-complete': () => void
  error: (error: Error) => void
}

// ============================================================================
// RecordSyncProvider
// ============================================================================

/**
 * Manages P2P sync of record operations via WebSocket signaling.
 *
 * Protocol:
 * 1. Connect to signaling server
 * 2. Subscribe to database room
 * 3. Announce presence with current vector clock
 * 4. Exchange operations with peers
 * 5. Apply remote operations to local store
 */
export class RecordSyncProvider {
  private options: Required<RecordSyncProviderOptions>
  private ws: WebSocket | null = null
  private status: SyncStatus = 'disconnected'
  private peers = new Map<string, PeerState>()
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Map<keyof RecordSyncEvents, Set<Function>>()
  private pendingAcks = new Map<string, { resolve: () => void; reject: (err: Error) => void }>()

  constructor(options: RecordSyncProviderOptions) {
    this.options = {
      reconnectDelay: 1000,
      maxReconnectAttempts: 10,
      ...options
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Connect to signaling server and start syncing
   */
  connect(): void {
    if (this.ws) {
      return
    }

    this.setStatus('connecting')
    this.connectToSignaling()
  }

  /**
   * Disconnect from signaling server
   */
  disconnect(): void {
    this.cleanup()
    this.setStatus('disconnected')
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.status
  }

  /**
   * Get connected peers
   */
  getPeers(): PeerState[] {
    return Array.from(this.peers.values())
  }

  /**
   * Get peer count
   */
  getPeerCount(): number {
    return this.peers.size
  }

  /**
   * Broadcast a new operation to all peers
   */
  async broadcastOperation(op: RecordOperation): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const message: OperationPush = {
      type: 'operation-push',
      operation: op
    }

    this.publish(message)
  }

  /**
   * Subscribe to events
   */
  on<K extends keyof RecordSyncEvents>(event: K, callback: RecordSyncEvents[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)

    return () => {
      this.listeners.get(event)?.delete(callback)
    }
  }

  // ==========================================================================
  // Signaling Connection
  // ==========================================================================

  private connectToSignaling(): void {
    const url = this.options.signalingServers[0]
    if (!url) {
      this.emit('error', new Error('No signaling servers configured'))
      return
    }

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        this.setStatus('connected')
        this.subscribe()
        this.announcePresence()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = () => {
        this.ws = null
        this.handleDisconnect()
      }

      this.ws.onerror = (error) => {
        this.emit('error', new Error('WebSocket error'))
      }
    } catch (error) {
      this.emit('error', error as Error)
      this.handleDisconnect()
    }
  }

  private handleDisconnect(): void {
    this.peers.clear()

    if (this.status === 'disconnected') {
      return // Intentional disconnect
    }

    this.setStatus('disconnected')

    // Attempt reconnect
    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

      this.reconnectTimer = setTimeout(
        () => {
          this.connectToSignaling()
        },
        Math.min(delay, 30000)
      )
    }
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.unsubscribe()
      this.ws.close()
      this.ws = null
    }

    this.peers.clear()
    this.pendingAcks.clear()
  }

  // ==========================================================================
  // Signaling Protocol
  // ==========================================================================

  private getRoomName(): string {
    return `xnet-records-${this.options.databaseId}`
  }

  private subscribe(): void {
    this.send({
      type: 'subscribe',
      topics: [this.getRoomName()]
    })
  }

  private unsubscribe(): void {
    this.send({
      type: 'unsubscribe',
      topics: [this.getRoomName()]
    })
  }

  private publish(data: unknown): void {
    this.send({
      type: 'publish',
      topic: this.getRoomName(),
      data: {
        from: this.options.peerId,
        payload: data
      }
    })
  }

  private send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  private async handleMessage(rawData: string): Promise<void> {
    try {
      const message = JSON.parse(rawData)

      if (message.type === 'pong') {
        return
      }

      if (message.type === 'publish' && message.topic === this.getRoomName()) {
        const { from, payload } = message.data
        if (from !== this.options.peerId) {
          await this.handlePeerMessage(from, payload)
        }
      }
    } catch (error) {
      console.error('Failed to handle message:', error)
    }
  }

  private async handlePeerMessage(peerId: string, payload: unknown): Promise<void> {
    const msg = payload as SyncMessage | { type: 'announce'; vectorClock: VectorClock }

    switch (msg.type) {
      case 'announce':
        await this.handleAnnounce(peerId, msg.vectorClock)
        break

      case 'sync-request':
        await this.handleSyncRequest(peerId, msg as SyncRequest)
        break

      case 'sync-response':
        await this.handleSyncResponse(peerId, msg as SyncResponse)
        break

      case 'operation-push':
        await this.handleOperationPush(peerId, msg as OperationPush)
        break

      case 'operation-ack':
        this.handleOperationAck(msg as OperationAck)
        break
    }
  }

  // ==========================================================================
  // Sync Protocol
  // ==========================================================================

  private async announcePresence(): Promise<void> {
    const vectorClock = await this.options.store
      .getOperationsForSync(this.options.databaseId)
      .then((ops) =>
        ops.reduce((clock, op) => mergeVectorClocks(clock, op.vectorClock), {} as VectorClock)
      )

    this.publish({
      type: 'announce',
      vectorClock
    })
  }

  private async handleAnnounce(peerId: string, remoteVectorClock: VectorClock): Promise<void> {
    // Track peer
    const isNew = !this.peers.has(peerId)
    this.peers.set(peerId, {
      peerId,
      vectorClock: remoteVectorClock,
      lastSeen: Date.now()
    })

    if (isNew) {
      this.emit('peer-join', peerId)
    }

    // Check if we need to request sync
    const localOps = await this.options.store.getOperationsForSync(this.options.databaseId)
    const localVectorClock = localOps.reduce(
      (clock, op) => mergeVectorClocks(clock, op.vectorClock),
      {} as VectorClock
    )

    const comparison = compareVectorClocks(localVectorClock, remoteVectorClock)

    if (comparison === -1) {
      // Remote has newer data, request sync
      this.setStatus('syncing')
      this.requestSync(peerId, localVectorClock)
    } else if (comparison === 1) {
      // We have newer data, send it
      this.sendMissingOperations(peerId, remoteVectorClock)
    }
    // If concurrent (0), both sides may have unique operations - handled by bi-directional sync
  }

  private requestSync(peerId: string, sinceVectorClock: VectorClock): void {
    const request: SyncRequest = {
      type: 'sync-request',
      databaseId: this.options.databaseId,
      sinceVectorClock,
      limit: 100
    }

    this.publish({
      ...request,
      to: peerId
    })
  }

  private async handleSyncRequest(peerId: string, request: SyncRequest): Promise<void> {
    const operations = await this.options.store.getOperationsForSync(
      request.databaseId,
      request.sinceVectorClock
    )

    const limited = request.limit ? operations.slice(0, request.limit) : operations
    const vectorClock = operations.reduce(
      (clock, op) => mergeVectorClocks(clock, op.vectorClock),
      {} as VectorClock
    )

    const response: SyncResponse = {
      type: 'sync-response',
      databaseId: request.databaseId,
      operations: limited,
      hasMore: request.limit ? operations.length > request.limit : false,
      vectorClock
    }

    this.publish({
      ...response,
      to: peerId
    })
  }

  private async handleSyncResponse(peerId: string, response: SyncResponse): Promise<void> {
    // Apply received operations
    if (response.operations.length > 0) {
      await this.options.store.applyRemoteOperations(response.operations)

      for (const op of response.operations) {
        this.emit('operation-received', op)
      }
    }

    // Update peer state
    const peer = this.peers.get(peerId)
    if (peer) {
      peer.vectorClock = response.vectorClock
      peer.lastSeen = Date.now()
    }

    // Request more if available
    if (response.hasMore) {
      const localOps = await this.options.store.getOperationsForSync(this.options.databaseId)
      const localVectorClock = localOps.reduce(
        (clock, op) => mergeVectorClocks(clock, op.vectorClock),
        {} as VectorClock
      )
      this.requestSync(peerId, localVectorClock)
    } else {
      this.setStatus('synced')
      this.emit('sync-complete')
    }
  }

  private async sendMissingOperations(
    peerId: string,
    remoteVectorClock: VectorClock
  ): Promise<void> {
    const operations = await this.options.store.getOperationsForSync(
      this.options.databaseId,
      remoteVectorClock
    )

    for (const op of operations) {
      this.publish({
        type: 'operation-push',
        operation: op,
        to: peerId
      })
    }
  }

  private async handleOperationPush(peerId: string, push: OperationPush): Promise<void> {
    const result = await this.options.store.applyRemoteOperations([push.operation])

    // Send ack
    const ack: OperationAck = {
      type: 'operation-ack',
      operationId: push.operation.id,
      accepted: result[0]?.success ?? false,
      error: result[0]?.error
    }

    this.publish({
      ...ack,
      to: peerId
    })

    if (result[0]?.success) {
      this.emit('operation-received', push.operation)

      // Update peer's vector clock
      const peer = this.peers.get(peerId)
      if (peer) {
        peer.vectorClock = mergeVectorClocks(peer.vectorClock, push.operation.vectorClock)
        peer.lastSeen = Date.now()
      }
    }
  }

  private handleOperationAck(ack: OperationAck): void {
    const pending = this.pendingAcks.get(ack.operationId)
    if (pending) {
      if (ack.accepted) {
        pending.resolve()
      } else {
        pending.reject(new Error(ack.error || 'Operation rejected'))
      }
      this.pendingAcks.delete(ack.operationId)
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private setStatus(status: SyncStatus): void {
    if (this.status !== status) {
      this.status = status
      this.emit('status-change', status)
    }
  }

  private emit<K extends keyof RecordSyncEvents>(
    event: K,
    ...args: Parameters<RecordSyncEvents[K]>
  ): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          ;(callback as Function)(...args)
        } catch (error) {
          console.error(`Error in ${event} listener:`, error)
        }
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a RecordSyncProvider for a database
 */
export function createRecordSyncProvider(options: RecordSyncProviderOptions): RecordSyncProvider {
  return new RecordSyncProvider(options)
}
