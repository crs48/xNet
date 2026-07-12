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
import {
  LWW_TIEBREAK_KEY_VERSION,
  compareChangeApplicationOrder,
  computeLwwTiebreakKey,
  lwwWins
} from '@xnetjs/core'
import {
  executeTransactionOperations,
  executeTransactionOperationsFast,
  type PendingTransactionEvent,
  type WriteExecutionHost
} from './transaction-executor'
import {
  executeDeterministicNodeImport,
  planDeterministicNodeImport,
  type DeterministicNodeImportAppliedPlan,
  type DeterministicNodeImportPlan
} from './batch-write-orchestrator'
import { base64ToBytes, bytesToBase64 } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'
import {
  createLamportClock,
  tick,
  receive,
  signChange,
  createUnsignedChange,
  createBatchId,
  type ChangeSigner,
  type LamportClock,
  type UnsignedChange
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
  private changeSigner?: ChangeSigner
  private clock: LamportClock
  private conflicts: MergeConflict[] = []
  private writeHost?: WriteExecutionHost
  private listeners: Set<NodeChangeListener> = new Set()
  private nodeListeners: Map<NodeId, Set<NodeChangeListener>> = new Map()
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
    this.changeSigner = options.changeSigner
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

    // Let storage authorize a materialized view's id list exactly once, at
    // refresh time, so cache hits can be served without per-row re-checks
    // (exploration 0226). Only meaningful when read authorization is active.
    if (this.authEvaluator && this.storage.setNodeReadAuthorizer) {
      this.storage.setNodeReadAuthorizer((nodes) => this.filterReadableNodes(nodes))
    }
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
      if (this.canUseSingleWriteFastPath()) {
        const { node, change } = await this.applySingleNodeWrite({
          nodeId: id,
          payload: {
            nodeId: id,
            schemaId: options.schemaId,
            properties: options.properties
          },
          authAction: 'write',
          requireExisting: false,
          createSchemaId: options.schemaId
        })

        this.emit(change, node, null, false)
        this.authEvaluator?.invalidate(node.id)

        if (this.telemetry) {
          this.telemetry.reportPerformance('data.create', Date.now() - start)
          this.telemetry.reportUsage('data.create', 1)
        }

        return node
      }

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
      const [newClock, ts] = tick(this.clock)
      this.clock = newClock
      const lamport = ts.time

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
      if (this.canUseSingleWriteFastPath()) {
        const { node, previousNode, change } = await this.applySingleNodeWrite({
          nodeId: id,
          payload: {
            nodeId: id,
            properties: options.properties
          },
          authAction: 'write',
          requireExisting: true
        })

        this.emit(change, node, previousNode, false)
        this.authEvaluator?.invalidate(node.id)

        if (this.shouldRecomputeRecipients(node.schemaId, options.properties)) {
          await this.onRecipientsMayNeedRecompute?.({
            nodeId: id,
            schemaId: node.schemaId,
            changedProperties: Object.keys(options.properties)
          })
        }

        if (this.telemetry) {
          this.telemetry.reportPerformance('data.update', Date.now() - start)
          this.telemetry.reportUsage('data.update', 1)
        }

        return node
      }

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
      const [newClock, ts] = tick(this.clock)
      this.clock = newClock
      const lamport = ts.time

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
      if (this.canUseSingleWriteFastPath()) {
        const { node, previousNode, change } = await this.applySingleNodeWrite({
          nodeId: id,
          payload: {
            nodeId: id,
            properties: {},
            deleted: true
          },
          authAction: 'delete',
          requireExisting: true
        })

        this.contentKeyCache?.delete(id)
        this.emit(change, node, previousNode, false)
        this.authEvaluator?.invalidate(id)

        if (this.telemetry) {
          this.telemetry.reportPerformance('data.delete', Date.now() - start)
          this.telemetry.reportUsage('data.delete', 1)
        }

        return
      }

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
      const [newClock, ts] = tick(this.clock)
      this.clock = newClock
      const lamport = ts.time

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
    if (this.canUseSingleWriteFastPath()) {
      const { node, previousNode, change } = await this.applySingleNodeWrite({
        nodeId: id,
        payload: {
          nodeId: id,
          properties: {},
          deleted: false
        },
        authAction: 'write',
        requireExisting: true
      })

      this.emit(change, node, previousNode, false)
      this.authEvaluator?.invalidate(node.id)

      return node
    }

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
    const [newClock, ts] = tick(this.clock)
    this.clock = newClock
    const lamport = ts.time

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

      // Authorized materialized views (exploration 0226): a materialized view
      // can coexist with read authorization when storage authorizes the id
      // list once at refresh time and we fingerprint the authorization state.
      // We stamp the viewer's auth fingerprint onto the descriptor; storage
      // serves a cache hit only when it still matches, otherwise it
      // re-materializes through the injected authorizer. The persisted id list
      // therefore only ever holds rows this viewer may read.
      if (
        this.storage.queryNodes &&
        !this.nodeContentCipher &&
        this.authEvaluator &&
        !descriptor.nodeId &&
        descriptor.materializedView !== undefined &&
        this.materializedAuthSupported()
      ) {
        const authFingerprint = await this.authFingerprint()
        const result = await this.storage.queryNodes({ ...descriptor, authFingerprint })
        return {
          nodes: result.nodes,
          totalCount: result.totalCount,
          plan: {
            ...result.plan,
            durationMs: Date.now() - start
          }
        }
      }

      // Authorization-scoped reads: authorization is a pure post-filter that
      // only ever REMOVES rows, so we can still push `where`/`orderBy`/
      // `search`/`spatial` down to indexed storage to shrink the candidate
      // set from O(schema) to O(predicate-matching), then authorize and
      // paginate the (smaller) result in JS. Pagination itself cannot be
      // pushed down because rows the viewer cannot read must be removed
      // before the window is applied. Re-applying the descriptor in JS also
      // acts as the parity guard for the compiled SQL predicate.
      if (
        this.storage.queryNodes &&
        !this.nodeContentCipher &&
        this.authEvaluator &&
        !descriptor.nodeId &&
        descriptor.materializedView === undefined
      ) {
        const candidates = await this.storage.queryNodes(withoutNodeQueryPagination(descriptor))
        const readable = await this.filterReadableNodes(candidates.nodes)
        const result = applyNodeQueryDescriptor(readable, descriptor)
        return {
          nodes: result,
          totalCount: readable.length,
          plan: {
            // Report only post-authorization counts and never the compiled
            // SQL/params, so the surfaced plan cannot reveal how many rows the
            // viewer is not allowed to see.
            strategy: 'auth-pushdown-candidates',
            candidateNodeCount: readable.length,
            hydratedNodeCount: readable.length,
            returnedNodeCount: result.length,
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
      // When pagination was pushed to storage, `readable` holds only the window,
      // so an in-memory count would report the page size, not the true total —
      // leave it undefined (the bridge derives a cheap value). Only count the
      // in-memory candidate set when it actually holds every matching row
      // (no storage-side pagination). `fallback.totalCount` is the exact total
      // when `count: 'exact'` was requested (exploration 0184).
      const totalCount =
        fallback.totalCount ??
        (fallback.paginatedInStorage
          ? undefined
          : applyNodeQueryDescriptor(
              readable,
              withoutNodeQueryPagination(fallback.postFilterDescriptor)
            ).length)

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
    /** True when storage already applied the limit/offset window. */
    paginatedInStorage: boolean
  }> {
    if (descriptor.nodeId) {
      const node = await this.storage.getNode(descriptor.nodeId)
      return {
        nodes: node ? [node] : [],
        postFilterDescriptor: descriptor,
        paginatedInStorage: false
      }
    }

    const canPushSystemList = this.canPushSystemListQuery(descriptor)
    const canPushPagination =
      canPushSystemList && !this.authEvaluator && descriptor.after === undefined
    const hasPagination =
      descriptor.limit !== undefined ||
      (descriptor.offset ?? 0) > 0 ||
      descriptor.after !== undefined
    // Only pay the extra `COUNT(*)` when an exact total was explicitly
    // requested (exploration 0184). Otherwise leave it undefined so the bridge
    // derives a cheap count / overfetch-based `hasMore`.
    const totalCount =
      canPushPagination && hasPagination && descriptor.count === 'exact'
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
        canPushPagination && hasPagination ? withoutNodeQueryPagination(descriptor) : descriptor,
      paginatedInStorage: canPushPagination && hasPagination
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
    const [newClock, ts] = tick(this.clock)
    this.clock = newClock
    const lamport = ts.time

    try {
      const result = await this.runTransactionOperationsBatch({
        operations: resolvedOps,
        lamport,
        now,
        batchId,
        batchSize
      })

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
   * Execute a batch of transaction operations atomically: the preflight +
   * applyNodeBatch fast path when storage supports it, otherwise the
   * legacy per-operation path inside a storage transaction.
   */
  private async runTransactionOperationsBatch(input: {
    operations: TransactionOperation[]
    lamport: number
    now: number
    batchId: string
    batchSize: number
  }): Promise<{
    results: (NodeState | null)[]
    changes: NodeChange[]
    events: PendingTransactionEvent[]
  }> {
    if (this.canUseSingleWriteFastPath()) {
      return this.executeTransactionOperationsFast(input)
    }

    const run = (storage: NodeStorageAdapter) =>
      this.executeTransactionOperations({ ...input, storage })
    return this.storage.withTransaction ? this.storage.withTransaction(run) : run(this.storage)
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
    const [newClock, ts] = tick(this.clock)
    this.clock = newClock
    const lamport = ts.time

    try {
      const applyStartedAt = Date.now()
      const result = await this.runTransactionOperationsBatch({
        operations: resolvedOps,
        lamport,
        now,
        batchId,
        batchSize
      })
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

    const [newClock, ts] = tick(this.clock)
    this.clock = newClock
    const lamport = ts.time

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
    lamport: number
    now: number
    batchId: string
    batchSize: number
  }): Promise<DeterministicNodeImportPlan> {
    return planDeterministicNodeImport(this.writeExecutionHost(), input)
  }

  private async executeDeterministicNodeImport(input: {
    drafts: readonly DeterministicNodeImportDraft[]
    storage: NodeStorageAdapter
    lamport: number
    now: number
    batchId: string
    batchSize: number
    deferIndexes: boolean
  }): Promise<DeterministicNodeImportAppliedPlan> {
    return executeDeterministicNodeImport(this.writeExecutionHost(), input)
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

  /**
   * Refresh query-planner statistics (ANALYZE). Call after a bulk import so the
   * first post-import reads use indexes instead of full scans (exploration
   * 0184). No-op when the storage backend doesn't support it.
   */
  async analyze(): Promise<void> {
    await this.storage.analyze?.()
  }

  /**
   * Incremental planner maintenance (`PRAGMA optimize`). Cheap; intended for an
   * idle tick after first paint and before close.
   */
  async optimize(): Promise<void> {
    await this.storage.optimize?.()
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
    lamport: number
    now: number
    batchId: string
    batchSize: number
  }): Promise<{
    results: (NodeState | null)[]
    changes: NodeChange[]
    events: PendingTransactionEvent[]
  }> {
    return executeTransactionOperations(this.writeExecutionHost(), input)
  }

  /**
   * Transaction fast path — see `transaction-executor.ts` (0263/0264/0276).
   */
  private async executeTransactionOperationsFast(input: {
    operations: TransactionOperation[]
    lamport: number
    now: number
    batchId: string
    batchSize: number
  }): Promise<{
    results: (NodeState | null)[]
    changes: NodeChange[]
    events: PendingTransactionEvent[]
  }> {
    return executeTransactionOperationsFast(this.writeExecutionHost(), input)
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

      // Idempotent redelivery (exploration 0296): a change already in the log
      // was already materialized — hub backfills and relay echoes must not
      // re-apply it (or re-log conflicts). Still advance the clock so a
      // replayed high lamport can't regress causality.
      const alreadyApplied = this.storage.hasChange
        ? await this.storage.hasChange(change.hash)
        : (await this.storage.getChangeByHash(change.hash)) !== null
      if (alreadyApplied) {
        this.clock = receive(this.clock, change.lamport)
        return
      }

      // Update our clock to be at least as recent as the remote
      this.clock = receive(this.clock, change.lamport)
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
    // Sort by Lamport timestamp for causal ordering (the shared protocol
    // application order — code-unit author tiebreak, never localeCompare).
    const sorted = [...changes].sort((a, b) =>
      compareChangeApplicationOrder(
        { lamport: a.lamport, author: a.authorDID },
        { lamport: b.lamport, author: b.authorDID }
      )
    )

    for (const change of sorted) {
      try {
        await this.applyRemoteChange(change)
      } catch (err) {
        // A single un-appliable remote change (e.g. a first change missing its
        // schemaId) must not abort the whole batch — skip it and keep applying
        // the rest so sync still converges (exploration 0206).
        console.warn(
          `[NodeStore] skipping un-appliable remote change for node ${change.payload?.nodeId}:`,
          err instanceof Error ? err.message : err
        )
      }
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
   * Per-room sync cursor (confirmed high-water mark). Returns 0 when the
   * storage adapter doesn't persist cursors (degrades to replay-from-0).
   */
  async getSyncCursor(room: string): Promise<number> {
    return (await this.storage.getSyncCursor?.(room)) ?? 0
  }

  /** Persist the per-room confirmed sync cursor (monotonic in the adapter). */
  async setSyncCursor(room: string, lamport: number): Promise<void> {
    await this.storage.setSyncCursor?.(room, lamport)
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
   * Subscribe to change events for a single node.
   *
   * Dispatch is O(listeners-for-that-node) instead of O(all-listeners):
   * per-cell/per-row UI hooks should prefer this over filtering the global
   * feed, where every change event invokes every mounted callback.
   */
  subscribeToNode(nodeId: NodeId, listener: NodeChangeListener): () => void {
    const existing = this.nodeListeners.get(nodeId)
    if (existing) {
      existing.add(listener)
    } else {
      this.nodeListeners.set(nodeId, new Set([listener]))
    }

    return () => {
      const listeners = this.nodeListeners.get(nodeId)
      if (!listeners) return
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.nodeListeners.delete(nodeId)
      }
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

    const nodeListeners = this.nodeListeners.get(change.payload.nodeId)
    if (nodeListeners) {
      for (const listener of nodeListeners) {
        try {
          listener(event)
        } catch (err) {
          console.error('Error in NodeStore node listener:', err)
        }
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
    lamport: number,
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

    return this.signNodeChange(unsigned)
  }

  private signNodeChange(unsigned: UnsignedChange<NodePayload>): Promise<NodeChange> {
    if (this.changeSigner) {
      return this.changeSigner(unsigned)
    }
    return Promise.resolve(signChange(unsigned, this.signingKey))
  }

  /**
   * Create a signed change with batch metadata.
   * Used for transaction support - all changes in a batch share the same
   * batchId, Lamport timestamp, and wallTime.
   */
  private async createBatchedChange(
    type: string,
    payload: NodePayload,
    lamport: number,
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
    lamport: number,
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

    return this.signNodeChange(unsigned)
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
   * Whether singular writes can use the two-round-trip fast path
   * (preflight + transactional applyNodeBatch). Content ciphers need the
   * legacy per-step path for encrypted snapshot persistence.
   */
  private canUseSingleWriteFastPath(): boolean {
    return Boolean(this.storage.applyNodeBatch) && !this.nodeContentCipher
  }

  /**
   * Singular write fast path: one preflight round trip (existing node +
   * parent change), in-memory materialization and signing, then one
   * transactional applyNodeBatch round trip. Replaces the legacy
   * seven-round-trip getNode/getLastChange/getNode/appendChange/
   * setLastLamportTime/setNode/getNode sequence.
   */
  private async applySingleNodeWrite(input: {
    nodeId: NodeId
    payload: NodePayload
    authAction: AuthAction
    requireExisting: boolean
    createSchemaId?: SchemaIRI
  }): Promise<{ node: NodeState; previousNode: NodeState | null; change: NodeChange }> {
    const preflight = await this.getBatchPreflight([input.nodeId], this.storage)
    const existing = this.cloneNodeState(preflight.nodesById.get(input.nodeId) ?? null)

    if (!existing && input.requireExisting) {
      throw new Error(`Node not found: ${input.nodeId}`)
    }

    const schemaId = existing?.schemaId ?? input.createSchemaId
    if (!schemaId) {
      throw new Error(`First change for node ${input.nodeId} must include schemaId`)
    }

    await this.assertAuthorized({
      subject: this.authorDID,
      action: input.authAction,
      nodeId: input.nodeId,
      patch: input.payload.properties,
      node: existing
        ? {
            schemaId: existing.schemaId,
            createdBy: existing.createdBy,
            properties: existing.properties
          }
        : {
            schemaId,
            createdBy: this.authorDID,
            properties: input.payload.properties
          }
    })

    const now = Date.now()
    const previousClock = this.clock
    const [newClock, ts] = tick(this.clock)
    this.clock = newClock
    const lamport = ts.time

    try {
      const parentHash = preflight.lastChangesByNodeId.get(input.nodeId)?.hash ?? null
      const unsigned = createUnsignedChange({
        id: createNodeId(),
        type: 'node-change',
        payload: input.payload,
        parentHash,
        authorDID: this.authorDID,
        lamport,
        wallTime: now
      })
      const change = await this.signNodeChange(unsigned)
      const node = this.materializeNodeChange(
        change,
        existing ?? this.createInitialNodeFromChange(change, schemaId)
      )

      await this.storage.applyNodeBatch!({
        batchId: createBatchId(),
        nodes: [node],
        changes: [change],
        lastLamportTime: this.clock.time,
        affectedSchemaIds: [schemaId],
        indexMode: 'touched',
        indexProperties: true
      })

      return { node, previousNode: existing, change }
    } catch (err) {
      this.clock = previousClock
      throw err
    }
  }

  /**
   * Apply a change to storage and update materialized state.
   */
  /**
   * The narrow capability set the write orchestration modules
   * (transaction-executor.ts, batch-write-orchestrator.ts) run on — one seam
   * for every write strategy (exploration 0276).
   */
  private writeExecutionHost(): WriteExecutionHost {
    this.writeHost ??= {
      storage: this.storage,
      clockTime: () => this.clock.time,
      cloneNodeState: (node) => this.cloneNodeState(node),
      cloneNodeMap: (nodesById) => this.cloneNodeMap(nodesById),
      getBatchPreflight: (ids, storage) => this.getBatchPreflight(ids, storage),
      createBatchedChange: (
        type,
        payload,
        lamport,
        wallTime,
        batchId,
        batchIndex,
        batchSize,
        storage
      ) =>
        this.createBatchedChange(
          type,
          payload,
          lamport,
          wallTime,
          batchId,
          batchIndex,
          batchSize,
          storage
        ),
      createBatchedChangeWithParentHash: (
        type,
        payload,
        parentHash,
        lamport,
        wallTime,
        batchId,
        batchIndex,
        batchSize
      ) =>
        this.createBatchedChangeWithParentHash(
          type,
          payload,
          parentHash,
          lamport,
          wallTime,
          batchId,
          batchIndex,
          batchSize
        ),
      applyChange: (change, storage) => this.applyChange(change, storage),
      materializeNodeChange: (change, currentNode) =>
        this.materializeNodeChange(change, currentNode),
      createInitialNodeFromChange: (change, schemaId) =>
        this.createInitialNodeFromChange(change, schemaId),
      persistEncryptedNodeSnapshot: (node, storage) =>
        this.persistEncryptedNodeSnapshot(node, storage),
      importMaterializedNodes: (storage, nodes, options) =>
        this.importMaterializedNodes(storage, nodes, options),
      appendImportedChanges: (storage, changes) => this.appendImportedChanges(storage, changes)
    }
    return this.writeHost
  }

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

    const materialized = this.materializeNodeChange(change, node)

    // Persist
    await storage.setNode(materialized, { indexProperties: !this.nodeContentCipher })
  }

  private materializeNodeChange(change: NodeChange, currentNode: NodeState): NodeState {
    // Copy-on-write: never mutate the incoming snapshot. Storage adapters
    // (memory) and bridge caches hand out NodeState references, and the
    // reactive layer relies on "same reference = same observable state".
    const node = structuredClone(currentNode)
    const { properties, deleted } = change.payload

    // Get known property names from schema (if available)
    const knownProps = this.propertyLookup?.(node.schemaId)

    // Apply property changes with LWW
    for (const [key, value] of Object.entries(properties)) {
      this.applyPropertyChangeWithLWW({
        node,
        change,
        key,
        value,
        // Check if this is an unknown property (not in schema)
        isUnknownProperty: knownProps !== undefined && !knownProps.has(key)
      })
    }

    // Handle deleted flag
    if (deleted !== undefined) {
      const deletedTs: PropertyTimestamp = {
        lamport: change.lamport,
        author: change.authorDID,
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
   * Apply one property from a change to a node with LWW conflict
   * resolution, recording any conflict against the existing timestamp.
   * Mutates `node` in place (callers own a fresh clone).
   */
  private applyPropertyChangeWithLWW(input: {
    node: NodeState
    change: NodeChange
    key: string
    value: unknown
    isUnknownProperty: boolean
  }): void {
    const { node, change, key, value, isUnknownProperty } = input
    const existingTs = node.timestamps[key]
    const newTs: PropertyTimestamp = {
      lamport: change.lamport,
      author: change.authorDID,
      wallTime: change.wallTime,
      // Grinding-resistant final tiebreak (exploration 0305): only v4+ changes
      // carry a key, so a v4-vs-legacy comparison degrades to the author DID
      // and mixed fleets still agree.
      ...((change.protocolVersion ?? 0) >= LWW_TIEBREAK_KEY_VERSION
        ? { tiebreakKey: computeLwwTiebreakKey(change.authorDID, key, value) }
        : {})
    }
    const incomingWins = !existingTs || this.shouldReplace(existingTs, newTs)
    const target = isUnknownProperty ? (node._unknown ??= {}) : node.properties
    const previousValue = target[key]

    if (incomingWins) {
      // New value wins: write into properties, or _unknown for forward
      // compatibility when the schema does not know the property.
      if (value === undefined) {
        delete target[key]
      } else {
        target[key] = value
      }
      node.timestamps[key] = newTs
    }

    // Record only genuine cross-author divergence (exploration 0296).
    // Same-author comparisons are never conflicts: identical stamps are
    // idempotent replays, and an older own write losing to a newer own value
    // is causal history. Equal values aren't divergence regardless of author.
    if (!existingTs || existingTs.author === newTs.author) return
    if (Object.is(previousValue, value)) return

    this.conflicts.push({
      nodeId: change.payload.nodeId,
      key,
      localValue: previousValue,
      localTimestamp: existingTs,
      remoteValue: value,
      remoteTimestamp: newTs,
      resolved: incomingWins ? 'remote' : 'local',
      // A losing cross-author write is a true conflict; a winning one is an
      // informational lost-update record.
      kind: incomingWins ? 'lww-resolution' : 'conflict'
    })
    this.trimConflicts()
  }

  /**
   * Determine if newTs should replace existingTs (LWW). Delegates to the ONE
   * protocol ordering in `@xnetjs/core` (§L1.7; exploration 0276).
   */
  private shouldReplace(existing: PropertyTimestamp, incoming: PropertyTimestamp): boolean {
    return lwwWins(incoming, existing)
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

  /**
   * Whether storage can safely materialize a view under read authorization
   * (exploration 0226): it must both accept the read authorizer (to authorize
   * the id list at refresh) and expose a reload-stable authorization-state
   * version (to fingerprint cache validity). When either is missing the store
   * falls back to the authorize-then-paginate path, which never caches.
   */
  private materializedAuthSupported(): boolean {
    return Boolean(this.storage.setNodeReadAuthorizer && this.storage.getAuthorizationStateVersion)
  }

  /**
   * A reload-stable fingerprint of the viewer's authorization context, folded
   * from the subject DID and the control-plane (grant) state version. Stamped
   * onto a materialized view so any grant change forces an `'authz-changed'`
   * refresh — the cache can never serve rows a revoked viewer may no longer
   * read. Returns `undefined` when authorization is off (materialized views run
   * untouched, as in the trusted single-user case).
   */
  private async authFingerprint(): Promise<string | undefined> {
    if (!this.authEvaluator || !this.storage.getAuthorizationStateVersion) {
      return undefined
    }

    const version = await this.storage.getAuthorizationStateVersion()
    return `v1:${this.authorDID}:${version.count}:${version.maxUpdatedAt}`
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
