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
  ListNodesOptions
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
    return node
  }

  /**
   * List Nodes with optional filtering.
   */
  async list(options?: ListNodesOptions): Promise<NodeState[]> {
    return this.storage.listNodes(options)
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
