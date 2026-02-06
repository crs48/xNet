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

import type {
  NodeId,
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
  NodeChangeListener,
  PropertyLookup,
  GetWithMigrationOptions,
  MigratedNodeState
} from './types'
import type { LensRegistry } from '../schema/lens'
import type { DID } from '@xnet/core'
import {
  createLamportClock,
  tick,
  receive,
  compareLamportTimestamps,
  signChange,
  createUnsignedChange,
  createBatchId,
  type LamportClock,
  type LamportTimestamp
} from '@xnet/sync'
import { createNodeId, getBaseSchemaIRI } from '../schema/node'
import { resolveTempIds, type SchemaLookup } from './tempids'

/** Maximum number of conflicts to retain before trimming */
const MAX_CONFLICTS = 200

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
  private schemaLookup?: SchemaLookup
  private propertyLookup?: PropertyLookup
  private lensRegistry?: LensRegistry

  constructor(options: NodeStoreOptions) {
    this.storage = options.storage
    this.authorDID = options.authorDID
    this.signingKey = options.signingKey
    this.clock = createLamportClock(options.authorDID)
    this.schemaLookup = options.schemaLookup
    this.propertyLookup = options.propertyLookup
    this.lensRegistry = options.lensRegistry
  }

  /**
   * Initialize the store by loading the last Lamport time from storage.
   * Call this before using the store.
   */
  async initialize(): Promise<void> {
    const lastTime = await this.storage.getLastLamportTime()
    this.clock = { ...this.clock, time: lastTime }
  }

  /**
   * Get the underlying storage adapter.
   *
   * Use this to access low-level storage operations like change history,
   * document content, and Lamport timestamps. Useful for building history,
   * audit, and verification features.
   *
   * @returns The NodeStorageAdapter instance
   */
  getStorageAdapter(): NodeStorageAdapter {
    return this.storage
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
   * Get a Node by ID with automatic schema migration.
   *
   * If the stored node's schema version differs from the target schema,
   * and a migration path exists in the lens registry, the node's properties
   * will be automatically transformed.
   *
   * @param id - The node ID to fetch
   * @param options - Options including the target schema IRI
   * @returns The node with migrated properties, or null if not found
   *
   * @example
   * ```typescript
   * // Get node and migrate to TaskSchema v2.0.0
   * const node = await store.getWithMigration('node-123', {
   *   targetSchemaId: TaskSchemaV2['@id']
   * })
   *
   * if (node?._migrationInfo) {
   *   console.log('Migrated from:', node._migrationInfo.from)
   *   if (!node._migrationInfo.lossless) {
   *     console.warn('Migration warnings:', node._migrationInfo.warnings)
   *   }
   * }
   * ```
   */
  async getWithMigration(
    id: NodeId,
    options: GetWithMigrationOptions
  ): Promise<MigratedNodeState | null> {
    const node = await this.storage.getNode(id)
    if (!node) return null

    // Determine stored schema version
    const storedSchemaId = node._schemaVersion
      ? (`${getBaseSchemaIRI(node.schemaId)}@${node._schemaVersion}` as const)
      : node.schemaId

    // If same schema, no migration needed
    if (storedSchemaId === options.targetSchemaId) {
      return node
    }

    // Check if we have a lens registry
    if (!this.lensRegistry) {
      // No registry - return node as-is without migration
      return node
    }

    // Check if migration path exists
    if (!this.lensRegistry.canMigrate(storedSchemaId, options.targetSchemaId)) {
      // No migration path - return node as-is
      return node
    }

    // Perform migration
    const result = this.lensRegistry.transformWithDetails(
      node.properties,
      storedSchemaId,
      options.targetSchemaId
    )

    // Return migrated node with migration info
    return {
      ...node,
      properties: result.data,
      _migrationInfo: {
        from: storedSchemaId,
        to: options.targetSchemaId,
        lossless: result.lossless,
        warnings: result.warnings
      }
    }
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
      return { batchId: '', results: [], changes: [], tempIds: {} }
    }

    // ─── Resolve temp IDs before processing ────────────────────────────────
    const { operations: resolvedOps, tempIds } = resolveTempIds(operations, this.schemaLookup)

    const batchId = createBatchId()
    const batchSize = resolvedOps.length
    const now = Date.now()

    // Tick the clock once for the entire batch
    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    const results: (NodeState | null)[] = []
    const changes: NodeChange[] = []

    for (let i = 0; i < resolvedOps.length; i++) {
      const op = resolvedOps[i]
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

    return { batchId, results, changes, tempIds }
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
   * Get changes since a Lamport time (for delta sync).
   */
  async getChangesSince(sinceLamport: number): Promise<NodeChange[]> {
    return this.storage.getChangesSince(sinceLamport)
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

    // Get known property names from schema (if available)
    const knownProps = this.propertyLookup?.(node.schemaId)

    // Apply property changes with LWW
    for (const [key, value] of Object.entries(properties)) {
      // Check if this is an unknown property (not in schema)
      const isUnknownProperty = knownProps !== undefined && !knownProps.has(key)

      const existingTs = node.timestamps[key]
      const newTs: PropertyTimestamp = {
        lamport: change.lamport,
        wallTime: change.wallTime
      }

      if (!existingTs || this.shouldReplace(existingTs, newTs)) {
        // New value wins
        if (isUnknownProperty) {
          // Store in _unknown for forward compatibility
          if (!node._unknown) {
            node._unknown = {}
          }
          if (value === undefined) {
            delete node._unknown[key]
          } else {
            node._unknown[key] = value
          }
        } else {
          // Store in properties (known property)
          if (value === undefined) {
            delete node.properties[key]
          } else {
            node.properties[key] = value
          }
        }
        node.timestamps[key] = newTs

        // Track conflict if there was an existing value
        if (existingTs) {
          this.conflicts.push({
            nodeId,
            key,
            localValue: isUnknownProperty ? node._unknown?.[key] : node.properties[key],
            localTimestamp: existingTs,
            remoteValue: value,
            remoteTimestamp: newTs,
            resolved: 'remote'
          })
          this.trimConflicts()
        }
      } else {
        // Existing value wins
        this.conflicts.push({
          nodeId,
          key,
          localValue: isUnknownProperty ? node._unknown?.[key] : node.properties[key],
          localTimestamp: existingTs,
          remoteValue: value,
          remoteTimestamp: newTs,
          resolved: 'local'
        })
        this.trimConflicts()
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

  /**
   * Trim conflicts array to prevent unbounded memory growth.
   * Keeps only the most recent MAX_CONFLICTS entries.
   */
  private trimConflicts(): void {
    if (this.conflicts.length > MAX_CONFLICTS) {
      this.conflicts = this.conflicts.slice(-MAX_CONFLICTS)
    }
  }
}
