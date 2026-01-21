/**
 * NodeStore - Event-sourced storage for Nodes
 *
 * Manages Nodes using Change<T> from @xnet/sync with LWW conflict resolution.
 *
 * Key features:
 * - Simple CRUD API that creates Changes under the hood
 * - LWW conflict resolution using Lamport timestamps
 * - Sparse updates (only store changed properties)
 * - Materialized state for fast reads
 */

import type { DID, ContentId } from '@xnet/core'
import {
  createLamportClock,
  tick,
  receive,
  compareLamportTimestamps,
  signChange,
  createUnsignedChange,
  createBatchId,
  type LamportClock,
  type LamportTimestamp,
  type Change
} from '@xnet/sync'
import { createNodeId, type SchemaIRI } from '../schema/node'
import type {
  NodeId,
  PropertyKey,
  NodePayload,
  NodeChange,
  NodeState,
  NodeStorageAdapter,
  NodeStoreOptions,
  CreateNodeOptions,
  UpdateNodeOptions,
  PropertyTimestamp,
  MergeConflict,
  ListNodesOptions,
  TransactionOperation,
  TransactionResult,
  NodeChangeListener
} from './types'

/**
 * NodeStore manages event-sourced Nodes with LWW conflict resolution.
 */
export class NodeStore {
  private storage: NodeStorageAdapter
  private authorDID: DID
  private signingKey: Uint8Array
  private clock: LamportClock
  private conflicts: MergeConflict[] = []
  private listeners: Set<NodeChangeListener> = new Set()

  constructor(options: NodeStoreOptions) {
    this.storage = options.storage
    this.authorDID = options.authorDID
    this.signingKey = options.signingKey
    this.clock = createLamportClock(options.authorDID)
  }

  /**
   * Initialize the store by loading the last Lamport time from storage.
   * Call this before using the store.
   */
  async initialize(): Promise<void> {
    const lastTime = await this.storage.getLastLamportTime()
    this.clock = { ...this.clock, time: lastTime }
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Create a new Node.
   */
  async create(options: CreateNodeOptions): Promise<NodeState> {
    const id = options.id ?? createNodeId()
    const now = Date.now()

    // Tick the clock
    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    // Create the change
    const payload: NodePayload = {
      nodeId: id,
      schemaId: options.schemaId,
      properties: options.properties
    }

    const change = await this.createChange('node-change', payload, lamport, now)

    // Apply and persist
    await this.applyChange(change)

    const node = await this.storage.getNode(id)
    if (!node) {
      throw new Error(`Failed to create node: ${id}`)
    }

    // Emit change event
    this.emit(change, node, false)

    return node
  }

  /**
   * Get a Node by ID.
   */
  async get(id: NodeId): Promise<NodeState | null> {
    return this.storage.getNode(id)
  }

  /**
   * Update a Node's properties.
   */
  async update(id: NodeId, options: UpdateNodeOptions): Promise<NodeState> {
    const existing = await this.storage.getNode(id)
    if (!existing) {
      throw new Error(`Node not found: ${id}`)
    }

    const now = Date.now()

    // Tick the clock
    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    // Create the change with sparse properties
    const payload: NodePayload = {
      nodeId: id,
      properties: options.properties
    }

    const change = await this.createChange('node-change', payload, lamport, now)

    // Apply and persist
    await this.applyChange(change)

    const node = await this.storage.getNode(id)
    if (!node) {
      throw new Error(`Failed to update node: ${id}`)
    }

    // Emit change event
    this.emit(change, node, false)

    return node
  }

  /**
   * Delete a Node (soft delete).
   */
  async delete(id: NodeId): Promise<void> {
    const existing = await this.storage.getNode(id)
    if (!existing) {
      throw new Error(`Node not found: ${id}`)
    }

    const now = Date.now()

    // Tick the clock
    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    // Create the delete change
    const payload: NodePayload = {
      nodeId: id,
      properties: {},
      deleted: true
    }

    const change = await this.createChange('node-change', payload, lamport, now)

    // Apply and persist
    await this.applyChange(change)

    // Emit change event
    const deletedNode = await this.storage.getNode(id)
    this.emit(change, deletedNode, false)
  }

  /**
   * Restore a deleted Node.
   */
  async restore(id: NodeId): Promise<NodeState> {
    const existing = await this.storage.getNode(id)
    if (!existing) {
      throw new Error(`Node not found: ${id}`)
    }

    const now = Date.now()

    // Tick the clock
    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    // Create the restore change
    const payload: NodePayload = {
      nodeId: id,
      properties: {},
      deleted: false
    }

    const change = await this.createChange('node-change', payload, lamport, now)

    // Apply and persist
    await this.applyChange(change)

    const node = await this.storage.getNode(id)
    if (!node) {
      throw new Error(`Failed to restore node: ${id}`)
    }

    // Emit change event
    this.emit(change, node, false)

    return node
  }

  /**
   * List Nodes with optional filtering.
   */
  async list(options?: ListNodesOptions): Promise<NodeState[]> {
    return this.storage.listNodes(options)
  }

  // ==========================================================================
  // Transaction Support
  // ==========================================================================

  /**
   * Execute multiple operations as a single atomic transaction.
   *
   * All changes created in the transaction share the same batchId and Lamport
   * timestamp, making them logically atomic. This is useful for:
   * - Multi-node operations (move task between projects)
   * - Undo/redo grouping
   * - Audit trails ("user did X" as a single action)
   * - Future blockchain integration (batch = transaction)
   *
   * @example
   * ```typescript
   * const result = await store.transaction([
   *   { type: 'update', nodeId: task.id, options: { properties: { projectId: newProject.id } } },
   *   { type: 'update', nodeId: oldProject.id, options: { properties: { taskIds: [...] } } },
   *   { type: 'update', nodeId: newProject.id, options: { properties: { taskIds: [...] } } },
   * ])
   * console.log(`Batch ${result.batchId} applied ${result.changes.length} changes`)
   * ```
   */
  async transaction(operations: TransactionOperation[]): Promise<TransactionResult> {
    if (operations.length === 0) {
      return { batchId: '', results: [], changes: [] }
    }

    const batchId = createBatchId()
    const batchSize = operations.length
    const now = Date.now()

    // Tick the clock once for the entire batch
    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    const results: (NodeState | null)[] = []
    const changes: NodeChange[] = []

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]
      let change: NodeChange
      let result: NodeState | null = null

      switch (op.type) {
        case 'create': {
          const id = op.options.id ?? createNodeId()
          const payload: NodePayload = {
            nodeId: id,
            schemaId: op.options.schemaId,
            properties: op.options.properties
          }
          change = await this.createBatchedChange(
            'node-change',
            payload,
            lamport,
            now,
            batchId,
            i,
            batchSize
          )
          await this.applyChange(change)
          result = await this.storage.getNode(id)
          break
        }

        case 'update': {
          const existing = await this.storage.getNode(op.nodeId)
          if (!existing) {
            throw new Error(`Node not found: ${op.nodeId}`)
          }
          const payload: NodePayload = {
            nodeId: op.nodeId,
            properties: op.options.properties
          }
          change = await this.createBatchedChange(
            'node-change',
            payload,
            lamport,
            now,
            batchId,
            i,
            batchSize
          )
          await this.applyChange(change)
          result = await this.storage.getNode(op.nodeId)
          break
        }

        case 'delete': {
          const existing = await this.storage.getNode(op.nodeId)
          if (!existing) {
            throw new Error(`Node not found: ${op.nodeId}`)
          }
          const payload: NodePayload = {
            nodeId: op.nodeId,
            properties: {},
            deleted: true
          }
          change = await this.createBatchedChange(
            'node-change',
            payload,
            lamport,
            now,
            batchId,
            i,
            batchSize
          )
          await this.applyChange(change)
          result = null
          break
        }

        case 'restore': {
          const existing = await this.storage.getNode(op.nodeId)
          if (!existing) {
            throw new Error(`Node not found: ${op.nodeId}`)
          }
          const payload: NodePayload = {
            nodeId: op.nodeId,
            properties: {},
            deleted: false
          }
          change = await this.createBatchedChange(
            'node-change',
            payload,
            lamport,
            now,
            batchId,
            i,
            batchSize
          )
          await this.applyChange(change)
          result = await this.storage.getNode(op.nodeId)
          break
        }
      }

      changes.push(change)
      results.push(result)

      // Emit change event for subscribers
      this.emit(change, result, false)
    }

    return { batchId, results, changes }
  }

  // ==========================================================================
  // Sync Support
  // ==========================================================================

  /**
   * Apply a remote change (from sync).
   */
  async applyRemoteChange(change: NodeChange): Promise<void> {
    // Update our clock to be at least as recent as the remote
    this.clock = receive(this.clock, change.lamport.time)
    await this.storage.setLastLamportTime(this.clock.time)

    // Apply the change
    await this.applyChange(change)

    // Emit change event (marked as remote)
    const node = await this.storage.getNode(change.payload.nodeId)
    this.emit(change, node, true)
  }

  /**
   * Apply multiple remote changes (from sync).
   */
  async applyRemoteChanges(changes: NodeChange[]): Promise<void> {
    // Sort by Lamport timestamp for causal ordering
    const sorted = [...changes].sort((a, b) => compareLamportTimestamps(a.lamport, b.lamport))

    for (const change of sorted) {
      await this.applyRemoteChange(change)
    }
  }

  /**
   * Get all changes for a Node (for sync).
   */
  async getChanges(nodeId: NodeId): Promise<NodeChange[]> {
    return this.storage.getChanges(nodeId)
  }

  /**
   * Get all changes (for full sync).
   */
  async getAllChanges(): Promise<NodeChange[]> {
    return this.storage.getAllChanges()
  }

  /**
   * Get the current Lamport time (for sync protocol).
   */
  getCurrentLamportTime(): number {
    return this.clock.time
  }

  /**
   * Get recent merge conflicts (for debugging/UI).
   */
  getRecentConflicts(): MergeConflict[] {
    return this.conflicts.slice(-100)
  }

  /**
   * Clear conflict history.
   */
  clearConflicts(): void {
    this.conflicts = []
  }

  // ==========================================================================
  // Document Content Operations
  // ==========================================================================

  /**
   * Get CRDT document content for a node.
   * Returns null if no document content exists.
   */
  async getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null> {
    return this.storage.getDocumentContent(nodeId)
  }

  /**
   * Set CRDT document content for a node.
   * Used to persist serialized Y.Doc or other CRDT state.
   */
  async setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void> {
    await this.storage.setDocumentContent(nodeId, content)
  }

  // ==========================================================================
  // Subscription Support
  // ==========================================================================

  /**
   * Subscribe to node changes.
   *
   * @param listener - Callback invoked when nodes change
   * @returns Unsubscribe function
   *
   * @example
   * ```ts
   * const unsubscribe = store.subscribe((event) => {
   *   console.log('Node changed:', event.node?.id, event.isRemote)
   * })
   * // Later: unsubscribe()
   * ```
   */
  subscribe(listener: NodeChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Emit a change event to all listeners.
   */
  private emit(change: NodeChange, node: NodeState | null, isRemote: boolean): void {
    const event = { change, node, isRemote }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('Error in NodeStore listener:', err)
      }
    }
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Create a signed change.
   */
  private async createChange(
    type: string,
    payload: NodePayload,
    lamport: LamportTimestamp,
    wallTime: number
  ): Promise<NodeChange> {
    // Get parent hash (last change for this node)
    const lastChange = await this.storage.getLastChange(payload.nodeId)
    const parentHash = lastChange?.hash ?? null

    // Create and sign the change
    const unsigned = createUnsignedChange({
      id: createNodeId(),
      type,
      payload,
      parentHash,
      authorDID: this.authorDID,
      lamport,
      wallTime
    })

    return signChange(unsigned, this.signingKey)
  }

  /**
   * Create a signed change with batch metadata.
   * Used for transaction support - all changes in a batch share the same
   * batchId, Lamport timestamp, and wallTime.
   */
  private async createBatchedChange(
    type: string,
    payload: NodePayload,
    lamport: LamportTimestamp,
    wallTime: number,
    batchId: string,
    batchIndex: number,
    batchSize: number
  ): Promise<NodeChange> {
    // Get parent hash (last change for this node)
    const lastChange = await this.storage.getLastChange(payload.nodeId)
    const parentHash = lastChange?.hash ?? null

    // Create and sign the change with batch metadata
    const unsigned = createUnsignedChange({
      id: createNodeId(),
      type,
      payload,
      parentHash,
      authorDID: this.authorDID,
      lamport,
      wallTime,
      batchId,
      batchIndex,
      batchSize
    })

    return signChange(unsigned, this.signingKey)
  }

  /**
   * Apply a change to storage and update materialized state.
   */
  private async applyChange(change: NodeChange): Promise<void> {
    const { nodeId, schemaId, properties, deleted } = change.payload

    // Append to change log
    await this.storage.appendChange(change)

    // Update Lamport time
    await this.storage.setLastLamportTime(this.clock.time)

    // Get or create materialized state
    let node = await this.storage.getNode(nodeId)

    if (!node) {
      // First change for this node - create it
      if (!schemaId) {
        throw new Error(`First change for node ${nodeId} must include schemaId`)
      }

      node = {
        id: nodeId,
        schemaId,
        properties: {},
        timestamps: {},
        deleted: false,
        createdAt: change.wallTime,
        createdBy: change.authorDID,
        updatedAt: change.wallTime,
        updatedBy: change.authorDID
      }
    }

    // Apply property changes with LWW
    for (const [key, value] of Object.entries(properties)) {
      const existingTs = node.timestamps[key]
      const newTs: PropertyTimestamp = {
        lamport: change.lamport,
        wallTime: change.wallTime
      }

      if (!existingTs || this.shouldReplace(existingTs, newTs)) {
        // New value wins
        if (value === undefined) {
          delete node.properties[key]
        } else {
          node.properties[key] = value
        }
        node.timestamps[key] = newTs

        // Track conflict if there was an existing value
        if (existingTs) {
          this.conflicts.push({
            nodeId,
            key,
            localValue: node.properties[key],
            localTimestamp: existingTs,
            remoteValue: value,
            remoteTimestamp: newTs,
            resolved: 'remote'
          })
        }
      } else {
        // Existing value wins
        this.conflicts.push({
          nodeId,
          key,
          localValue: node.properties[key],
          localTimestamp: existingTs,
          remoteValue: value,
          remoteTimestamp: newTs,
          resolved: 'local'
        })
      }
    }

    // Handle deleted flag
    if (deleted !== undefined) {
      const deletedTs: PropertyTimestamp = {
        lamport: change.lamport,
        wallTime: change.wallTime
      }

      if (!node.deletedAt || this.shouldReplace(node.deletedAt, deletedTs)) {
        node.deleted = deleted
        node.deletedAt = deletedTs
      }
    }

    // Update metadata
    node.updatedAt = Math.max(node.updatedAt, change.wallTime)
    node.updatedBy = change.authorDID

    // Persist
    await this.storage.setNode(node)
  }

  /**
   * Determine if newTs should replace existingTs (LWW).
   */
  private shouldReplace(existing: PropertyTimestamp, incoming: PropertyTimestamp): boolean {
    return compareLamportTimestamps(incoming.lamport, existing.lamport) > 0
  }
}
