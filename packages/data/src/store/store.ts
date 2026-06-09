/**
 * NodeStore - Event-sourced storage for Nodes
 *
 * Manages Nodes using Change<T> from @xnetjs/sync with LWW conflict resolution.
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
  NodeBatchChangeListener,
  NodeBatchChangeEvent,
  PropertyLookup,
  GetWithMigrationOptions,
  MigratedNodeState,
  NodeContentCipher,
  ContentKeyCache,
  DeterministicNodeImportDraft,
  ImportDeterministicNodesOptions,
  ImportDeterministicNodesResult,
  ApplyNodeBatchResult,
  NodeBatchIndexMode,
  NodeBatchPreflightResult,
  NodeBatchWriteInput,
  NodeBatchWritePolicy,
  NodeBatchWriteResult,
  NodeBatchWriteTimings,
  NodeBatchNotificationMode
} from './types'
import type { StoreAuthAPI } from '../auth/store-auth'
import type { LensRegistry } from '../schema/lens'
import type { AuthAction, AuthDecision, DID, ContentId, PolicyEvaluator } from '@xnetjs/core'
import { base64ToBytes, bytesToBase64 } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'
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
} from '@xnetjs/sync'
import { verifyChange, verifyChangeHash } from '@xnetjs/sync'
import { createNodeId, getBaseSchemaIRI, type SchemaIRI } from '../schema/node'
import { isSystemNamespaceResource, isSystemSchemaIri } from '../schema/schemas/system'
import { PermissionError } from './permission-error'
import {
  applyNodeQueryDescriptor,
  withoutNodeQueryPagination,
  type NodeQueryDescriptor,
  type NodeQueryResult
} from './query'
import { resolveTempIds, type SchemaLookup } from './tempids'

/** Maximum number of conflicts to retain before trimming */
const MAX_CONFLICTS = 200
const ENCRYPTED_NODE_MARKER = 'xnet:node-encrypted:v1'

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
}

function emptyBatchWriteTimings(): NodeBatchWriteTimings {
  return {
    preflightMs: 0,
    materializeMs: 0,
    applyMs: 0,
    notifyMs: 0,
    totalMs: 0
  }
}

type EncryptedNodeSnapshot = {
  marker: typeof ENCRYPTED_NODE_MARKER
  payload: string
}

type SerializedNodeSnapshot = {
  properties: Record<string, unknown>
  unknown?: Record<string, unknown>
}

type PendingTransactionEvent = {
  change: NodeChange
  result: NodeState | null
  previousNode: NodeState | null
}

type DeterministicNodeImportPlan = {
  created: number
  updated: number
  nodes: NodeState[]
  changes: NodeChange[]
  events: PendingTransactionEvent[]
  affectedSchemaIds: SchemaIRI[]
  timings: Pick<NodeBatchWriteTimings, 'preflightMs' | 'materializeMs'>
}

type DeterministicNodeImportAppliedPlan = DeterministicNodeImportPlan & {
  applyMs: number
  storage?: ApplyNodeBatchResult
}

type DeterministicNodeImportExecution = ImportDeterministicNodesResult & {
  storage?: ApplyNodeBatchResult
  timings: NodeBatchWriteTimings
}

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
  private batchListeners: Set<NodeBatchChangeListener> = new Set()
  private schemaLookup?: SchemaLookup
  private propertyLookup?: PropertyLookup
  private lensRegistry?: LensRegistry
  private authEvaluator?: PolicyEvaluator
  private nodeContentCipher?: NodeContentCipher
  private contentKeyCache?: ContentKeyCache
  private authRelevantPropertyLookup?: (schemaId: SchemaIRI) => Set<string> | undefined
  private onRecipientsMayNeedRecompute?: (context: {
    nodeId: string
    schemaId: SchemaIRI
    changedProperties: string[]
  }) => Promise<void> | void
  private onUnauthorizedRemoteChange?: (context: {
    change: NodeChange
    action: AuthAction
    decision: AuthDecision
  }) => void
  readonly auth?: StoreAuthAPI
  private telemetry?: {
    reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): void
    reportUsage(metricName: string, value: number): void
    reportCrash(error: Error, context?: { codeNamespace?: string }): void
    reportSecurityEvent(eventName: string, severity: 'low' | 'medium' | 'high' | 'critical'): void
  }

  constructor(options: NodeStoreOptions) {
    this.storage = options.storage
    this.authorDID = options.authorDID
    this.signingKey = options.signingKey
    this.clock = createLamportClock(options.authorDID)
    this.schemaLookup = options.schemaLookup
    this.propertyLookup = options.propertyLookup
    this.lensRegistry = options.lensRegistry
    this.authEvaluator = options.authEvaluator
    this.nodeContentCipher = options.nodeContentCipher
    this.contentKeyCache = options.contentKeyCache
    this.authRelevantPropertyLookup = options.authRelevantPropertyLookup
    this.onRecipientsMayNeedRecompute = options.onRecipientsMayNeedRecompute
    this.onUnauthorizedRemoteChange = options.onUnauthorizedRemoteChange
    this.auth = options.auth
    this.telemetry = options.telemetry
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

  private cloneNodeState(node: NodeState | null): NodeState | null {
    return node ? structuredClone(node) : null
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Create a new Node.
   */
  async create(options: CreateNodeOptions): Promise<NodeState> {
    const start = this.telemetry ? Date.now() : 0
    const id = options.id ?? createNodeId()

    try {
      await this.assertAuthorized({
        subject: this.authorDID,
        action: 'write',
        nodeId: id,
        patch: options.properties,
        node: {
          schemaId: options.schemaId,
          createdBy: this.authorDID,
          properties: options.properties
        }
      })

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

      await this.persistEncryptedNodeSnapshot(node)

      // Emit change event
      this.emit(change, node, null, false)
      this.authEvaluator?.invalidate(node.id)

      // Track performance
      if (this.telemetry) {
        this.telemetry.reportPerformance('data.create', Date.now() - start)
        this.telemetry.reportUsage('data.create', 1)
      }

      return node
    } catch (err) {
      // Track crash
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'data.NodeStore.create'
      })
      throw err
    }
  }

  /**
   * Get a Node by ID.
   */
  async get(id: NodeId): Promise<NodeState | null> {
    const node = await this.storage.getNode(id)
    const decrypted = await this.decryptNodeSnapshotIfPresent(node)
    return (await this.canReadNode(decrypted)) ? decrypted : null
  }

  /**
   * Return the subset of IDs that already exist in materialized storage.
   *
   * This intentionally returns identifiers only and does not hydrate node
   * contents. Importers use it to route deterministic drafts to create/update.
   */
  async getExistingNodeIds(ids: readonly NodeId[]): Promise<NodeId[]> {
    const uniqueIds = Array.from(new Set(ids))
    if (uniqueIds.length === 0) return []

    if (this.storage.getExistingNodeIds) {
      return this.storage.getExistingNodeIds(uniqueIds)
    }

    const existingIds = await Promise.all(
      uniqueIds.map(
        async (id): Promise<NodeId | null> => ((await this.storage.getNode(id)) ? id : null)
      )
    )
    return existingIds.filter((id): id is NodeId => id !== null)
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
    const node = await this.get(id)
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
    const start = this.telemetry ? Date.now() : 0

    try {
      const existing = this.cloneNodeState(await this.storage.getNode(id))
      if (!existing) {
        throw new Error(`Node not found: ${id}`)
      }

      await this.assertAuthorized({
        subject: this.authorDID,
        action: 'write',
        nodeId: id,
        patch: options.properties,
        node: {
          schemaId: existing.schemaId,
          createdBy: existing.createdBy,
          properties: existing.properties
        }
      })

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

      await this.persistEncryptedNodeSnapshot(node)

      // Emit change event
      this.emit(change, node, existing, false)
      this.authEvaluator?.invalidate(node.id)

      if (this.shouldRecomputeRecipients(existing.schemaId, options.properties)) {
        await this.onRecipientsMayNeedRecompute?.({
          nodeId: id,
          schemaId: existing.schemaId,
          changedProperties: Object.keys(options.properties)
        })
      }

      // Track performance
      if (this.telemetry) {
        this.telemetry.reportPerformance('data.update', Date.now() - start)
        this.telemetry.reportUsage('data.update', 1)
      }

      return node
    } catch (err) {
      // Track crash
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'data.NodeStore.update'
      })
      throw err
    }
  }

  /**
   * Delete a Node (soft delete).
   */
  async delete(id: NodeId): Promise<void> {
    const start = this.telemetry ? Date.now() : 0

    try {
      const existing = this.cloneNodeState(await this.storage.getNode(id))
      if (!existing) {
        throw new Error(`Node not found: ${id}`)
      }

      await this.assertAuthorized({
        subject: this.authorDID,
        action: 'delete',
        nodeId: id,
        node: {
          schemaId: existing.schemaId,
          createdBy: existing.createdBy,
          properties: existing.properties
        }
      })

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

      this.contentKeyCache?.delete(id)

      // Emit change event
      const deletedNode = await this.storage.getNode(id)
      this.emit(change, deletedNode, existing, false)
      this.authEvaluator?.invalidate(id)

      // Track performance
      if (this.telemetry) {
        this.telemetry.reportPerformance('data.delete', Date.now() - start)
        this.telemetry.reportUsage('data.delete', 1)
      }
    } catch (err) {
      // Track crash
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'data.NodeStore.delete'
      })
      throw err
    }
  }

  /**
   * Restore a deleted Node.
   */
  async restore(id: NodeId): Promise<NodeState> {
    const existing = this.cloneNodeState(await this.storage.getNode(id))
    if (!existing) {
      throw new Error(`Node not found: ${id}`)
    }

    await this.assertAuthorized({
      subject: this.authorDID,
      action: 'write',
      nodeId: id,
      node: {
        schemaId: existing.schemaId,
        createdBy: existing.createdBy,
        properties: existing.properties
      }
    })

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

    await this.persistEncryptedNodeSnapshot(node)

    // Emit change event
    this.emit(change, node, existing, false)
    this.authEvaluator?.invalidate(node.id)

    return node
  }

  /**
   * List Nodes with optional filtering.
   */
  async list(options?: ListNodesOptions): Promise<NodeState[]> {
    const start = this.telemetry ? Date.now() : 0

    try {
      const nodes = await this.storage.listNodes(
        this.authEvaluator
          ? {
              ...options,
              limit: undefined,
              offset: undefined
            }
          : options
      )
      const decrypted = await Promise.all(
        nodes.map((node) => this.decryptNodeSnapshotIfPresent(node))
      )
      const readable = await this.filterReadableNodes(
        decrypted.filter((node): node is NodeState => node !== null)
      )
      const result = this.authEvaluator ? this.applyListPagination(readable, options) : readable

      // Track performance
      if (this.telemetry) {
        this.telemetry.reportPerformance('data.list', Date.now() - start)
        this.telemetry.reportUsage('data.list', 1)
      }

      return result
    } catch (err) {
      // Track crash
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'data.NodeStore.list'
      })
      throw err
    }
  }

  /**
   * Query nodes with descriptor semantics and storage-level pushdown when available.
   */
  async query(descriptor: NodeQueryDescriptor): Promise<NodeQueryResult> {
    const start = Date.now()

    try {
      if (this.storage.queryNodes && !this.nodeContentCipher && !this.authEvaluator) {
        const result = await this.storage.queryNodes(descriptor)
        return {
          nodes: result.nodes,
          totalCount: result.totalCount,
          plan: {
            ...result.plan,
            durationMs: Date.now() - start
          }
        }
      }

      const fallback = await this.loadQueryFallbackCandidates(descriptor)
      const nodes = fallback.nodes
      const decrypted = await Promise.all(
        nodes.map((node) => this.decryptNodeSnapshotIfPresent(node))
      )
      const readable = await this.filterReadableNodes(
        decrypted.filter((node): node is NodeState => node !== null)
      )
      const result = applyNodeQueryDescriptor(readable, fallback.postFilterDescriptor)
      const totalCount =
        fallback.totalCount ??
        applyNodeQueryDescriptor(
          readable,
          withoutNodeQueryPagination(fallback.postFilterDescriptor)
        ).length

      return {
        nodes: result,
        totalCount,
        plan: {
          strategy: 'list-fallback',
          candidateNodeCount: readable.length,
          hydratedNodeCount: readable.length,
          returnedNodeCount: result.length,
          durationMs: Date.now() - start,
          postFilterReason: this.getQueryFallbackReason()
        }
      }
    } catch (err) {
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'data.NodeStore.query'
      })
      throw err
    }
  }

  private async loadQueryFallbackCandidates(descriptor: NodeQueryDescriptor): Promise<{
    nodes: NodeState[]
    postFilterDescriptor: NodeQueryDescriptor
    totalCount?: number
  }> {
    if (descriptor.nodeId) {
      const node = await this.storage.getNode(descriptor.nodeId)
      return {
        nodes: node ? [node] : [],
        postFilterDescriptor: descriptor
      }
    }

    const canPushSystemList = this.canPushSystemListQuery(descriptor)
    const canPushPagination =
      canPushSystemList && !this.authEvaluator && descriptor.after === undefined
    const hasPagination =
      descriptor.limit !== undefined ||
      (descriptor.offset ?? 0) > 0 ||
      descriptor.after !== undefined
    const totalCount =
      canPushPagination && hasPagination
        ? await this.storage.countNodes({
            schemaId: descriptor.schemaId,
            includeDeleted: descriptor.includeDeleted
          })
        : undefined
    const nodes = await this.storage.listNodes({
      schemaId: descriptor.schemaId,
      includeDeleted: descriptor.includeDeleted,
      ...(canPushSystemList && descriptor.orderBy ? { orderBy: descriptor.orderBy } : {}),
      ...(canPushPagination && descriptor.limit !== undefined ? { limit: descriptor.limit } : {}),
      ...(canPushPagination && descriptor.offset !== undefined ? { offset: descriptor.offset } : {})
    })

    return {
      nodes,
      totalCount,
      postFilterDescriptor:
        canPushPagination && hasPagination ? withoutNodeQueryPagination(descriptor) : descriptor
    }
  }

  private canPushSystemListQuery(descriptor: NodeQueryDescriptor): boolean {
    if (descriptor.spatial) return false
    if (descriptor.search) return false
    if (descriptor.where && Object.keys(descriptor.where).length > 0) return false

    return Object.keys(descriptor.orderBy ?? {}).every(
      (key) => key === 'createdAt' || key === 'updatedAt'
    )
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

    await this.assertAuthorizedBatch(resolvedOps)

    const batchId = createBatchId()
    const batchSize = resolvedOps.length
    const now = Date.now()
    const previousClock = this.clock

    // Tick the clock once for the entire batch
    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    try {
      const run = (storage: NodeStorageAdapter) =>
        this.executeTransactionOperations({
          operations: resolvedOps,
          storage,
          lamport,
          now,
          batchId,
          batchSize
        })
      const result = this.storage.withTransaction
        ? await this.storage.withTransaction(run)
        : await run(this.storage)

      for (const event of result.events) {
        this.emit(event.change, event.result, event.previousNode, false)
        this.authEvaluator?.invalidate(event.change.payload.nodeId)
      }

      return { batchId, results: result.results, changes: result.changes, tempIds }
    } catch (err) {
      this.clock = previousClock
      throw err
    }
  }

  /**
   * Import deterministic node drafts as signed node changes.
   *
   * This is optimized for importers that already have stable node IDs. It uses
   * one Lamport timestamp and batch ID for the whole import, materializes nodes
   * in memory, then persists final node states and all changes in one storage
   * transaction when the adapter supports it.
   */
  async importDeterministicNodes(
    drafts: readonly DeterministicNodeImportDraft[],
    options: ImportDeterministicNodesOptions = {}
  ): Promise<ImportDeterministicNodesResult> {
    const result = await this.executeDeterministicNodeBatch(drafts, options, {
      notificationMode: 'per-node'
    })

    return this.toImportDeterministicNodesResult(result)
  }

  async batchWrite(input: NodeBatchWriteInput): Promise<NodeBatchWriteResult> {
    switch (input.kind) {
      case 'deterministic-import': {
        const policy = this.resolveNodeBatchWritePolicy(input.policy)
        const result = await this.executeDeterministicNodeBatch(
          input.drafts,
          { indexMode: policy.indexMode },
          { notificationMode: policy.notificationMode }
        )

        return {
          batchId: result.batchId,
          created: result.created,
          updated: result.updated,
          nodeIds: result.nodes.map((node) => node.id),
          schemaIds: result.affectedSchemaIds,
          changeCount: result.changes.length,
          storage: result.storage,
          timings: result.timings
        }
      }

      case 'operations': {
        const policy = this.resolveNodeBatchWritePolicy(input.policy)
        const result = await this.executeOperationNodeBatch(
          input.operations,
          policy.notificationMode
        )

        return {
          batchId: result.batchId,
          created: result.created,
          updated: result.updated,
          nodeIds: result.nodeIds,
          schemaIds: result.schemaIds,
          changeCount: result.changes.length,
          timings: result.timings
        }
      }
    }
  }

  private resolveNodeBatchWritePolicy(
    policy?: Partial<NodeBatchWritePolicy>
  ): NodeBatchWritePolicy {
    return {
      indexMode: policy?.indexMode ?? 'touched',
      notificationMode: policy?.notificationMode ?? 'per-node',
      syncMode: policy?.syncMode ?? 'normal'
    }
  }

  private toImportDeterministicNodesResult(
    result: DeterministicNodeImportExecution
  ): ImportDeterministicNodesResult {
    return {
      batchId: result.batchId,
      created: result.created,
      updated: result.updated,
      nodes: result.nodes,
      changes: result.changes,
      affectedSchemaIds: result.affectedSchemaIds,
      storage: result.storage,
      timings: result.timings
    }
  }

  private async executeOperationNodeBatch(
    operations: readonly TransactionOperation[],
    notificationMode: NodeBatchNotificationMode
  ): Promise<{
    batchId: string
    created: number
    updated: number
    nodeIds: NodeId[]
    schemaIds: SchemaIRI[]
    changes: NodeChange[]
    timings: NodeBatchWriteTimings
  }> {
    const totalStartedAt = Date.now()
    if (operations.length === 0) {
      return {
        batchId: '',
        created: 0,
        updated: 0,
        nodeIds: [],
        schemaIds: [],
        changes: [],
        timings: emptyBatchWriteTimings()
      }
    }

    const { operations: resolvedOps } = resolveTempIds([...operations], this.schemaLookup)

    await this.assertAuthorizedBatch(resolvedOps)

    const batchId = createBatchId()
    const batchSize = resolvedOps.length
    const now = Date.now()
    const previousClock = this.clock
    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    try {
      const applyStartedAt = Date.now()
      const run = (storage: NodeStorageAdapter) =>
        this.executeTransactionOperations({
          operations: resolvedOps,
          storage,
          lamport,
          now,
          batchId,
          batchSize
        })
      const result = this.storage.withTransaction
        ? await this.storage.withTransaction(run)
        : await run(this.storage)
      const applyMs = elapsedMs(applyStartedAt)

      const nodeIds = Array.from(new Set(result.changes.map((change) => change.payload.nodeId)))
      const schemaIds = Array.from(
        new Set(
          result.events.flatMap((event) => {
            const schemaId = event.result?.schemaId ?? event.previousNode?.schemaId
            return schemaId ? [schemaId] : []
          })
        )
      )
      const created = result.events.filter(
        (event) => event.previousNode === null && event.result !== null
      ).length
      const updated = result.events.length - created

      const notifyStartedAt = Date.now()
      if (notificationMode === 'per-node') {
        for (const event of result.events) {
          this.emit(event.change, event.result, event.previousNode, false)
          this.authEvaluator?.invalidate(event.change.payload.nodeId)
        }
      } else {
        const nodes = result.events.flatMap((event) => event.result ?? event.previousNode ?? [])
        this.invalidateAuthForNodes(nodes)

        if (notificationMode === 'batch') {
          this.emitDeterministicImportBatch({
            batchId,
            nodeIds,
            schemaIds,
            created,
            updated,
            changeCount: result.changes.length,
            isRemote: false,
            timings: {
              preflightMs: 0,
              materializeMs: 0,
              applyMs,
              notifyMs: 0,
              totalMs: elapsedMs(totalStartedAt)
            }
          })
        }
      }
      const notifyMs = elapsedMs(notifyStartedAt)

      return {
        batchId,
        created,
        updated,
        nodeIds,
        schemaIds,
        changes: result.changes,
        timings: {
          preflightMs: 0,
          materializeMs: 0,
          applyMs,
          notifyMs,
          totalMs: elapsedMs(totalStartedAt)
        }
      }
    } catch (err) {
      this.clock = previousClock
      throw err
    }
  }

  private async executeDeterministicNodeBatch(
    drafts: readonly DeterministicNodeImportDraft[],
    options: ImportDeterministicNodesOptions,
    behavior: { notificationMode: NodeBatchNotificationMode }
  ): Promise<DeterministicNodeImportExecution> {
    const totalStartedAt = Date.now()

    if (drafts.length === 0) {
      return {
        batchId: '',
        created: 0,
        updated: 0,
        nodes: [],
        changes: [],
        affectedSchemaIds: [],
        timings: emptyBatchWriteTimings()
      }
    }

    await this.assertAuthorizedBatch(await this.createDeterministicImportAuthOps(drafts))

    const batchId = createBatchId()
    const batchSize = drafts.length
    const now = Date.now()
    const previousClock = this.clock
    const indexMode = this.resolveDeterministicImportIndexMode(options)

    const [newClock, lamport] = tick(this.clock)
    this.clock = newClock

    try {
      let result: DeterministicNodeImportAppliedPlan

      if (this.storage.applyNodeBatch && !this.nodeContentCipher) {
        const plan = await this.planDeterministicNodeImport({
          drafts,
          storage: this.storage,
          lamport,
          now,
          batchId,
          batchSize
        })

        const applyStartedAt = Date.now()
        const storageResult = await this.storage.applyNodeBatch({
          batchId,
          nodes: plan.nodes,
          changes: plan.changes,
          lastLamportTime: this.clock.time,
          affectedSchemaIds: plan.affectedSchemaIds,
          indexMode,
          indexProperties: true
        })

        result = {
          ...plan,
          applyMs: elapsedMs(applyStartedAt),
          storage: storageResult
        }
      } else {
        const run = (storage: NodeStorageAdapter) =>
          this.executeDeterministicNodeImport({
            drafts,
            storage,
            lamport,
            now,
            batchId,
            batchSize,
            deferIndexes: indexMode === 'defer-schema'
          })
        result = this.storage.withTransaction
          ? await this.storage.withTransaction(run)
          : await run(this.storage)
      }

      const notifyStartedAt = Date.now()
      if (behavior.notificationMode === 'per-node') {
        this.emitDeterministicImportEvents(result.events)
      } else {
        this.invalidateAuthForNodes(result.nodes)

        if (behavior.notificationMode === 'batch') {
          this.emitDeterministicImportBatch({
            batchId,
            nodeIds: result.nodes.map((node) => node.id),
            schemaIds: result.affectedSchemaIds,
            created: result.created,
            updated: result.updated,
            changeCount: result.changes.length,
            isRemote: false,
            storage: result.storage,
            timings: {
              preflightMs: result.timings.preflightMs,
              materializeMs: result.timings.materializeMs,
              applyMs: result.applyMs,
              notifyMs: 0,
              totalMs: elapsedMs(totalStartedAt)
            }
          })
        }
      }
      const notifyMs = elapsedMs(notifyStartedAt)

      return {
        batchId,
        created: result.created,
        updated: result.updated,
        nodes: result.nodes,
        changes: result.changes,
        affectedSchemaIds: result.affectedSchemaIds,
        storage: result.storage,
        timings: {
          preflightMs: result.timings.preflightMs,
          materializeMs: result.timings.materializeMs,
          applyMs: result.applyMs,
          notifyMs,
          totalMs: elapsedMs(totalStartedAt)
        }
      }
    } catch (err) {
      this.clock = previousClock
      throw err
    }
  }

  private resolveDeterministicImportIndexMode(
    options: ImportDeterministicNodesOptions
  ): NodeBatchIndexMode {
    if (options.indexMode) return options.indexMode
    if (options.deferIndexes === true) return 'defer-schema'
    return 'touched'
  }

  private emitDeterministicImportEvents(events: readonly PendingTransactionEvent[]): void {
    for (const event of events) {
      this.emit(event.change, event.result, event.previousNode, false)
      this.authEvaluator?.invalidate(event.change.payload.nodeId)
    }
  }

  private invalidateAuthForNodes(nodes: readonly NodeState[]): void {
    if (!this.authEvaluator) return

    nodes.forEach((node) => this.authEvaluator?.invalidate(node.id))
  }

  private async createDeterministicImportAuthOps(
    drafts: readonly DeterministicNodeImportDraft[]
  ): Promise<TransactionOperation[]> {
    if (!this.authEvaluator && !this.auth) {
      return []
    }

    const existingNodes = await this.getNodesById(
      drafts.map((draft) => draft.id),
      this.storage
    )
    const knownIds = new Set(existingNodes.keys())

    return drafts.map((draft): TransactionOperation => {
      if (knownIds.has(draft.id)) {
        return { type: 'update', nodeId: draft.id, options: { properties: draft.properties } }
      }

      knownIds.add(draft.id)
      return {
        type: 'create',
        options: {
          id: draft.id,
          schemaId: draft.schemaId,
          properties: draft.properties
        }
      }
    })
  }

  private async planDeterministicNodeImport(input: {
    drafts: readonly DeterministicNodeImportDraft[]
    storage: NodeStorageAdapter
    lamport: LamportTimestamp
    now: number
    batchId: string
    batchSize: number
  }): Promise<DeterministicNodeImportPlan> {
    const ids = input.drafts.map((draft) => draft.id)
    const preflightStartedAt = Date.now()
    const preflight = await this.getBatchPreflight(ids, input.storage)
    const preflightMs = elapsedMs(preflightStartedAt)
    const materializeStartedAt = Date.now()
    const existingNodes = this.cloneNodeMap(preflight.nodesById)
    const lastChanges = new Map(preflight.lastChangesByNodeId)
    const nodesById = new Map<NodeId, NodeState>(existingNodes)
    const changedIds: NodeId[] = []
    const seenChangedIds = new Set<NodeId>()
    const changes: NodeChange[] = []
    const events: PendingTransactionEvent[] = []
    let created = 0
    let updated = 0

    for (let index = 0; index < input.drafts.length; index++) {
      const draft = input.drafts[index]
      const currentNode = nodesById.get(draft.id) ?? null
      const previousNode = this.cloneNodeState(currentNode)
      const isCreate = currentNode === null
      const payload: NodePayload = {
        nodeId: draft.id,
        ...(isCreate ? { schemaId: draft.schemaId } : {}),
        properties: draft.properties
      }
      const change = await this.createBatchedChangeWithParentHash(
        'node-change',
        payload,
        lastChanges.get(draft.id)?.hash ?? null,
        input.lamport,
        input.now,
        input.batchId,
        index,
        input.batchSize
      )
      const node = this.materializeNodeChange(
        change,
        currentNode ?? this.createInitialNodeFromChange(change, draft.schemaId)
      )

      nodesById.set(draft.id, node)
      lastChanges.set(draft.id, change)
      changes.push(change)
      events.push({ change, result: this.cloneNodeState(node), previousNode })

      if (!seenChangedIds.has(draft.id)) {
        changedIds.push(draft.id)
        seenChangedIds.add(draft.id)
      }

      if (isCreate) {
        created += 1
      } else {
        updated += 1
      }
    }

    const nodes = changedIds.flatMap((id) => {
      const node = nodesById.get(id)
      return node ? [node] : []
    })
    const affectedSchemaIds = Array.from(new Set(nodes.map((node) => node.schemaId)))

    return {
      created,
      updated,
      nodes,
      changes,
      events,
      affectedSchemaIds,
      timings: {
        preflightMs,
        materializeMs: elapsedMs(materializeStartedAt)
      }
    }
  }

  private async executeDeterministicNodeImport(input: {
    drafts: readonly DeterministicNodeImportDraft[]
    storage: NodeStorageAdapter
    lamport: LamportTimestamp
    now: number
    batchId: string
    batchSize: number
    deferIndexes: boolean
  }): Promise<DeterministicNodeImportAppliedPlan> {
    const plan = await this.planDeterministicNodeImport(input)

    const applyStartedAt = Date.now()
    await this.importMaterializedNodes(input.storage, plan.nodes, {
      deferIndexes: input.deferIndexes
    })
    await this.appendImportedChanges(input.storage, plan.changes)
    await input.storage.setLastLamportTime(this.clock.time)

    for (const node of plan.nodes) {
      await this.persistEncryptedNodeSnapshot(node, input.storage)
    }

    return {
      ...plan,
      applyMs: elapsedMs(applyStartedAt)
    }
  }

  private async getNodesById(
    ids: readonly NodeId[],
    storage: NodeStorageAdapter
  ): Promise<Map<NodeId, NodeState>> {
    const uniqueIds = Array.from(new Set(ids))
    if (uniqueIds.length === 0) return new Map()

    const nodes = storage.getNodes
      ? await storage.getNodes(uniqueIds)
      : (
          await Promise.all(
            uniqueIds.map(async (id): Promise<NodeState | null> => storage.getNode(id))
          )
        ).filter((node): node is NodeState => node !== null)

    return new Map(
      nodes.flatMap((node): [NodeId, NodeState][] => {
        const cloned = this.cloneNodeState(node)
        return cloned ? [[node.id, cloned]] : []
      })
    )
  }

  private async getBatchPreflight(
    ids: readonly NodeId[],
    storage: NodeStorageAdapter
  ): Promise<NodeBatchPreflightResult> {
    if (storage.getBatchPreflight) {
      return storage.getBatchPreflight(ids)
    }

    const [nodesById, lastChangesByNodeId] = await Promise.all([
      this.getNodesById(ids, storage),
      this.getLastChangesByNodeId(ids, storage)
    ])

    return { nodesById, lastChangesByNodeId }
  }

  private cloneNodeMap(nodesById: ReadonlyMap<NodeId, NodeState>): Map<NodeId, NodeState> {
    return new Map(
      Array.from(nodesById.entries()).flatMap(([nodeId, node]): [NodeId, NodeState][] => {
        const cloned = this.cloneNodeState(node)
        return cloned ? [[nodeId, cloned]] : []
      })
    )
  }

  private async getLastChangesByNodeId(
    ids: readonly NodeId[],
    storage: NodeStorageAdapter
  ): Promise<Map<NodeId, NodeChange>> {
    const uniqueIds = Array.from(new Set(ids))
    if (uniqueIds.length === 0) return new Map()

    if (storage.getLastChangesByNodeId) {
      return storage.getLastChangesByNodeId(uniqueIds)
    }

    const changes = await Promise.all(
      uniqueIds.map(async (id): Promise<[NodeId, NodeChange] | null> => {
        const change = await storage.getLastChange(id)
        return change ? [id, change] : null
      })
    )

    return new Map(changes.filter((entry): entry is [NodeId, NodeChange] => entry !== null))
  }

  private async importMaterializedNodes(
    storage: NodeStorageAdapter,
    nodes: readonly NodeState[],
    options?: Pick<ImportDeterministicNodesOptions, 'deferIndexes'>
  ): Promise<void> {
    if (nodes.length === 0) return

    const indexProperties = !this.nodeContentCipher
    const deferIndexes = options?.deferIndexes === true && Boolean(storage.rebuildIndexesForSchemas)

    if (storage.importNodes) {
      await storage.importNodes(nodes, {
        indexProperties,
        deferIndexes,
        trustMaterializedState: true
      })
      return
    }

    for (const node of nodes) {
      await storage.setNode(node, { indexProperties })
    }
  }

  async rebuildIndexesForSchemas(schemaIds: readonly SchemaIRI[]): Promise<void> {
    const uniqueSchemaIds = Array.from(new Set(schemaIds.filter(Boolean)))
    if (uniqueSchemaIds.length === 0) return
    if (!this.storage.rebuildIndexesForSchemas) return

    await this.storage.rebuildIndexesForSchemas(uniqueSchemaIds, {
      indexProperties: !this.nodeContentCipher
    })
  }

  private async appendImportedChanges(
    storage: NodeStorageAdapter,
    changes: readonly NodeChange[]
  ): Promise<void> {
    if (changes.length === 0) return

    if (storage.appendChanges) {
      await storage.appendChanges(changes)
      return
    }

    for (const change of changes) {
      await storage.appendChange(change)
    }
  }

  private async executeTransactionOperations(input: {
    operations: TransactionOperation[]
    storage: NodeStorageAdapter
    lamport: LamportTimestamp
    now: number
    batchId: string
    batchSize: number
  }): Promise<{
    results: (NodeState | null)[]
    changes: NodeChange[]
    events: PendingTransactionEvent[]
  }> {
    const results: (NodeState | null)[] = []
    const changes: NodeChange[] = []
    const events: PendingTransactionEvent[] = []

    for (let i = 0; i < input.operations.length; i++) {
      const op = input.operations[i]
      let change: NodeChange
      let result: NodeState | null = null
      let previousNode: NodeState | null = null

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
            input.lamport,
            input.now,
            input.batchId,
            i,
            input.batchSize,
            input.storage
          )
          await this.applyChange(change, input.storage)
          result = await input.storage.getNode(id)
          await this.persistEncryptedNodeSnapshot(result, input.storage)
          break
        }

        case 'update': {
          const existing = this.cloneNodeState(await input.storage.getNode(op.nodeId))
          if (!existing) {
            throw new Error(`Node not found: ${op.nodeId}`)
          }
          previousNode = existing
          const payload: NodePayload = {
            nodeId: op.nodeId,
            properties: op.options.properties
          }
          change = await this.createBatchedChange(
            'node-change',
            payload,
            input.lamport,
            input.now,
            input.batchId,
            i,
            input.batchSize,
            input.storage
          )
          await this.applyChange(change, input.storage)
          result = await input.storage.getNode(op.nodeId)
          await this.persistEncryptedNodeSnapshot(result, input.storage)
          break
        }

        case 'delete': {
          const existing = this.cloneNodeState(await input.storage.getNode(op.nodeId))
          if (!existing) {
            throw new Error(`Node not found: ${op.nodeId}`)
          }
          previousNode = existing
          const payload: NodePayload = {
            nodeId: op.nodeId,
            properties: {},
            deleted: true
          }
          change = await this.createBatchedChange(
            'node-change',
            payload,
            input.lamport,
            input.now,
            input.batchId,
            i,
            input.batchSize,
            input.storage
          )
          await this.applyChange(change, input.storage)
          result = null
          break
        }

        case 'restore': {
          const existing = this.cloneNodeState(await input.storage.getNode(op.nodeId))
          if (!existing) {
            throw new Error(`Node not found: ${op.nodeId}`)
          }
          previousNode = existing
          const payload: NodePayload = {
            nodeId: op.nodeId,
            properties: {},
            deleted: false
          }
          change = await this.createBatchedChange(
            'node-change',
            payload,
            input.lamport,
            input.now,
            input.batchId,
            i,
            input.batchSize,
            input.storage
          )
          await this.applyChange(change, input.storage)
          result = await input.storage.getNode(op.nodeId)
          await this.persistEncryptedNodeSnapshot(result, input.storage)
          break
        }
      }

      changes.push(change)
      results.push(result)
      events.push({ change, result, previousNode })
    }

    return { results, changes, events }
  }

  // ==========================================================================
  // Sync Support
  // ==========================================================================

  /**
   * Apply a remote change (from sync).
   * Verifies the change signature before applying.
   *
   * @throws Error if signature verification fails
   */
  async applyRemoteChange(change: NodeChange): Promise<void> {
    const start = this.telemetry ? Date.now() : 0

    try {
      // Verify hash integrity (no tampering)
      if (!verifyChangeHash(change)) {
        const error = new Error(
          `[NodeStore] Remote change ${change.id} failed hash verification - data may be corrupted`
        )
        this.telemetry?.reportSecurityEvent('data.hash_verification_failed', 'high')
        throw error
      }

      // Verify signature matches the author's public key
      try {
        const publicKey = parseDID(change.authorDID)
        if (!verifyChange(change, publicKey)) {
          const error = new Error(
            `[NodeStore] Remote change ${change.id} failed signature verification - ` +
              `signature does not match author ${change.authorDID}`
          )
          this.telemetry?.reportSecurityEvent('data.signature_verification_failed', 'high')
          throw error
        }
      } catch (err) {
        // Re-throw verification errors, wrap other errors
        if (err instanceof Error && err.message.includes('failed')) {
          throw err
        }
        throw new Error(
          `[NodeStore] Remote change ${change.id} failed verification: ${err instanceof Error ? err.message : String(err)}`
        )
      }

      if (this.authEvaluator) {
        const action = this.inferActionFromChange(change)
        const decision = await this.authEvaluator.can({
          subject: change.authorDID,
          action,
          nodeId: change.payload.nodeId,
          patch: action === 'write' ? change.payload.properties : undefined
        })

        if (!decision.allowed) {
          this.telemetry?.reportSecurityEvent('data.unauthorized_remote_change', 'medium')
          this.onUnauthorizedRemoteChange?.({ change, action, decision })
          return
        }
      }

      // Update our clock to be at least as recent as the remote
      this.clock = receive(this.clock, change.lamport.time)
      await this.storage.setLastLamportTime(this.clock.time)

      // Apply the change
      const previousNode = this.cloneNodeState(await this.storage.getNode(change.payload.nodeId))
      await this.applyChange(change)

      // Emit change event (marked as remote)
      const node = await this.storage.getNode(change.payload.nodeId)
      await this.persistEncryptedNodeSnapshot(node)
      this.emit(change, node, previousNode, true)
      this.authEvaluator?.invalidate(change.payload.nodeId)

      // Track performance
      if (this.telemetry) {
        this.telemetry.reportPerformance('data.applyRemoteChange', Date.now() - start)
        this.telemetry.reportUsage('data.sync', 1)
      }
    } catch (err) {
      // Track crash
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'data.NodeStore.applyRemoteChange'
      })
      throw err
    }
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

  subscribeToBatchChanges(listener: NodeBatchChangeListener): () => void {
    this.batchListeners.add(listener)
    return () => {
      this.batchListeners.delete(listener)
    }
  }

  private emitDeterministicImportBatch(event: NodeBatchChangeEvent): void {
    for (const listener of this.batchListeners) {
      listener(event)
    }
  }

  /**
   * Emit a change event to all listeners.
   */
  private emit(
    change: NodeChange,
    node: NodeState | null,
    previousNode: NodeState | null,
    isRemote: boolean
  ): void {
    const event = { change, previousNode, node, isRemote }
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
    batchSize: number,
    storage: NodeStorageAdapter = this.storage
  ): Promise<NodeChange> {
    // Get parent hash (last change for this node)
    const lastChange = await storage.getLastChange(payload.nodeId)
    const parentHash = lastChange?.hash ?? null

    return this.createBatchedChangeWithParentHash(
      type,
      payload,
      parentHash,
      lamport,
      wallTime,
      batchId,
      batchIndex,
      batchSize
    )
  }

  private async createBatchedChangeWithParentHash(
    type: string,
    payload: NodePayload,
    parentHash: ContentId | null,
    lamport: LamportTimestamp,
    wallTime: number,
    batchId: string,
    batchIndex: number,
    batchSize: number
  ): Promise<NodeChange> {
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

  private createInitialNodeFromChange(change: NodeChange, schemaId: SchemaIRI): NodeState {
    return {
      id: change.payload.nodeId,
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

  /**
   * Apply a change to storage and update materialized state.
   */
  private async applyChange(
    change: NodeChange,
    storage: NodeStorageAdapter = this.storage
  ): Promise<void> {
    const { nodeId, schemaId } = change.payload

    // Get or create materialized state FIRST (required for foreign key constraint)
    let node = await storage.getNode(nodeId)

    if (!node) {
      // First change for this node - create it
      if (!schemaId) {
        throw new Error(`First change for node ${nodeId} must include schemaId`)
      }

      node = this.createInitialNodeFromChange(change, schemaId)

      // Persist the node record BEFORE appending change (FK constraint)
      await storage.setNode(node, { indexProperties: !this.nodeContentCipher })
    }

    // Now append to change log (node exists, FK constraint satisfied)
    await storage.appendChange(change)

    // Update Lamport time
    await storage.setLastLamportTime(this.clock.time)

    this.materializeNodeChange(change, node)

    // Persist
    await storage.setNode(node, { indexProperties: !this.nodeContentCipher })
  }

  private materializeNodeChange(change: NodeChange, node: NodeState): NodeState {
    const { nodeId, properties, deleted } = change.payload

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

    return node
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

  private async assertAuthorized(input: {
    subject: DID
    action: AuthAction
    nodeId: string
    node?: { schemaId: SchemaIRI; createdBy: DID; properties?: Record<string, unknown> }
    patch?: Record<string, unknown>
  }): Promise<void> {
    if (this.auth && isControlPlaneMutation(input.nodeId, input.node?.schemaId)) {
      const decision = await this.auth.can({
        action: input.action,
        nodeId: input.nodeId,
        patch: input.patch
      })
      if (!decision.allowed) {
        throw new PermissionError(decision)
      }
      return
    }

    if (!this.authEvaluator) {
      return
    }

    const decision = await this.authEvaluator.can(input)
    if (!decision.allowed) {
      throw new PermissionError(decision)
    }
  }

  private async canReadNode(node: NodeState | null): Promise<boolean> {
    if (!node || !this.authEvaluator) {
      return node !== null
    }

    const decision = await this.authEvaluator.can({
      subject: this.authorDID,
      action: 'read',
      nodeId: node.id,
      node: {
        schemaId: node.schemaId,
        createdBy: node.createdBy,
        properties: node.properties
      }
    })

    return decision.allowed
  }

  private async filterReadableNodes(nodes: NodeState[]): Promise<NodeState[]> {
    if (!this.authEvaluator) {
      return nodes
    }

    const decisions = await Promise.all(nodes.map((node) => this.canReadNode(node)))
    return nodes.filter((_, index) => decisions[index])
  }

  private applyListPagination(nodes: NodeState[], options?: ListNodesOptions): NodeState[] {
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? nodes.length
    return nodes.slice(offset, offset + limit)
  }

  private getQueryFallbackReason(): string {
    if (this.authEvaluator) {
      return 'read-authorization-filtered'
    }

    if (this.nodeContentCipher) {
      return 'encrypted-node-content'
    }

    return 'storage-query-unavailable'
  }

  private async assertAuthorizedBatch(operations: TransactionOperation[]): Promise<void> {
    if (!this.authEvaluator && !this.auth) {
      return
    }

    for (const operation of operations) {
      if (operation.type === 'create') {
        await this.assertAuthorized({
          subject: this.authorDID,
          action: 'write',
          nodeId: operation.options.id ?? '',
          node: {
            schemaId: operation.options.schemaId,
            createdBy: this.authorDID,
            properties: operation.options.properties
          }
        })
        continue
      }

      if (operation.type === 'delete') {
        await this.assertAuthorized({
          subject: this.authorDID,
          action: 'delete',
          nodeId: operation.nodeId
        })
        continue
      }

      await this.assertAuthorized({
        subject: this.authorDID,
        action: 'write',
        nodeId: operation.nodeId,
        patch: operation.type === 'update' ? operation.options.properties : undefined
      })
    }
  }

  private inferActionFromChange(change: NodeChange): AuthAction {
    if (change.payload.deleted === true) {
      return 'delete'
    }

    return 'write'
  }

  private shouldRecomputeRecipients(schemaId: SchemaIRI, patch: Record<string, unknown>): boolean {
    const authRelevant = this.authRelevantPropertyLookup?.(schemaId)
    if (!authRelevant || authRelevant.size === 0) {
      return false
    }

    return Object.keys(patch).some((propertyName) => authRelevant.has(propertyName))
  }

  private async persistEncryptedNodeSnapshot(
    node: NodeState | null,
    storage: NodeStorageAdapter = this.storage
  ): Promise<void> {
    if (!node || !this.nodeContentCipher) {
      return
    }

    const serialized = this.serializeNodeSnapshot(node)
    const cachedContentKey = this.contentKeyCache?.get(node.id)
    const encrypted = await this.nodeContentCipher.encrypt({
      nodeId: node.id,
      schemaId: node.schemaId,
      content: serialized,
      cachedContentKey
    })

    if (encrypted.contentKey) {
      this.contentKeyCache?.set(node.id, encrypted.contentKey)
    }

    const wrappedSnapshot: EncryptedNodeSnapshot = {
      marker: ENCRYPTED_NODE_MARKER,
      payload: bytesToBase64(encrypted.encryptedContent)
    }

    const encodedWrapper = new TextEncoder().encode(JSON.stringify(wrappedSnapshot))
    await storage.setDocumentContent(node.id, encodedWrapper)
  }

  private async decryptNodeSnapshotIfPresent(node: NodeState | null): Promise<NodeState | null> {
    if (!node || !this.nodeContentCipher) {
      return node
    }

    const encodedSnapshot = await this.storage.getDocumentContent(node.id)
    if (!encodedSnapshot) {
      return node
    }

    const wrappedSnapshot = this.parseEncryptedNodeSnapshot(encodedSnapshot)
    if (!wrappedSnapshot) {
      return node
    }

    const cachedContentKey = this.contentKeyCache?.get(node.id)
    const decrypted = await this.nodeContentCipher.decrypt({
      nodeId: node.id,
      schemaId: node.schemaId,
      encryptedContent: base64ToBytes(wrappedSnapshot.payload),
      cachedContentKey
    })

    if (decrypted.contentKey) {
      this.contentKeyCache?.set(node.id, decrypted.contentKey)
    }

    const snapshot = this.deserializeNodeSnapshot(decrypted.content)
    return {
      ...node,
      properties: snapshot.properties,
      _unknown: snapshot.unknown
    }
  }

  private serializeNodeSnapshot(node: NodeState): Uint8Array {
    const payload: SerializedNodeSnapshot = {
      properties: node.properties,
      unknown: node._unknown
    }
    return new TextEncoder().encode(JSON.stringify(payload))
  }

  private deserializeNodeSnapshot(bytes: Uint8Array): SerializedNodeSnapshot {
    let parsed: unknown
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    } catch (error) {
      throw new Error(
        `[NodeStore] Failed to parse decrypted node snapshot: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    if (!parsed || typeof parsed !== 'object' || !('properties' in parsed)) {
      throw new Error('[NodeStore] Decrypted node snapshot is invalid')
    }

    const record = parsed as { properties: unknown; unknown?: unknown }
    if (!record.properties || typeof record.properties !== 'object') {
      throw new Error('[NodeStore] Decrypted node snapshot is missing properties')
    }

    return {
      properties: record.properties as Record<string, unknown>,
      unknown:
        record.unknown && typeof record.unknown === 'object'
          ? (record.unknown as Record<string, unknown>)
          : undefined
    }
  }

  private parseEncryptedNodeSnapshot(bytes: Uint8Array): EncryptedNodeSnapshot | null {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as EncryptedNodeSnapshot
      if (parsed.marker !== ENCRYPTED_NODE_MARKER || typeof parsed.payload !== 'string') {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }
}

function isControlPlaneMutation(nodeId: string, schemaId?: SchemaIRI): boolean {
  return isSystemNamespaceResource(nodeId) || Boolean(schemaId && isSystemSchemaIri(schemaId))
}
