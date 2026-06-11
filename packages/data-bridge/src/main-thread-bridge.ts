/**
 * MainThreadBridge - Direct NodeStore access implementation
 *
 * Phase 0 implementation that wraps NodeStore directly.
 * Provides the DataBridge interface while keeping current behavior.
 *
 * This is the fallback implementation used when:
 * - Web Workers are not available
 * - During Phase 0 transition period
 * - For testing/development
 */

import type {
  RemoteNodeQueryInvalidation,
  RemoteNodeQueryInvalidationSubscription,
  RemoteNodeQueryClient,
  RemoteNodeQueryStreamSubscription
} from './remote-query-protocol'
import type {
  DataBridge,
  QueryDescriptor,
  QueryMetadata,
  QuerySubscription,
  QueryOptions,
  SyncStatus,
  AcquiredDoc,
  DataBridgeConfig,
  NodeQueryRouterThresholds
} from './types'
import type {
  NodeStore,
  NodeState,
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeChangeEvent,
  NodeBatchChangeEvent,
  ListNodesOptions,
  SchemaIRI,
  NodeBatchWriteInput,
  NodeBatchWriteResult
} from '@xnetjs/data'
import type { Awareness } from 'y-protocols/awareness'
import type { Doc as YDoc } from 'yjs'
import { QueryCache } from './query-cache'
import {
  applyNodeChangeToBoundedQueryResult,
  applyNodeChangeToQueryResult,
  createBoundedWorkingSet,
  createBoundedWorkingSetDescriptor,
  createQueryDescriptor,
  queryDescriptorSupportsBoundedDelta,
  reuseEquivalentNodeReferences,
  serializeQueryDescriptor,
  type BoundedQueryWorkingSet,
  type QueryResultDelta
} from './query-descriptor'
import {
  createQueryErrorMetadata,
  createQueryMetadata,
  createQuerySnapshotMetadata
} from './query-metadata'
import {
  createQueryStreamState,
  reduceQueryStreamEvent,
  type QueryStreamEvent,
  type QueryStreamState
} from './query-stream'
import {
  createRemoteFallbackMetadata,
  createRemoteSuccessMetadata,
  createRemoteVerificationError,
  createQueryRoutingMetadata,
  filterRemoteNodesByVerification,
  getRemoteQueryMode,
  getRemoteQuerySource,
  isRemoteVerificationFailed,
  mergeRemoteNodeSnapshots,
  routeRemoteNodeQuery,
  type RemoteNodeQueryRouteDecision,
  shouldRunRemoteQuery,
  shouldUseRemoteOnlyQuery,
  withRemoteErrorVerificationMetadata
} from './remote-query-execution'
import {
  createRemoteNodeQueryRequest,
  isRemoteNodeQueryError,
  isRemoteNodeQuerySuccess
} from './remote-query-protocol'

// Above this many events in one flush (or one storage batch), invalidation
// stops applying per-node deltas and falls back to re-querying each affected
// cache entry once. Delta application is pure in-memory work, so the
// threshold is sized so that only genuinely bulk flows (imports, migrations)
// pay for re-queries.
const BULK_STORE_CHANGE_RELOAD_THRESHOLD = 250

// ─── SyncManager Interface ───────────────────────────────────────────────────

/**
 * Minimal SyncManager interface for Y.Doc acquisition.
 * This avoids a direct dependency on @xnetjs/react's full SyncManager type.
 */
export interface SyncManagerLike {
  acquire(nodeId: string): Promise<YDoc>
  release(nodeId: string): void
  getAwareness(nodeId: string): Awareness | null
}

export interface MainThreadBridgeOptions {
  remoteNodeQueryClient?: RemoteNodeQueryClient
  remoteNodeQueryRouting?: Partial<NodeQueryRouterThresholds>
}

type RemoteStreamRuntime = {
  state: QueryStreamState
  unsubscribe: (() => void) | null
  cancelled: boolean
  start: Promise<void>
}

type RemoteInvalidationRuntime = {
  unsubscribe: (() => void) | null
  cancelled: boolean
  start: Promise<void>
}

// ─── MainThreadBridge Class ──────────────────────────────────────────────────

/**
 * DataBridge implementation that accesses NodeStore directly on the main thread.
 *
 * This is the Phase 0 implementation that maintains current behavior while
 * providing the DataBridge abstraction. Later phases will move operations
 * off the main thread via Web Workers or IPC.
 */
export class MainThreadBridge implements DataBridge {
  private store: NodeStore
  private cache: QueryCache
  private statusListeners = new Set<(status: SyncStatus) => void>()
  private storeUnsubscribe: (() => void) | null = null
  private storeBatchUnsubscribe: (() => void) | null = null
  private _syncManager: SyncManagerLike | null = null
  private remoteNodeQueryClient: RemoteNodeQueryClient | null
  private remoteNodeQueryRouting: Partial<NodeQueryRouterThresholds> | undefined
  private remoteLoads = new Map<string, Promise<void>>()
  private remoteStreams = new Map<string, RemoteStreamRuntime>()
  private remoteInvalidations: RemoteInvalidationRuntime | null = null
  private pendingStoreChanges: NodeChangeEvent[] = []
  private storeChangeFlushQueued = false

  constructor(store: NodeStore, options?: MainThreadBridgeOptions) {
    this.store = store
    this.cache = new QueryCache()
    this.remoteNodeQueryClient = options?.remoteNodeQueryClient ?? null
    this.remoteNodeQueryRouting = options?.remoteNodeQueryRouting

    // Subscribe to store changes for cache invalidation
    this.storeUnsubscribe = this.store.subscribe((event) => {
      this.enqueueStoreChange(event)
    })
    this.storeBatchUnsubscribe = this.store.subscribeToBatchChanges((event) => {
      this.handleStoreBatchChange(event)
    })
    this.startRemoteInvalidationSubscription()
  }

  /**
   * Set the SyncManager for Y.Doc acquisition.
   * This is called by XNetProvider after the SyncManager is created.
   */
  setSyncManager(syncManager: SyncManagerLike | null): void {
    this._syncManager = syncManager
  }

  // ─── Queries ────────────────────────────────────────────

  query<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    options?: QueryOptions<P>
  ): QuerySubscription<P> {
    const descriptor = createQueryDescriptor(schema._schemaId, options)
    const queryId = serializeQueryDescriptor(descriptor)

    // Initialize cache entry if not exists
    this.cache.initEntry(queryId, descriptor)

    // Start loading data if not cached
    if (this.cache.get(queryId) === null) {
      void this.loadInitialQuery(queryId, descriptor)
    }

    return {
      getSnapshot: () => this.cache.get(queryId),
      getMetadata: () => this.cache.getMetadata(queryId),
      subscribe: (callback) => this.subscribeToQuery(queryId, descriptor, callback)
    }
  }

  private subscribeToQuery(
    queryId: string,
    descriptor: QueryDescriptor,
    callback: () => void
  ): () => void {
    const unsubscribe = this.cache.subscribe(queryId, callback)
    this.startRemoteQueryStream(queryId, descriptor)

    return () => {
      unsubscribe()
      if (this.cache.getSubscriberCount(queryId) === 0) {
        this.stopRemoteQueryStream(queryId)
      }
    }
  }

  async reloadQuery(descriptor: QueryDescriptor): Promise<void> {
    await this.loadInitialQuery(serializeQueryDescriptor(descriptor), descriptor)
  }

  /**
   * Load query data according to the descriptor's local/remote execution mode.
   */
  private async loadInitialQuery(queryId: string, descriptor: QueryDescriptor): Promise<void> {
    if (shouldUseRemoteOnlyQuery(descriptor)) {
      await this.loadRemoteQuery(queryId, descriptor)
      return
    }

    const result = await this.loadLocalQuery(queryId, descriptor)
    const route = routeRemoteNodeQuery({
      descriptor,
      hasRemoteClient: this.remoteNodeQueryClient !== null,
      localRowCount: this.getQueryRouteRowCount(result),
      thresholds: this.remoteNodeQueryRouting
    })

    if (route.shouldRunRemote) {
      await this.loadRemoteQuery(queryId, descriptor, route)
    }
  }

  private getQueryRouteRowCount(
    result: Awaited<ReturnType<NodeStore['query']>> | null
  ): number | undefined {
    return result?.totalCount ?? result?.plan.candidateNodeCount ?? result?.nodes.length
  }

  /**
   * Load query data from the local store and update cache.
   */
  private async loadLocalQuery(
    queryId: string,
    descriptor: QueryDescriptor
  ): Promise<Awaited<ReturnType<NodeStore['query']>> | null> {
    try {
      // Bounded queries overfetch a small buffer so later node changes can
      // be applied in memory instead of re-executing the query.
      const useBoundedWorkingSet = queryDescriptorSupportsBoundedDelta(descriptor)
      const result = await this.store.query(
        useBoundedWorkingSet ? createBoundedWorkingSetDescriptor(descriptor) : descriptor
      )
      this.debugQueryPlan(queryId, result.plan)
      // Re-queries produce brand-new NodeState objects even for unchanged
      // rows. Graft the previous references back in wherever the snapshots
      // are equivalent so downstream identity-based caches keep working.
      const previousWorkingSet = this.cache.getWorkingSet(queryId)
      const mergedNodes = reuseEquivalentNodeReferences(result.nodes, [
        ...(previousWorkingSet?.nodes ?? []),
        ...(this.cache.get(queryId) ?? [])
      ])
      const visibleNodes = useBoundedWorkingSet
        ? mergedNodes.slice(0, descriptor.limit)
        : mergedNodes
      const visibleResult = { ...result, nodes: visibleNodes }
      this.cache.set(
        queryId,
        visibleNodes,
        descriptor,
        undefined,
        {
          ...createQueryMetadata({ descriptor, result: visibleResult, source: 'local' }),
          source: 'local'
        },
        useBoundedWorkingSet ? createBoundedWorkingSet(descriptor, mergedNodes) : undefined
      )
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[MainThreadBridge] Failed to load query:', error)
      // Set empty array on error so we don't keep retrying
      this.cache.set(
        queryId,
        [],
        descriptor,
        undefined,
        createQueryErrorMetadata({ descriptor, source: 'local', error })
      )
      return null
    }
  }

  /**
   * Load query data from the configured remote query client.
   */
  private async loadRemoteQuery(
    queryId: string,
    descriptor: QueryDescriptor,
    route?: RemoteNodeQueryRouteDecision
  ): Promise<void> {
    if (!route?.shouldRunRemote && !shouldRunRemoteQuery(descriptor)) return
    if (!this.remoteNodeQueryClient) {
      this.handleRemoteQueryError(queryId, descriptor, new Error('Remote query client unavailable'))
      return
    }

    const existingLoad = this.remoteLoads.get(queryId)
    if (existingLoad) {
      await existingLoad
      return
    }

    const load = this.executeRemoteQuery(queryId, descriptor, route).finally(() => {
      this.remoteLoads.delete(queryId)
    })
    this.remoteLoads.set(queryId, load)
    await load
  }

  private shouldUseRemoteStream(descriptor: QueryDescriptor): boolean {
    const mode = getRemoteQueryMode(descriptor)
    return descriptor.source !== 'local' && (mode === 'live' || mode === 'stream')
  }

  private startRemoteQueryStream(queryId: string, descriptor: QueryDescriptor): void {
    if (!this.shouldUseRemoteStream(descriptor)) return
    if (this.remoteStreams.has(queryId)) return

    if (!this.remoteNodeQueryClient) {
      this.handleRemoteQueryError(queryId, descriptor, new Error('Remote query client unavailable'))
      return
    }

    if (!this.remoteNodeQueryClient.stream) {
      void this.loadRemoteQuery(queryId, descriptor)
      return
    }

    const localSnapshot = this.cache.get(queryId)
    const runtime: RemoteStreamRuntime = {
      state: createQueryStreamState({
        data: localSnapshot,
        metadata: this.cache.getMetadata(queryId),
        status: localSnapshot === null ? 'loading' : 'ready'
      }),
      unsubscribe: null,
      cancelled: false,
      start: Promise.resolve()
    }
    const mode = getRemoteQueryMode(descriptor)
    if (!mode) return

    this.remoteStreams.set(queryId, runtime)

    const request = createRemoteNodeQueryRequest({
      requestId: queryId,
      descriptor,
      mode,
      source: getRemoteQuerySource(descriptor),
      client: {
        knownNodeIds: localSnapshot?.map((node) => node.id) ?? []
      }
    })

    runtime.start = Promise.resolve(
      this.remoteNodeQueryClient.stream(request, {
        next: (event) => {
          if (this.remoteStreams.get(queryId) !== runtime || runtime.cancelled) return
          this.applyRemoteStreamEvent(queryId, descriptor, event)
        },
        error: (error) => {
          if (this.remoteStreams.get(queryId) !== runtime || runtime.cancelled) return
          this.applyRemoteStreamEvent(queryId, descriptor, {
            type: 'error',
            error: error.message
          })
          this.stopRemoteQueryStream(queryId)
        },
        complete: () => {
          if (this.remoteStreams.get(queryId) !== runtime || runtime.cancelled) return
          this.applyRemoteStreamEvent(queryId, descriptor, {
            type: 'progress',
            progress: { phase: 'complete' }
          })
          this.stopRemoteQueryStream(queryId)
        }
      })
    )
      .then((subscription) => {
        const unsubscribe = this.normalizeRemoteStreamSubscription(subscription)
        if (runtime.cancelled) {
          unsubscribe?.()
          return
        }
        runtime.unsubscribe = unsubscribe
      })
      .catch((err) => {
        if (runtime.cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        this.handleRemoteQueryError(queryId, descriptor, error)
        this.remoteStreams.delete(queryId)
      })
  }

  private stopRemoteQueryStream(queryId: string): void {
    const runtime = this.remoteStreams.get(queryId)
    if (!runtime) return

    runtime.cancelled = true
    this.remoteStreams.delete(queryId)
    runtime.unsubscribe?.()
  }

  private normalizeRemoteStreamSubscription(
    subscription: RemoteNodeQueryStreamSubscription
  ): (() => void) | null {
    return this.normalizeRemoteSubscription(subscription)
  }

  private normalizeRemoteInvalidationSubscription(
    subscription: RemoteNodeQueryInvalidationSubscription
  ): (() => void) | null {
    return this.normalizeRemoteSubscription(subscription)
  }

  private normalizeRemoteSubscription(
    subscription: RemoteNodeQueryStreamSubscription | RemoteNodeQueryInvalidationSubscription
  ): (() => void) | null {
    if (!subscription) return null
    if (typeof subscription === 'function') return subscription
    return () => {
      subscription.unsubscribe()
    }
  }

  private startRemoteInvalidationSubscription(): void {
    if (this.remoteInvalidations) return
    if (!this.remoteNodeQueryClient?.subscribeInvalidations) return

    const runtime: RemoteInvalidationRuntime = {
      unsubscribe: null,
      cancelled: false,
      start: Promise.resolve()
    }
    this.remoteInvalidations = runtime

    runtime.start = Promise.resolve(
      this.remoteNodeQueryClient.subscribeInvalidations({
        next: (event) => {
          if (this.remoteInvalidations !== runtime || runtime.cancelled) return
          this.handleRemoteQueryInvalidation(event)
        },
        error: (error) => {
          if (this.remoteInvalidations !== runtime || runtime.cancelled) return
          console.error('[MainThreadBridge] Remote query invalidation subscription failed:', error)
          this.stopRemoteInvalidationSubscription()
        },
        complete: () => {
          if (this.remoteInvalidations !== runtime || runtime.cancelled) return
          this.stopRemoteInvalidationSubscription()
        }
      })
    )
      .then((subscription) => {
        const unsubscribe = this.normalizeRemoteInvalidationSubscription(subscription)
        if (runtime.cancelled) {
          unsubscribe?.()
          return
        }
        runtime.unsubscribe = unsubscribe
      })
      .catch((err) => {
        if (runtime.cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        console.error('[MainThreadBridge] Failed to subscribe to remote invalidations:', error)
        this.remoteInvalidations = null
      })
  }

  private stopRemoteInvalidationSubscription(): void {
    const runtime = this.remoteInvalidations
    if (!runtime) return

    runtime.cancelled = true
    this.remoteInvalidations = null
    runtime.unsubscribe?.()
  }

  private handleRemoteQueryInvalidation(event: RemoteNodeQueryInvalidation): void {
    for (const entry of this.getRemoteInvalidationEntries(event)) {
      if (this.cache.getSubscriberCount(entry.queryId) === 0) continue

      const route = routeRemoteNodeQuery({
        descriptor: entry.descriptor,
        hasRemoteClient: this.remoteNodeQueryClient !== null,
        localRowCount: this.getRemoteInvalidationRouteRowCount(entry.queryId, entry.data),
        thresholds: this.remoteNodeQueryRouting
      })

      if (route.shouldRunRemote) {
        void this.loadRemoteQuery(entry.queryId, entry.descriptor, route)
        continue
      }

      if (shouldRunRemoteQuery(entry.descriptor)) {
        void this.loadRemoteQuery(entry.queryId, entry.descriptor)
      }
    }
  }

  private getRemoteInvalidationRouteRowCount(
    queryId: string,
    data: NodeState[] | null
  ): number | undefined {
    const totalCount = this.cache.getMetadata(queryId)?.pageInfo?.totalCount
    return typeof totalCount === 'number' ? totalCount : (data?.length ?? undefined)
  }

  private getRemoteInvalidationEntries(event: RemoteNodeQueryInvalidation): Array<{
    queryId: string
    descriptor: QueryDescriptor
    data: NodeState[] | null
  }> {
    const matches = new Map<
      string,
      {
        queryId: string
        descriptor: QueryDescriptor
        data: NodeState[] | null
      }
    >()
    const addEntry = (entry: {
      queryId: string
      descriptor: QueryDescriptor
      data: NodeState[] | null
    }) => {
      matches.set(entry.queryId, entry)
    }
    const addQueryId = (queryId: string | undefined) => {
      if (!queryId || !this.cache.has(queryId)) return
      const descriptor = this.cache.getDescriptor(queryId)
      if (!descriptor) return
      addEntry({ queryId, descriptor, data: this.cache.get(queryId) })
    }

    addQueryId(event.requestId)
    if (event.descriptor) {
      addQueryId(serializeQueryDescriptor(event.descriptor))
    }

    const schemaEntries =
      event.schemaId !== undefined
        ? this.cache.getEntriesForSchema(event.schemaId)
        : event.requestId || event.descriptor || event.nodeIds
          ? []
          : this.cache.getEntries()
    schemaEntries.forEach(addEntry)

    if (event.nodeIds && event.nodeIds.length > 0) {
      const nodeIds = new Set(event.nodeIds)
      const candidates =
        event.schemaId !== undefined
          ? this.cache.getEntriesForSchema(event.schemaId)
          : this.cache.getEntries()
      candidates
        .filter((entry) => {
          if (entry.descriptor.nodeId && nodeIds.has(entry.descriptor.nodeId)) return true
          return (entry.data ?? []).some((node) => nodeIds.has(node.id))
        })
        .forEach(addEntry)
    }

    return Array.from(matches.values())
  }

  private applyRemoteStreamEvent(
    queryId: string,
    descriptor: QueryDescriptor,
    event: QueryStreamEvent
  ): void {
    const runtime = this.remoteStreams.get(queryId)
    if (!runtime) return

    const normalizedEvent = this.normalizeRemoteStreamEvent(descriptor, runtime.state, event)
    const eventWithMetadata =
      event.type === 'error' && event.metadata === undefined
        ? {
            ...normalizedEvent,
            metadata: this.createStreamErrorMetadata(
              descriptor,
              runtime.state,
              normalizedEvent as Extract<QueryStreamEvent, { type: 'error' }>
            )
          }
        : normalizedEvent
    const nextState = reduceQueryStreamEvent(runtime.state, eventWithMetadata)
    runtime.state = nextState
    this.cache.set(
      queryId,
      nextState.data,
      descriptor,
      undefined,
      this.withStreamMetadata(descriptor, nextState, eventWithMetadata)
    )
  }

  private normalizeRemoteStreamEvent(
    descriptor: QueryDescriptor,
    state: QueryStreamState,
    event: QueryStreamEvent
  ): QueryStreamEvent {
    const verification = event.metadata?.verification
    if (isRemoteVerificationFailed(verification)) {
      return {
        type: 'error',
        code: 'VERIFICATION_FAILED',
        error: 'Remote stream event verification failed',
        metadata: this.createStreamErrorMetadata(descriptor, state, {
          type: 'error',
          code: 'VERIFICATION_FAILED',
          error: 'Remote stream event verification failed'
        })
      }
    }

    if (!verification || verification.status !== 'mixed') {
      return event
    }

    switch (event.type) {
      case 'snapshot':
        return {
          ...event,
          nodes: filterRemoteNodesByVerification(event.nodes, verification)
        }
      case 'reset':
        return event.nodes
          ? {
              ...event,
              nodes: filterRemoteNodesByVerification(event.nodes, verification)
            }
          : event
      case 'insert':
        return filterRemoteNodesByVerification([event.node], verification).length > 0
          ? event
          : {
              type: 'delete',
              nodeId: event.node.id,
              metadata: event.metadata
            }
      case 'update':
        return filterRemoteNodesByVerification([event.node], verification).length > 0
          ? event
          : {
              type: 'delete',
              nodeId: event.nodeId,
              metadata: event.metadata
            }
      default:
        return event
    }
  }

  private withStreamMetadata(
    descriptor: QueryDescriptor,
    state: QueryStreamState,
    event: QueryStreamEvent
  ): QueryMetadata {
    const base =
      state.metadata ??
      createQuerySnapshotMetadata({
        descriptor,
        nodes: state.data ?? [],
        source: getRemoteQuerySource(descriptor)
      })
    const metadata = { ...base }
    if (!state.error) {
      delete metadata.error
    }

    return {
      ...metadata,
      updatedAt: Date.now(),
      stream: {
        status: state.status,
        lastEvent: event.type,
        lastEventAt: Date.now(),
        ...(state.progress ? { progress: state.progress } : {}),
        ...(state.error ? { error: state.error } : {}),
        ...(event.type === 'reset' ? { resetReason: event.reason } : {})
      },
      ...(state.error ? { error: state.error } : {})
    }
  }

  private createStreamErrorMetadata(
    descriptor: QueryDescriptor,
    state: QueryStreamState,
    event: Extract<QueryStreamEvent, { type: 'error' }>
  ): QueryMetadata {
    const currentMetadata =
      state.metadata ?? this.cache.getMetadata(serializeQueryDescriptor(descriptor))
    const error =
      event.code === 'VERIFICATION_FAILED'
        ? createRemoteVerificationError({
            requestId: serializeQueryDescriptor(descriptor),
            source: getRemoteQuerySource(descriptor),
            message: event.error
          })
        : new Error(event.error)
    if (currentMetadata && state.data !== null) {
      return createRemoteFallbackMetadata({
        localMetadata: currentMetadata,
        error
      })
    }

    return withRemoteErrorVerificationMetadata(
      createQueryErrorMetadata({
        descriptor,
        source: getRemoteQuerySource(descriptor),
        error: new Error(event.error)
      }),
      error
    )
  }

  private async executeRemoteQuery(
    queryId: string,
    descriptor: QueryDescriptor,
    route?: RemoteNodeQueryRouteDecision
  ): Promise<void> {
    const mode = route?.shouldRunRemote ? route.mode : getRemoteQueryMode(descriptor)
    if (!mode) return

    const source = route?.shouldRunRemote ? route.source : getRemoteQuerySource(descriptor)
    const localSnapshot = this.cache.get(queryId) ?? []
    const requestDescriptor: QueryDescriptor = {
      ...descriptor,
      mode,
      source
    }

    try {
      const response = await this.remoteNodeQueryClient!.query(
        createRemoteNodeQueryRequest({
          requestId: queryId,
          descriptor: requestDescriptor,
          mode,
          source,
          client: {
            knownNodeIds: localSnapshot.map((node) => node.id)
          }
        })
      )

      if (isRemoteNodeQueryError(response)) {
        this.handleRemoteQueryError(queryId, descriptor, response)
        return
      }

      if (!isRemoteNodeQuerySuccess(response)) return

      if (isRemoteVerificationFailed(response.verification)) {
        this.handleRemoteQueryError(
          queryId,
          descriptor,
          createRemoteVerificationError({
            requestId: response.requestId,
            source: response.source
          })
        )
        return
      }

      const verifiedRemoteNodes = filterRemoteNodesByVerification(
        response.nodes,
        response.verification
      )

      const nodes =
        mode === 'local-then-remote'
          ? mergeRemoteNodeSnapshots(localSnapshot, verifiedRemoteNodes)
          : verifiedRemoteNodes
      const metadata = createRemoteSuccessMetadata({
        response,
        source: mode === 'local-then-remote' ? 'hybrid' : response.source,
        loadedCount: nodes.length
      })

      this.cache.set(queryId, nodes, descriptor, undefined, {
        ...metadata,
        ...(route ? { routing: createQueryRoutingMetadata(route) } : {})
      })
    } catch (err) {
      this.handleRemoteQueryError(
        queryId,
        descriptor,
        err instanceof Error ? err : new Error(String(err))
      )
    }
  }

  private handleRemoteQueryError(
    queryId: string,
    descriptor: QueryDescriptor,
    error: Parameters<typeof createRemoteFallbackMetadata>[0]['error']
  ): void {
    const localSnapshot = this.cache.get(queryId)
    const localMetadata = this.cache.getMetadata(queryId)

    if (
      (descriptor.mode === 'local-then-remote' ||
        descriptor.mode === 'live' ||
        descriptor.mode === 'stream') &&
      localSnapshot &&
      localMetadata
    ) {
      this.cache.set(
        queryId,
        localSnapshot,
        descriptor,
        undefined,
        createRemoteFallbackMetadata({ localMetadata, error })
      )
      return
    }

    const fallbackSource = getRemoteQuerySource(descriptor)
    const message = error instanceof Error ? error.message : error.message
    const metadata = createQueryErrorMetadata({
      descriptor,
      source: fallbackSource,
      error: new Error(message)
    })
    this.cache.set(
      queryId,
      [],
      descriptor,
      undefined,
      withRemoteErrorVerificationMetadata(metadata, error)
    )
  }

  private debugQueryPlan(
    queryId: string,
    plan: { durationMs: number; hydratedNodeCount: number }
  ): void {
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem('xnet:sync:debug') !== 'true') return

    console.debug('[MainThreadBridge] query', {
      queryId,
      durationMs: plan.durationMs,
      hydratedNodeCount: plan.hydratedNodeCount
    })
  }

  /**
   * Handle store changes and invalidate affected caches.
   */
  private enqueueStoreChange(event: NodeChangeEvent): void {
    this.pendingStoreChanges.push(event)

    if (this.storeChangeFlushQueued) {
      return
    }

    this.storeChangeFlushQueued = true
    queueMicrotask(() => {
      this.flushStoreChanges()
    })
  }

  private flushStoreChanges(): void {
    const events = this.pendingStoreChanges
    this.pendingStoreChanges = []
    this.storeChangeFlushQueued = false

    if (events.length === 0) {
      return
    }

    if (!this.isBulkStoreChangeSet(events) && events.length === 1) {
      this.handleStoreChange(events[0])
      return
    }

    this.handleStoreChangeSet(events)
  }

  private isBulkStoreChangeSet(events: readonly NodeChangeEvent[]): boolean {
    return (
      events.length > BULK_STORE_CHANGE_RELOAD_THRESHOLD ||
      events.some((event) => (event.change.batchSize ?? 1) > BULK_STORE_CHANGE_RELOAD_THRESHOLD)
    )
  }

  private handleStoreChangeSet(events: readonly NodeChangeEvent[]): void {
    const eventsBySchema = new Map<SchemaIRI, NodeChangeEvent[]>()

    for (const event of events) {
      const schemaId: SchemaIRI | undefined = event.node?.schemaId ?? event.change.payload.schemaId
      if (!schemaId) continue

      const next = eventsBySchema.get(schemaId) ?? []
      next.push(event)
      eventsBySchema.set(schemaId, next)
    }

    for (const [schemaId, schemaEvents] of eventsBySchema) {
      const shouldReload = this.isBulkStoreChangeSet(schemaEvents)
      const changes = schemaEvents.map((event) => ({
        nodeId: event.change.payload.nodeId,
        nextNode: event.node ?? null
      }))

      for (const entry of this.cache.getEntriesForSchema(schemaId)) {
        if (entry.descriptor.mode === 'remote') continue

        if (entry.data === null || shouldReload) {
          void this.loadInitialQuery(entry.queryId, entry.descriptor)
          continue
        }

        this.applyChangesToEntry(entry, changes)
      }
    }
  }

  private handleStoreBatchChange(event: NodeBatchChangeEvent): void {
    // Batch notifications carry node ids only. Small batches hydrate the
    // touched nodes once and flow through the same delta path as regular
    // change events; only genuinely bulk batches re-query each entry.
    if (event.nodeIds.length > BULK_STORE_CHANGE_RELOAD_THRESHOLD) {
      this.reloadEntriesForSchemas(event.schemaIds)
      return
    }

    void this.applyStoreBatchChangeDeltas(event).catch((err) => {
      console.error('[MainThreadBridge] Failed to apply batch change deltas:', err)
      this.reloadEntriesForSchemas(event.schemaIds)
    })
  }

  private reloadEntriesForSchemas(schemaIds: readonly SchemaIRI[]): void {
    for (const schemaId of schemaIds) {
      for (const entry of this.cache.getEntriesForSchema(schemaId)) {
        if (entry.descriptor.mode === 'remote') continue

        void this.loadInitialQuery(entry.queryId, entry.descriptor)
      }
    }
  }

  private async applyStoreBatchChangeDeltas(event: NodeBatchChangeEvent): Promise<void> {
    const nodes = await Promise.all(event.nodeIds.map((nodeId) => this.store.get(nodeId)))
    const changes = event.nodeIds.map((nodeId, index) => ({
      nodeId,
      nextNode: nodes[index]
    }))

    for (const schemaId of event.schemaIds) {
      // Re-read entries after the async hydration so deltas apply to the
      // freshest snapshot.
      for (const entry of this.cache.getEntriesForSchema(schemaId)) {
        if (entry.descriptor.mode === 'remote') continue

        if (entry.data === null) {
          void this.loadInitialQuery(entry.queryId, entry.descriptor)
          continue
        }

        this.applyChangesToEntry(entry, changes)
      }
    }
  }

  /**
   * Apply a list of node changes to a single cache entry, falling back to a
   * storage re-query only when a delta is ambiguous. Optimistic
   * (pre-persistence) applies skip ambiguous entries instead of reloading —
   * storage still holds the OLD state, and the durable change event that
   * follows will reconcile them.
   */
  private applyChangesToEntry(
    entry: {
      queryId: string
      descriptor: QueryDescriptor
      data: NodeState[] | null
      workingSet: BoundedQueryWorkingSet | null
    },
    changes: ReadonlyArray<{ nodeId: string; nextNode: NodeState | null }>,
    options?: { onAmbiguous?: 'reload' | 'skip' }
  ): void {
    let data = entry.data ?? []
    let workingSet = entry.workingSet
    let changed = false

    for (const change of changes) {
      const applied = this.applyChangeToEntryState({
        descriptor: entry.descriptor,
        data,
        workingSet,
        nodeId: change.nodeId,
        nextNode: change.nextNode
      })

      if (applied.kind === 'reload') {
        if (options?.onAmbiguous !== 'skip') {
          void this.loadInitialQuery(entry.queryId, entry.descriptor)
        }
        return
      }

      if (applied.changed) {
        data = applied.data
        workingSet = applied.workingSet
        changed = true
      }
    }

    if (changed) {
      this.cache.set(entry.queryId, data, undefined, undefined, undefined, workingSet)
    }
  }

  /**
   * Find the freshest cached snapshot of a node across all cache entries.
   */
  private findCachedNode(nodeId: string): NodeState | null {
    for (const entry of this.cache.getEntries()) {
      const fromWorkingSet = entry.workingSet?.nodes.find((node) => node.id === nodeId)
      if (fromWorkingSet) return fromWorkingSet
      const fromData = entry.data?.find((node) => node.id === nodeId)
      if (fromData) return fromData
    }
    return null
  }

  /**
   * Synchronously apply an optimistic node mutation to every affected cache
   * entry before persistence, so subscribers see the edit immediately.
   * Returns a revert function that restores authoritative state by
   * re-querying storage (used when persistence fails).
   */
  private applyOptimisticNodeChange(
    nodeId: string,
    mutate: (node: NodeState) => NodeState
  ): () => void {
    const current = this.findCachedNode(nodeId)
    if (!current) {
      return () => {}
    }

    const nextNode = mutate(current)
    const changes = [{ nodeId, nextNode }]

    for (const entry of this.cache.getEntriesForSchema(current.schemaId)) {
      if (entry.descriptor.mode === 'remote') continue
      if (entry.data === null) continue

      this.applyChangesToEntry(entry, changes, { onAmbiguous: 'skip' })
    }

    return () => {
      this.reloadEntriesForSchemas([current.schemaId])
    }
  }

  private applyChangeToEntryState(input: {
    descriptor: QueryDescriptor
    data: NodeState[]
    workingSet: BoundedQueryWorkingSet | null
    nodeId: string
    nextNode: NodeState | null
  }):
    | { kind: 'reload' }
    | {
        kind: 'ok'
        data: NodeState[]
        workingSet: BoundedQueryWorkingSet | null
        changed: boolean
      } {
    if (input.workingSet && queryDescriptorSupportsBoundedDelta(input.descriptor)) {
      const delta = applyNodeChangeToBoundedQueryResult({
        descriptor: input.descriptor,
        workingSet: input.workingSet,
        nodeId: input.nodeId,
        nextNode: input.nextNode
      })

      if (delta.kind === 'reload') return { kind: 'reload' }
      if (delta.kind === 'noop') {
        return { kind: 'ok', data: input.data, workingSet: input.workingSet, changed: false }
      }
      return { kind: 'ok', data: delta.data, workingSet: delta.workingSet, changed: true }
    }

    const delta: QueryResultDelta = applyNodeChangeToQueryResult({
      descriptor: input.descriptor,
      currentData: input.data,
      nodeId: input.nodeId,
      nextNode: input.nextNode
    })

    if (delta.kind === 'reload') return { kind: 'reload' }
    if (delta.kind === 'noop') {
      return { kind: 'ok', data: input.data, workingSet: input.workingSet, changed: false }
    }
    return { kind: 'ok', data: delta.data, workingSet: null, changed: true }
  }

  private handleStoreChange(event: NodeChangeEvent): void {
    const { node, change } = event
    // Get schemaId from node (if available) or from the change payload
    const schemaId: SchemaIRI | undefined = node?.schemaId ?? change.payload.schemaId

    if (!schemaId) return

    const changes = [{ nodeId: change.payload.nodeId, nextNode: node ?? null }]

    for (const entry of this.cache.getEntriesForSchema(schemaId)) {
      if (entry.descriptor.mode === 'remote') continue

      if (entry.data === null) {
        void this.loadInitialQuery(entry.queryId, entry.descriptor)
        continue
      }

      this.applyChangesToEntry(entry, changes)
    }
  }

  // ─── Mutations ──────────────────────────────────────────

  async create<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    data: InferCreateProps<P>,
    id?: string
  ): Promise<NodeState> {
    return this.store.create({
      id,
      schemaId: schema._schemaId,
      properties: data as Record<string, unknown>
    })
  }

  async update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState> {
    // Optimistic apply: subscribers see the edit synchronously; the durable
    // change event reconciles with signed/authoritative state, and failures
    // revert by re-querying storage.
    const revert = this.applyOptimisticNodeChange(nodeId, (node) => ({
      ...node,
      properties: { ...node.properties, ...changes },
      updatedAt: Date.now()
    }))

    try {
      return await this.store.update(nodeId, { properties: changes })
    } catch (err) {
      revert()
      throw err
    }
  }

  async delete(nodeId: string): Promise<void> {
    const revert = this.applyOptimisticNodeChange(nodeId, (node) => ({
      ...node,
      deleted: true,
      updatedAt: Date.now()
    }))

    try {
      await this.store.delete(nodeId)
    } catch (err) {
      revert()
      throw err
    }
  }

  async restore(nodeId: string): Promise<NodeState> {
    return this.store.restore(nodeId)
  }

  async bulkWrite(input: NodeBatchWriteInput): Promise<NodeBatchWriteResult> {
    return this.store.batchWrite(input)
  }

  // ─── Documents ─────────────────────────────────────────

  /**
   * Acquire a Y.Doc for editing.
   * Delegates to SyncManager if available, otherwise throws.
   *
   * @throws Error if SyncManager is not set
   */
  async acquireDoc(nodeId: string): Promise<AcquiredDoc> {
    if (!this._syncManager) {
      throw new Error(
        'MainThreadBridge.acquireDoc requires SyncManager. ' +
          'Call setSyncManager() first or use useNode with SyncManager context.'
      )
    }

    const doc = await this._syncManager.acquire(nodeId)
    const awareness = this._syncManager.getAwareness(nodeId)

    if (!awareness) {
      throw new Error(`Failed to get awareness for node ${nodeId}`)
    }

    return { doc, awareness }
  }

  /**
   * Release a Y.Doc when no longer editing.
   */
  releaseDoc(nodeId: string): void {
    if (this._syncManager) {
      this._syncManager.release(nodeId)
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────

  async initialize(config: DataBridgeConfig): Promise<void> {
    const nextRemoteNodeQueryClient = config.remoteNodeQueryClient ?? this.remoteNodeQueryClient
    if (nextRemoteNodeQueryClient !== this.remoteNodeQueryClient) {
      this.stopRemoteInvalidationSubscription()
    }
    this.remoteNodeQueryClient = nextRemoteNodeQueryClient
    this.remoteNodeQueryRouting = config.remoteNodeQueryRouting ?? this.remoteNodeQueryRouting
    this.startRemoteInvalidationSubscription()
  }

  destroy(): void {
    this.stopRemoteInvalidationSubscription()
    for (const queryId of this.remoteStreams.keys()) {
      this.stopRemoteQueryStream(queryId)
    }
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe()
      this.storeUnsubscribe = null
    }
    if (this.storeBatchUnsubscribe) {
      this.storeBatchUnsubscribe()
      this.storeBatchUnsubscribe = null
    }
    this.cache.clear()
    this.statusListeners.clear()
    this.remoteLoads.clear()
  }

  // ─── Status ─────────────────────────────────────────────

  get status(): SyncStatus {
    // MainThreadBridge is always "connected" since it's local
    return 'connected'
  }

  on(event: 'status', handler: (status: SyncStatus) => void): () => void {
    if (event === 'status') {
      this.statusListeners.add(handler)
      return () => {
        this.statusListeners.delete(handler)
      }
    }
    return () => {}
  }

  // ─── Direct Store Access (Phase 0 compatibility) ────────

  get nodeStore(): NodeStore {
    return this.store
  }

  subscribeToChanges(listener: (event: NodeChangeEvent) => void): () => void {
    return this.store.subscribe(listener)
  }

  async get(nodeId: string): Promise<NodeState | null> {
    return this.store.get(nodeId)
  }

  async list(options?: ListNodesOptions): Promise<NodeState[]> {
    return this.store.list(options)
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Create a MainThreadBridge from a NodeStore.
 */
export function createMainThreadBridge(
  store: NodeStore,
  options?: MainThreadBridgeOptions
): MainThreadBridge {
  return new MainThreadBridge(store, options)
}
