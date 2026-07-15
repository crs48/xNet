/**
 * SQLite storage adapter for NodeStore.
 *
 * Provides high-performance storage for nodes and changes using SQLite.
 * Works with any SQLiteAdapter implementation (Electron, Web, Expo).
 */

import type {
  NodeId,
  NodeChange,
  NodePayload,
  NodeState,
  NodeStorageAdapter,
  NodeReadAuthorizer,
  AuthorizationStateVersion,
  ListNodesOptions,
  CountNodesOptions,
  SetNodeOptions,
  ImportNodesOptions,
  RebuildNodeIndexesOptions,
  ApplyNodeBatchInput,
  ApplyNodeBatchResult,
  NodeBatchPreflightResult,
  PinEntry,
  PinRegistry
} from './types'
import type { SchemaIRI } from '../schema/node'
import type { ContentId, DID } from '@xnetjs/core'
import type {
  SQLiteAdapter,
  SQLValue,
  PreparedStatement,
  SQLiteOperationStats,
  SQLiteNodeBatchApplyInput
} from '@xnetjs/sqlite'
import { lwwUpdateGuardSql, singleFlight } from '@xnetjs/core'
import {
  extractSearchableContent,
  analyzeQuery,
  detectSQLiteCapabilities,
  getIndexInfo,
  runAnalyze,
  timeQuery
} from '@xnetjs/sqlite'
import { SYSTEM_SCHEMA_BASE_IRIS } from '../schema/schemas/system'
import {
  hydrateAggregatedRows,
  hydrateJoinedRows,
  hydrateNodesByIds,
  type AggregatedNodeRow,
  type JoinedNodePropertyRow
} from './hydration'
import {
  FullTextIndexing,
  ScalarIndexing,
  SpatialIndexing,
  createDeleteRemovedPropertiesOperation,
  deleteRemovedProperties,
  type IndexingContext
} from './indexing'
import {
  applyNodeQueryDescriptor,
  withoutNodeQueryMaterializedView,
  withoutNodeQueryPagination,
  type NodeQueryDescriptor,
  type NodeQueryParityCheckMetadata,
  type NodeQueryResult,
  type NodeQueryStorageCapabilitiesMetadata
} from './query'
import {
  QueryCompiler,
  buildSqlOrderBy,
  hashScalarValue,
  quoteSqlLiteral,
  stringifyStable,
  toScalarIndexValue,
  type AdaptiveIndexHint,
  type CompiledNodeQuery,
  type FullTextSearchQueryPlan,
  type ScalarValueType,
  type SpatialQueryPlan
} from './query-compiler'
import {
  SQL_IN_ARITY_BUCKETS,
  SQLITE_BIND_PARAMETER_BATCH_SIZE,
  chunkItems,
  padToArityBucket
} from './sql-batching'

/**
 * The shared LWW upsert guard for `node_properties` (protocol §L1.7 via
 * `@xnetjs/core`); keep every property write on this ONE ordering (0272/0276).
 */
const NODE_PROPERTIES_LWW_GUARD = lwwUpdateGuardSql({
  table: 'node_properties',
  lamportColumn: 'lamport_time',
  wallTimeColumn: 'updated_at',
  authorColumn: 'updated_by',
  // Grinding-resistant final tiebreak (exploration 0305): larger key wins when
  // both rows carry one (v4+), else the author DID. The key is precomputed in
  // application code and stored, so SQL only compares the opaque hex — byte
  // identical to `shouldReplace` in ./store.ts, no user-defined function.
  tiebreakKeyColumn: 'tiebreak_key'
})

// ─── Row Types ──────────────────────────────────────────────────────────────

interface ChangeRow {
  hash: string
  node_id: string
  payload: Uint8Array
  lamport_time: number
  lamport_author: string
  wall_time: number
  author_did: string
  parent_hash: string | null
  batch_id: string | null
  signature: Uint8Array
  // Index signature for SQLRow compatibility
  [key: string]: SQLValue
}

interface AdaptiveIndexingConfig {
  enabled: boolean
  minHits: number
  minDurationMs: number
  minCandidates: number
  maxIndexesPerSchema: number
  maxEstimatedBytesPerSchema: number
  maxIndexedRowsPerSchema: number
  dropUnusedAfterMs: number
}

interface QueryVerificationConfig {
  enabled: boolean
  maxNodes: number
  logFailures: boolean
}

export interface SQLiteAdaptiveIndexingOptions {
  enabled?: boolean
  minHits?: number
  minDurationMs?: number
  minCandidates?: number
  maxIndexesPerSchema?: number
  maxEstimatedBytesPerSchema?: number
  maxIndexedRowsPerSchema?: number
  dropUnusedAfterMs?: number
}

export interface SQLiteQueryVerificationOptions {
  enabled?: boolean
  maxNodes?: number
  logFailures?: boolean
}

export interface SQLiteNodeStorageAdapterOptions {
  adaptiveIndexing?: SQLiteAdaptiveIndexingOptions
  queryVerification?: SQLiteQueryVerificationOptions
  /**
   * Collect EXPLAIN QUERY PLAN + index inventory for queries. Costs extra
   * round trips, so it is off unless explicitly enabled or the
   * `xnet:query:debug` localStorage flag is set. Diagnostics are collected
   * once per unique compiled SQL shape per session (invalidated when the
   * adapter itself runs DDL) — per-execution collection convoyed the serial
   * worker and delayed the very queries being measured by 18-20s at boot
   * (2026-07-05 capture).
   */
  queryDiagnostics?: boolean
  /**
   * Hydrate via SQL-side `json_group_object` aggregation — ONE row per node
   * instead of one row per (node × property) — collapsing the boundary
   * payload before it leaves SQLite (exploration 0264, Wave 2). Off by
   * default while the mode is benchmarked; correctness is verified equal by
   * the hydration test suite in both modes.
   */
  aggregatedHydration?: boolean
  /**
   * Defer maintenance work (adaptive index creation) to an idle scheduler
   * instead of running it inline on the query path. The web app passes a
   * bootSettled-gated scheduler — no background work is free on the single
   * serial SQLite worker (exploration 0260/0264). Default: run inline.
   */
  scheduleMaintenance?: (task: () => Promise<void> | void) => void
}

interface QueryTelemetry {
  descriptorHash: string
  adaptiveIndexNames: string[]
}

interface QueryDescriptorStatsRow {
  hits: number
  avg_duration_ms: number
  avg_candidates: number
  [key: string]: SQLValue
}

interface AdaptiveIndexBudgetEstimate {
  rowCount: number
  estimatedBytes: number
}

interface AdaptiveIndexBudgetUsage {
  count: number
  estimatedBytes: number
  indexedRows: number
}

interface MaterializedQueryRow {
  view_id: string
  descriptor_hash: string
  schema_id: string
  descriptor_json: string
  generated_at: number
  invalidated_at: number | null
  row_count: number
  auth_fingerprint: string | null
  [key: string]: SQLValue
}

interface MaterializedQueryReadPlan {
  viewId: string
  descriptorHash: string
  generatedAt: number
  invalidatedAt: number | null
  rowCount: number
  cacheHit: boolean
  refreshReason?: MaterializedQueryRefreshReason
}

interface CompiledQueryDiagnostics {
  usedIndexNames?: string[]
  fullTableScan?: boolean
  queryPlanDetails?: string[]
  availableIndexCount?: number
  adaptiveIndexCount?: number
  storageCapabilities?: NodeQueryStorageCapabilitiesMetadata
  diagnosticsError?: string
}

type MaterializedQueryRefreshReason =
  | 'missing'
  | 'descriptor-changed'
  | 'authz-changed'
  | 'invalidated'
  | 'expired'
  | 'force-refresh'

const DEFAULT_ADAPTIVE_INDEXING: AdaptiveIndexingConfig = {
  enabled: false,
  minHits: 20,
  minDurationMs: 16,
  minCandidates: 2000,
  maxIndexesPerSchema: 8,
  maxEstimatedBytesPerSchema: 16 * 1024 * 1024,
  maxIndexedRowsPerSchema: 250_000,
  dropUnusedAfterMs: 30 * 24 * 60 * 60 * 1000
}

// Parity verification re-lists the candidate scope and re-runs the
// descriptor in JS per query — invaluable in tests, far too expensive as an
// always-on production tax. Vitest/integration suites opt back in.
const DEFAULT_QUERY_VERIFICATION: QueryVerificationConfig = {
  enabled: false,
  maxNodes: 1000,
  logFailures: true
}

const QUERY_TELEMETRY_FLUSH_THRESHOLD = 50

// Marker key for the change-record envelope stored in the `changes.payload`
// BLOB (exploration 0272). See serializeChangeRecord for why the envelope
// exists and why it lives in the payload rather than in new columns.
const CHANGE_ENVELOPE_KEY = '__xnetChangeEnvelopeV1'

// Distinct compiled SQL shapes are usually few (dozens), but IN-list binds
// mint one shape per list length, so a long debug session can keep growing.
// Evict oldest-first past this — recomputing a plan later is cheap; holding
// thousands of memo entries is not.
const COMPILED_QUERY_DIAGNOSTICS_MEMO_LIMIT = 512

interface PendingQueryTelemetry {
  schemaId: string
  descriptorJson: string
  hits: number
  totalDurationMs: number
  totalCandidates: number
  lastSeenAt: number
}
function getMaterializedQueryRefreshReason(input: {
  cached: MaterializedQueryRow | null
  descriptorHash: string
  authFingerprint: string | null
  cacheExpired: boolean
  forceRefresh: boolean
}): MaterializedQueryRefreshReason | undefined {
  if (!input.cached) {
    return 'missing'
  }

  if (input.forceRefresh) {
    return 'force-refresh'
  }

  if (input.cached.descriptor_hash !== input.descriptorHash) {
    return 'descriptor-changed'
  }

  if ((input.cached.auth_fingerprint ?? null) !== input.authFingerprint) {
    return 'authz-changed'
  }

  if (input.cached.invalidated_at !== null) {
    return 'invalidated'
  }

  if (input.cacheExpired) {
    return 'expired'
  }

  return undefined
}

function countPropertyRows(nodes: readonly NodeState[]): number {
  return nodes.reduce((count, node) => count + Object.keys(node.properties).length, 0)
}

// ─── SQLiteNodeStorageAdapter ───────────────────────────────────────────────

/**
 * SQLite-backed storage adapter for NodeStore.
 *
 * This adapter provides high-performance storage for nodes and changes
 * using the platform-appropriate SQLite implementation.
 *
 * @example
 * ```typescript
 * import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
 *
 * const sqliteAdapter = await createMemorySQLiteAdapter()
 * const nodeStorage = new SQLiteNodeStorageAdapter(sqliteAdapter)
 *
 * const store = new NodeStore({
 *   storage: nodeStorage,
 *   authorDID: identity.did,
 *   signingKey: identity.signingKey
 * })
 * ```
 */
export class SQLiteNodeStorageAdapter implements NodeStorageAdapter {
  // Prepared statement cache for hot paths
  private stmtCache = new Map<string, PreparedStatement>()

  private adaptiveIndexing: AdaptiveIndexingConfig

  private queryVerification: QueryVerificationConfig

  private queryDiagnostics: boolean
  /** Hydrate one row per node via json_group_object (0264 Wave 2 flag). */
  private aggregatedHydration: boolean
  /** Idle scheduler for maintenance work (adaptive index creation, 0264). */
  private scheduleMaintenance?: (task: () => Promise<void> | void) => void

  private pendingQueryTelemetry = new Map<string, PendingQueryTelemetry>()

  private pendingQueryTelemetryHits = 0

  private adaptiveIndexBudgetColumnsReady = false

  private storageCapabilitiesPromise?: Promise<NodeQueryStorageCapabilitiesMetadata>

  /**
   * Plan diagnostics memoized per compiled SQL shape (the string EXPLAINed),
   * shared across executions AND concurrent callers. Cleared when this adapter
   * creates/drops an adaptive index, since that changes plans. Debug mode must
   * not distort what it measures: per-execution EXPLAIN + index-inventory
   * round-trips convoyed the single serial worker at boot.
   */
  private compiledQueryDiagnosticsMemo = new Map<string, Promise<CompiledQueryDiagnostics>>()

  private writeQueue: Promise<unknown> = Promise.resolve()

  /**
   * Read-authorization filter applied before persisting a materialized view's
   * id list (exploration 0226). Wired by `NodeStore` when an auth evaluator is
   * present; `undefined` means materialized views are computed unauthorized
   * (the trusted single-user case).
   */
  private nodeReadAuthorizer?: NodeReadAuthorizer

  /** One-time guard: ensure the `auth_fingerprint` column exists on upgraded DBs. */
  private materializationColumnsReady = false
  private nodePropertyColumnsReady: Promise<void> | null = null

  /**
   * Descriptor→SQL compilation lives in `query-compiler.ts` (exploration
   * 0276). Flags are read per-compile so the compiler never captures stale
   * adapter state.
   */
  private readonly queryCompiler = new QueryCompiler(() => ({
    adaptiveIndexingEnabled: this.adaptiveIndexing.enabled,
    aggregatedHydration: this.aggregatedHydration
  }))

  /**
   * The three sidecar index families — scalar / full-text / spatial — live
   * behind `IndexingStrategy` in ./indexing (exploration 0276). Each takes
   * the narrow `IndexingContext` capability set; table-existence memos live
   * inside the family instances.
   */
  private readonly scalarIndexing: ScalarIndexing

  private readonly fullTextIndexing: FullTextIndexing

  private readonly spatialIndexing: SpatialIndexing

  constructor(
    private db: SQLiteAdapter,
    options: SQLiteNodeStorageAdapterOptions = {}
  ) {
    this.adaptiveIndexing = {
      ...DEFAULT_ADAPTIVE_INDEXING,
      ...options.adaptiveIndexing
    }
    this.queryVerification = {
      ...DEFAULT_QUERY_VERIFICATION,
      ...options.queryVerification
    }
    this.queryDiagnostics = options.queryDiagnostics ?? false
    this.aggregatedHydration = options.aggregatedHydration ?? true
    this.scheduleMaintenance = options.scheduleMaintenance

    const indexingContext: IndexingContext = {
      db,
      getStorageCapabilities: () => this.getStorageCapabilities(),
      enqueueWrite: (write) => this.enqueueWrite(write),
      listNodesForSchema: (schemaId) => this.listNodesOptimized({ schemaId, includeDeleted: true }),
      getNode: (id) => this.getNode(id)
    }
    this.scalarIndexing = new ScalarIndexing(indexingContext)
    this.fullTextIndexing = new FullTextIndexing(indexingContext)
    this.spatialIndexing = new SpatialIndexing(indexingContext)
  }

  getSQLiteAdapter(): SQLiteAdapter {
    return this.db
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    // DB should already be open when passed to constructor
    if (!this.db.isOpen()) {
      throw new Error('SQLiteAdapter must be opened before use')
    }
  }

  async close(): Promise<void> {
    try {
      await this.flushQueryTelemetry()
    } catch {
      // Telemetry must never block shutdown.
    }

    // Finalize all prepared statements
    for (const stmt of this.stmtCache.values()) {
      await stmt.finalize()
    }
    this.stmtCache.clear()
    // Don't close the shared SQLiteAdapter - let the owner manage it
  }

  /**
   * Get or create a prepared statement.
   * Cached statements are reused for better performance.
   */
  private async getStatement(key: string, sql: string): Promise<PreparedStatement> {
    let stmt = this.stmtCache.get(key)
    if (!stmt) {
      stmt = await this.db.prepare(sql)
      this.stmtCache.set(key, stmt)
    }
    return stmt
  }

  private async enqueueWrite<T>(write: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(write, write)
    this.writeQueue = run.catch(() => undefined)
    return run
  }

  async withTransaction<T>(fn: (storage: NodeStorageAdapter) => Promise<T>): Promise<T> {
    return this.enqueueWrite(async () => {
      await this.db.beginTransaction()

      try {
        const result = await fn(this.createTransactionStorageAdapter())
        await this.db.commit()
        return result
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })
  }

  private createTransactionStorageAdapter(): NodeStorageAdapter {
    const storage: NodeStorageAdapter = {
      appendChange: (change) => this.appendChangeInternal(change),
      getChanges: (nodeId) => this.getChanges(nodeId),
      getAllChanges: () => this.getAllChanges(),
      getChangesSince: (sinceLamport) => this.getChangesSince(sinceLamport),
      getChangeByHash: (hash) => this.getChangeByHash(hash),
      hasChange: (hash) => this.hasChange(hash),
      getLastChange: (nodeId) => this.getLastChange(nodeId),
      getLastChangesByNodeId: (nodeIds) => this.getLastChangesByNodeId(nodeIds),
      appendChanges: (changes) => this.appendChangesInternal(changes),
      getNode: (id) => this.getNode(id),
      getNodes: (ids) => this.getNodes(ids),
      getExistingNodeIds: (ids) => this.getExistingNodeIds(ids),
      setNode: (node, options) => this._setNodeInternal(node, options),
      importNodes: (nodes, options) => this.importNodesInternal(nodes, options),
      applyNodeBatch: (input) => this.applyNodeBatchInternal(input),
      rebuildIndexesForSchemas: (schemaIds, options) =>
        this.rebuildIndexesForSchemasInternal(schemaIds, options),
      analyze: () => this.analyze(),
      optimize: () => this.optimize(),
      deleteNode: (id) => this.deleteNodeInternal(id),
      listNodes: (options) => this.listNodes(options),
      countNodes: (options) => this.countNodes(options),
      getOperationStats: () => this.getOperationStats(),
      resetOperationStats: () => this.resetOperationStats(),
      getLastLamportTime: () => this.getLastLamportTime(),
      setLastLamportTime: (time) => this.setLastLamportTimeInternal(time),
      getDocumentContent: (nodeId) => this.getDocumentContent(nodeId),
      setDocumentContent: (nodeId, content) => this.setDocumentContentInternal(nodeId, content)
    }

    storage.queryNodes = (descriptor) => this.queryNodes(descriptor)
    return storage
  }

  // ─── Change Log Operations ────────────────────────────────────────────────

  async appendChange(change: NodeChange): Promise<void> {
    await this.enqueueWrite(() => this.appendChangeInternal(change))
  }

  private async appendChangeInternal(change: NodeChange): Promise<void> {
    const payload = this.serializeChangeRecord(change)

    // Note: The schema uses 'lamport_peer' and 'author' columns but we adapt here
    // to match Change<T> interface which uses a numeric lamport and authorDID
    await this.db.run(
      `INSERT OR IGNORE INTO changes
       (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        change.hash,
        change.payload.nodeId,
        payload,
        change.lamport,
        change.authorDID, // change author maps to lamport_peer column
        change.wallTime,
        change.authorDID, // authorDID maps to author column
        change.parentHash ?? null,
        change.batchId ?? null,
        change.signature
      ]
    )
  }

  async appendChanges(changes: readonly NodeChange[]): Promise<void> {
    if (changes.length === 0) return

    await this.enqueueWrite(async () => {
      await this.db.beginTransaction()
      try {
        await this.appendChangesInternal(changes)
        await this.db.commit()
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })
  }

  private async appendChangesInternal(changes: readonly NodeChange[]): Promise<void> {
    for (const change of changes) {
      await this.appendChangeInternal(change)
    }
  }

  async getChanges(nodeId: NodeId): Promise<NodeChange[]> {
    const rows = await this.db.query<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes WHERE node_id = ? ORDER BY lamport_time ASC`,
      [nodeId]
    )

    return rows.map((row) => this.deserializeChange(row))
  }

  async getAllChanges(): Promise<NodeChange[]> {
    const rows = await this.db.query<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes ORDER BY lamport_time ASC`
    )

    return rows.map((row) => this.deserializeChange(row))
  }

  async getChangesSince(sinceLamport: number): Promise<NodeChange[]> {
    const rows = await this.db.query<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes WHERE lamport_time > ? ORDER BY lamport_time ASC`,
      [sinceLamport]
    )

    return rows.map((row) => this.deserializeChange(row))
  }

  /**
   * Compact the local change log (exploration 0254 / F3): delete only
   * *superseded* history so the OPFS file shrinks (fast cold open) and the
   * outbound-resync slice shrinks (cheap first sync), without affecting reads,
   * outbound sync, hash-chain chaining, or convergence with peers that never
   * compacted.
   *
   * A row is deleted iff ALL of:
   *  - `lamport_time < wsafe` — below the confirmed-durable floor, so the hub
   *    holds it and it is not part of the unconfirmed outbound tail (K1);
   *  - it is NOT a node's hash-chain tip — we keep every row at a node's
   *    `MAX(lamport_time)` (the whole tie group), so `getLastChange()` still
   *    returns a real tip and the next write's `parentHash`/hash/signature are
   *    byte-identical to an uncompacted peer's (K2);
   *  - it backs NO currently-winning LWW value — its `(node_id, lamport_time,
   *    author)` is not the provenance of any live `node_properties` row (K3).
   *
   * K3 is the load-bearing safety net: because every live projection value keeps
   * its backing row, the retained log still materialises to — and can re-push —
   * the exact current state, so a stranded/rolled-back peer never loses live
   * data. Reads are unaffected (they read the materialized `nodes`/
   * `node_properties`, never the log). Only rows are deleted, never rewritten
   * (the hash + signature are immutable and unforgeable). Runs chunked inside
   * the write lane, yields between chunks, and never throws.
   */
  async pruneSupersededChanges(
    wsafe: number,
    options: { chunk?: number; maxRows?: number } = {}
  ): Promise<{ deleted: number }> {
    const chunk = Math.max(1, Math.floor(options.chunk ?? 5_000))
    const maxRows = Math.max(0, Math.floor(options.maxRows ?? 250_000))
    if (!Number.isFinite(wsafe) || wsafe <= 0 || maxRows === 0) return { deleted: 0 }

    let deleted = 0
    for (;;) {
      const remaining = maxRows - deleted
      const limit = Math.min(chunk, remaining)
      if (limit <= 0) break
      const affected = await this.enqueueWrite(async () => {
        const result = await this.db.run(
          `DELETE FROM changes WHERE hash IN (
             SELECT c.hash FROM changes c
             WHERE c.lamport_time < ?
               AND c.lamport_time < (
                 SELECT MAX(t.lamport_time) FROM changes t WHERE t.node_id = c.node_id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM node_properties p
                 WHERE p.node_id = c.node_id
                   AND p.lamport_time = c.lamport_time
                   AND p.updated_by = c.author
               )
             LIMIT ?
           )`,
          [wsafe, limit]
        )
        return result.changes ?? 0
      })
      deleted += affected
      if (affected < limit) break
      // Yield a macrotask so interactive ops interleave between chunks.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return { deleted }
  }

  async getChangeByHash(hash: ContentId): Promise<NodeChange | null> {
    const row = await this.db.queryOne<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time,
              lamport_peer as lamport_author, wall_time,
              author as author_did, parent_hash, batch_id, signature
       FROM changes WHERE hash = ?`,
      [hash]
    )

    return row ? this.deserializeChange(row) : null
  }

  async hasChange(hash: ContentId): Promise<boolean> {
    const row = await this.db.queryOne<{ 1: number }>(`SELECT 1 FROM changes WHERE hash = ?`, [
      hash
    ])
    return row !== null && row !== undefined
  }

  async getLastChange(nodeId: NodeId): Promise<NodeChange | null> {
    const row = await this.db.queryOne<ChangeRow>(
      `SELECT hash, node_id, payload, lamport_time, 
              lamport_peer as lamport_author, wall_time, 
              author as author_did, parent_hash, batch_id, signature 
       FROM changes WHERE node_id = ? ORDER BY lamport_time DESC LIMIT 1`,
      [nodeId]
    )

    return row ? this.deserializeChange(row) : null
  }

  async getLastChangesByNodeId(nodeIds: readonly NodeId[]): Promise<Map<NodeId, NodeChange>> {
    const uniqueIds = Array.from(new Set(nodeIds))
    const changes = new Map<NodeId, NodeChange>()
    if (uniqueIds.length === 0) return changes

    for (const batch of chunkItems(uniqueIds, SQLITE_BIND_PARAMETER_BATCH_SIZE)) {
      // NULL-padded to a fixed arity so the statement caches (0264); NULL
      // never matches an IN list.
      const padded = padToArityBucket(batch, SQL_IN_ARITY_BUCKETS)
      const placeholders = padded.map(() => '?').join(', ')
      const rows = await this.db.query<ChangeRow>(
        `SELECT hash, node_id, payload, lamport_time,
                lamport_peer as lamport_author, wall_time,
                author as author_did, parent_hash, batch_id, signature
         FROM changes c
         WHERE c.node_id IN (${placeholders})
           AND c.hash = (
             SELECT c2.hash
             FROM changes c2
             WHERE c2.node_id = c.node_id
             ORDER BY c2.lamport_time DESC
             LIMIT 1
           )`,
        padded as SQLValue[]
      )

      rows.forEach((row) => {
        changes.set(row.node_id, this.deserializeChange(row))
      })
    }

    return new Map(
      uniqueIds.flatMap((nodeId): [NodeId, NodeChange][] => {
        const change = changes.get(nodeId)
        return change ? [[nodeId, change]] : []
      })
    )
  }

  // ─── Materialized State Operations ────────────────────────────────────────

  async getNode(id: NodeId): Promise<NodeState | null> {
    // Hydrate selects `p.tiebreak_key`, which a pre-v8 database is missing —
    // repair before the first read, not just before writes (the lazy guard
    // used to run too late: the first read threw before any write ran it).
    await this.ensureNodePropertyColumns()
    // One joined read via the shared hydrate path. The previous shape — a
    // node-metadata queryOne followed by a properties query — cost a
    // worker-backed adapter two RPC round-trips per node (exploration 0263).
    const nodes = await hydrateNodesByIds(this.db, [id], this.aggregatedHydration)
    return nodes[0] ?? null
  }

  async getNodes(ids: readonly NodeId[]): Promise<NodeState[]> {
    const uniqueIds = Array.from(new Set(ids))
    if (uniqueIds.length === 0) return []
    await this.ensureNodePropertyColumns()

    // hydrateNodesByIds chunks internally and batches multi-chunk reads into
    // one queryBatch RPC (exploration 0263) — don't pre-chunk here or every
    // chunk pays its own worker round-trip again.
    return hydrateNodesByIds(this.db, uniqueIds, this.aggregatedHydration)
  }

  async getExistingNodeIds(ids: readonly NodeId[]): Promise<NodeId[]> {
    const uniqueIds = Array.from(new Set(ids))
    if (uniqueIds.length === 0) return []

    const existingIds = new Set<NodeId>()
    for (const batch of chunkItems(uniqueIds, SQLITE_BIND_PARAMETER_BATCH_SIZE)) {
      // NULL-padded to a fixed arity so the statement caches (0264).
      const padded = padToArityBucket(batch, SQL_IN_ARITY_BUCKETS)
      const placeholders = padded.map(() => '?').join(', ')
      const rows = await this.db.query<{ id: string }>(
        `SELECT id FROM nodes WHERE id IN (${placeholders})`,
        padded as SQLValue[]
      )
      rows.forEach((row) => existingIds.add(row.id))
    }

    return uniqueIds.filter((id) => existingIds.has(id))
  }

  async getBatchPreflight(ids: readonly NodeId[]): Promise<NodeBatchPreflightResult> {
    const [nodes, lastChangesByNodeId] = await Promise.all([
      this.getNodes(ids),
      this.getLastChangesByNodeId(ids)
    ])

    return {
      nodesById: new Map(nodes.map((node) => [node.id, node])),
      lastChangesByNodeId
    }
  }

  async setNode(node: NodeState, options?: SetNodeOptions): Promise<void> {
    await this.enqueueWrite(async () => {
      // Use manual transaction control for web proxy compatibility
      await this.db.beginTransaction()
      try {
        await this._setNodeInternal(node, options)
        await this.db.commit()
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })
  }

  /**
   * Internal method for setting a node without starting a new transaction.
   * Used by importNodes to avoid nested transactions.
   */
  private async _setNodeInternal(
    node: NodeState,
    options?: SetNodeOptions | ImportNodesOptions
  ): Promise<void> {
    await this.ensureNodePropertyColumns()
    // Upsert node
    await this.db.run(
      `INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         schema_id = excluded.schema_id,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at`,
      [
        node.id,
        node.schemaId,
        node.createdAt,
        node.updatedAt,
        node.createdBy,
        node.deleted && node.deletedAt ? node.deletedAt.wallTime : null
      ]
    )

    await deleteRemovedProperties(this.db, node)

    // Upsert properties
    for (const [key, value] of Object.entries(node.properties)) {
      const timestamp = node.timestamps[key]
      if (!timestamp) continue

      // LWW guard must implement the FULL ordering triple (lamport →
      // wallTime → author code-units), exactly like `shouldReplace` in
      // ./store.ts. A lamport-only guard kept whichever concurrent edit
      // arrived first, so replicas that received a same-lamport conflict in
      // different orders permanently disagreed (found by the 0272 sync
      // simulation; the in-memory adapter masked it in the 0238 convergence
      // tests). `updated_at`/`updated_by` hold the winning timestamp's
      // wallTime/author; DIDs are ASCII, so SQLite's BINARY collation agrees
      // with the UTF-16 code-unit comparison used in TypeScript.
      await this.db.run(
        `INSERT INTO node_properties (node_id, property_key, value, lamport_time, updated_by, updated_at, tiebreak_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(node_id, property_key) DO UPDATE SET
           value = excluded.value,
           lamport_time = excluded.lamport_time,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at,
           tiebreak_key = excluded.tiebreak_key
         WHERE ${NODE_PROPERTIES_LWW_GUARD}`,
        [
          node.id,
          key,
          this.serializeValue(value),
          timestamp.lamport,
          timestamp.author,
          timestamp.wallTime,
          timestamp.tiebreakKey ?? null
        ]
      )
    }

    const deferIndexes = options ? 'deferIndexes' in options && options.deferIndexes : false
    if (deferIndexes) {
      return
    }

    const trustMaterializedState = options
      ? 'trustMaterializedState' in options && options.trustMaterializedState
      : false
    const indexedNode = trustMaterializedState ? node : await this.getNode(node.id)
    if (indexedNode) {
      const indexProperties = options?.indexProperties ?? true
      await this.scalarIndexing.syncNode(indexedNode, indexProperties)
      await this.spatialIndexing.syncNode(indexedNode, indexProperties)
    }

    // Update FTS index for searchable content
    // This is a no-op if FTS5 is not supported (e.g., sql.js)
    const searchableProperties = indexedNode?.properties ?? node.properties
    await this.fullTextIndexing.updateNode(node.id, searchableProperties)

    await this.invalidateMaterializedViewsForSchema(node.schemaId)
  }

  async deleteNode(id: NodeId): Promise<void> {
    await this.enqueueWrite(() => this.deleteNodeInternal(id))
  }

  private async deleteNodeInternal(id: NodeId): Promise<void> {
    const existing = await this.getNode(id)
    // Delete from FTS index first (no-op if FTS5 is not supported)
    await this.fullTextIndexing.deleteNode(id)
    await this.spatialIndexing.deleteNode(id)
    // Delete node (cascades to properties via FK)
    await this.db.run(`DELETE FROM nodes WHERE id = ?`, [id])
    if (existing) {
      await this.invalidateMaterializedViewsForSchema(existing.schemaId)
    }
  }

  async listNodes(options?: ListNodesOptions): Promise<NodeState[]> {
    return this.listNodesOptimized(options)
  }

  /**
   * Optimized listNodes using a single JOIN query.
   * Fetches nodes and properties in one query for better performance with large datasets.
   */
  async listNodesOptimized(options?: ListNodesOptions): Promise<NodeState[]> {
    // Selects `p.tiebreak_key` — repair pre-v8 databases first (see getNode).
    await this.ensureNodePropertyColumns()
    // Build the base query with JOIN
    let whereClause = '1=1'
    const params: SQLValue[] = []

    if (options?.schemaId) {
      whereClause += ` AND n.schema_id = ?`
      params.push(options.schemaId)
    }

    if (!options?.includeDeleted) {
      whereClause += ` AND n.deleted_at IS NULL`
    }

    const orderBy = buildSqlOrderBy(options?.orderBy)
    const outerOrderBy = orderBy.replaceAll('n.', 'ln.')

    // Use CTE for pagination, then join properties
    let sql: string
    if (options?.limit !== undefined || options?.offset !== undefined) {
      sql = `
        WITH limited_nodes AS (
          SELECT id, schema_id, created_at, updated_at, created_by, deleted_at
          FROM nodes n
          WHERE ${whereClause}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        )
        SELECT 
          ln.id, ln.schema_id, ln.created_at, ln.updated_at, ln.created_by, ln.deleted_at,
          p.property_key, p.value, p.lamport_time, p.updated_by, p.updated_at as prop_updated_at, p.tiebreak_key,
          NULL as ordinal
        FROM limited_nodes ln
        LEFT JOIN node_properties p ON ln.id = p.node_id
        ORDER BY ${outerOrderBy}, ln.id, p.property_key
      `
      params.push(options.limit ?? -1)
      params.push(options.offset ?? 0)
    } else {
      sql = `
        SELECT 
          n.id, n.schema_id, n.created_at, n.updated_at, n.created_by, n.deleted_at,
          p.property_key, p.value, p.lamport_time, p.updated_by, p.updated_at as prop_updated_at, p.tiebreak_key,
          NULL as ordinal
        FROM nodes n
        LEFT JOIN node_properties p ON n.id = p.node_id
        WHERE ${whereClause}
        ORDER BY ${orderBy}, n.id, p.property_key
      `
    }

    const rows = await this.db.query<JoinedNodePropertyRow>(sql, params)
    return hydrateJoinedRows(rows)
  }

  async countNodes(options?: CountNodesOptions): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM nodes WHERE 1=1`
    const params: SQLValue[] = []

    if (options?.schemaId) {
      sql += ` AND schema_id = ?`
      params.push(options.schemaId)
    }

    if (!options?.includeDeleted) {
      sql += ` AND deleted_at IS NULL`
    }

    const row = await this.db.queryOne<{ count: number }>(sql, params)
    return row?.count ?? 0
  }

  async queryNodes(descriptor: NodeQueryDescriptor): Promise<NodeQueryResult> {
    const start = Date.now()
    // Every branch below hydrates via queries selecting `p.tiebreak_key` —
    // repair pre-v8 databases first (see getNode).
    await this.ensureNodePropertyColumns()
    if (descriptor.materializedView) {
      return this.queryMaterializedView(descriptor, start)
    }

    const spatialPlan = await this.spatialIndexing.prepareQueryPlan(descriptor)
    const fullTextSearchPlan = await this.fullTextIndexing.prepareQueryPlan(descriptor)
    const compiled = this.queryCompiler.compile(descriptor, spatialPlan, fullTextSearchPlan)

    if (!compiled) {
      const storageCapabilities = await this.getStorageCapabilities()
      const candidates = await this.listNodesOptimized({
        schemaId: descriptor.schemaId,
        includeDeleted: descriptor.includeDeleted
      })
      const nodes = applyNodeQueryDescriptor(candidates, descriptor)
      const result: NodeQueryResult = {
        nodes,
        totalCount: applyNodeQueryDescriptor(candidates, withoutNodeQueryPagination(descriptor))
          .length,
        plan: {
          strategy: 'list-fallback',
          candidateNodeCount: candidates.length,
          hydratedNodeCount: candidates.length,
          returnedNodeCount: nodes.length,
          durationMs: Date.now() - start,
          postFilterReason: 'unsupported-descriptor',
          storageCapabilities
        }
      }
      const telemetry = await this.recordQueryTelemetry(descriptor, result, [])
      result.plan.descriptorHash = telemetry.descriptorHash
      if (telemetry.adaptiveIndexNames.length > 0) {
        result.plan.adaptiveIndexNames = telemetry.adaptiveIndexNames
      }
      this.debugQueryPlan(descriptor, result)

      return result
    }

    // Fused single-RPC path (exploration 0264): candidate CTE + hydrate join
    // in one statement. The two-step id-select → hydrate remains for
    // JS-verified paths (FTS/spatial/property-sort), which need the id detour.
    const [queryDiagnostics, mainQuery] = await Promise.all([
      this.isQueryDiagnosticsEnabled()
        ? this.collectCompiledQueryDiagnostics(compiled)
        : Promise.resolve<CompiledQueryDiagnostics>({}),
      compiled.fused
        ? timeQuery<JoinedNodePropertyRow>(this.db, compiled.fused.sql, compiled.fused.params)
        : timeQuery<{ id: string }>(this.db, compiled.sql, compiled.params)
    ])

    let candidates: NodeState[]
    let candidateCount: number
    let fusedExactCount: number | undefined
    if (compiled.fused) {
      const rows = mainQuery.result as Array<JoinedNodePropertyRow | AggregatedNodeRow>
      candidates = this.aggregatedHydration
        ? hydrateAggregatedRows(rows as AggregatedNodeRow[])
        : hydrateJoinedRows(rows as JoinedNodePropertyRow[])
      candidateCount = candidates.length
      if (compiled.fused.includesExactCount && rows.length > 0) {
        fusedExactCount = Number(rows[0].total_count ?? 0)
      }
    } else {
      const ids = (mainQuery.result as Array<{ id: string }>).map((row) => row.id)
      candidates = await hydrateNodesByIds(this.db, ids, this.aggregatedHydration)
      candidateCount = ids.length
    }
    const nodes = applyNodeQueryDescriptor(candidates, compiled.postFilterDescriptor)
    // Only pay a separate `COUNT(*)` when the caller explicitly asks for an
    // exact total AND the fused window couldn't provide it (zero-row page —
    // the window needs at least one row to ride on). Default/`none`/
    // `estimate` reads leave `totalCount` undefined and the bridge derives a
    // cheap value (candidate count / overfetch; exploration 0184). When the
    // query isn't SQL-paginated every matching row is already in memory, so
    // its count is free and exact regardless of mode.
    const totalCount = compiled.sqlPagination
      ? descriptor.count === 'exact'
        ? (fusedExactCount ??
          (candidateCount === 0 && (descriptor.offset ?? 0) === 0
            ? 0
            : await this.countCompiledNodeQuery(descriptor, spatialPlan, fullTextSearchPlan)))
        : undefined
      : applyNodeQueryDescriptor(
          candidates,
          withoutNodeQueryPagination(compiled.postFilterDescriptor)
        ).length
    const candidateAccelerators = [
      ...(compiled.fullTextSearchQuery ? ['fts'] : []),
      ...(compiled.spatialIndexKey ? ['rtree'] : [])
    ]
    const result: NodeQueryResult = {
      nodes,
      totalCount,
      plan: {
        strategy: 'storage-query',
        candidateNodeCount: candidateCount,
        hydratedNodeCount: candidates.length,
        returnedNodeCount: nodes.length,
        durationMs: Date.now() - start,
        sql: compiled.fused ? compiled.fused.sql : compiled.sql,
        params: compiled.fused ? compiled.fused.params : compiled.params,
        postFilterReason: compiled.postFilterReason,
        candidateQueryDurationMs: mainQuery.durationMs,
        ...(candidateAccelerators.length > 0
          ? {
              candidateAccelerators
            }
          : {}),
        ...(compiled.spatialIndexKey ? { spatialIndexKey: compiled.spatialIndexKey } : {}),
        ...(compiled.fullTextSearchQuery
          ? { fullTextSearchQuery: compiled.fullTextSearchQuery }
          : {}),
        ...queryDiagnostics
      }
    }
    result.plan.parityCheck = await this.auditQueryParity(descriptor, result)
    const telemetry = await this.recordQueryTelemetry(
      descriptor,
      result,
      compiled.adaptiveIndexHints
    )
    result.plan.descriptorHash = telemetry.descriptorHash
    if (telemetry.adaptiveIndexNames.length > 0) {
      result.plan.adaptiveIndexNames = telemetry.adaptiveIndexNames
    }
    this.debugQueryPlan(descriptor, result)

    return result
  }

  // ─── Sync State ───────────────────────────────────────────────────────────

  async getLastLamportTime(): Promise<number> {
    const row = await this.db.queryOne<{ value: string }>(
      `SELECT value FROM sync_state WHERE key = 'lastLamportTime'`
    )

    return row ? parseInt(row.value, 10) : 0
  }

  async setLastLamportTime(time: number): Promise<void> {
    await this.enqueueWrite(() => this.setLastLamportTimeInternal(time))
  }

  private async setLastLamportTimeInternal(time: number): Promise<void> {
    await this.db.run(
      `INSERT INTO sync_state (key, value) VALUES ('lastLamportTime', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(time)]
    )
  }

  private syncCursorKey(room: string): string {
    return `nodeSync:hwm:${room}`
  }

  async getSyncCursor(room: string): Promise<number> {
    const row = await this.db.queryOne<{ value: string }>(
      `SELECT value FROM sync_state WHERE key = ?`,
      [this.syncCursorKey(room)]
    )
    return row ? parseInt(row.value, 10) || 0 : 0
  }

  /**
   * The lowest confirmed-durable sync cursor across every node-change room
   * (`MIN` over the persisted `nodeSync:hwm:*` marks), or `null` when no room has
   * ever confirmed. This is the safe compaction floor (exploration 0254): the
   * hub durably holds every change at or below it. Returns `null` — never 0 — so
   * a workspace that has never synced is left untouched.
   */
  async getMinConfirmedSyncCursor(): Promise<number | null> {
    const row = await this.db.queryOne<{ min_value: number | null }>(
      `SELECT MIN(CAST(value AS INTEGER)) AS min_value
         FROM sync_state WHERE key LIKE 'nodeSync:hwm:%'`
    )
    const value = row?.min_value
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
  }

  async setSyncCursor(room: string, lamport: number): Promise<void> {
    // Monotonic: never move the confirmed cursor backwards (the cursor tracks
    // what the hub durably holds; a lower value would re-replay).
    await this.enqueueWrite(async () => {
      await this.db.run(
        `INSERT INTO sync_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value
         WHERE CAST(excluded.value AS INTEGER) > CAST(sync_state.value AS INTEGER)`,
        [this.syncCursorKey(room), String(lamport)]
      )
    })
  }

  // ─── App State (generic K/V, FK-free) ─────────────────────────────────────

  /** Namespace app-state keys so they can't collide with sync cursors. */
  private appStateKey(key: string): string {
    return `app:${key}`
  }

  async getAppState(key: string): Promise<string | null> {
    const row = await this.db.queryOne<{ value: string }>(
      `SELECT value FROM sync_state WHERE key = ?`,
      [this.appStateKey(key)]
    )
    return row ? row.value : null
  }

  async setAppState(key: string, value: string): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.db.run(
        `INSERT INTO sync_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [this.appStateKey(key), value]
      )
    })
  }

  // ─── Document Content (Yjs) ───────────────────────────────────────────────

  async getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null> {
    const row = await this.db.queryOne<{ state: Uint8Array }>(
      `SELECT state FROM yjs_state WHERE node_id = ?`,
      [nodeId]
    )

    return row?.state ?? null
  }

  async setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void> {
    await this.enqueueWrite(() => this.setDocumentContentInternal(nodeId, content))
  }

  private async setDocumentContentInternal(nodeId: NodeId, content: Uint8Array): Promise<void> {
    await this.db.run(
      `INSERT INTO yjs_state (node_id, state, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at`,
      [nodeId, content, Date.now()]
    )
  }

  // ─── Pin Registry (exploration 0329) ──────────────────────────────────────

  readonly pins: PinRegistry = {
    addPins: async (pins: readonly PinEntry[]): Promise<void> => {
      if (pins.length === 0) return
      await this.enqueueWrite(async () => {
        const now = Date.now()
        for (const chunk of chunkItems(pins, 200)) {
          const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ')
          const params: unknown[] = []
          for (const pin of chunk) params.push(pin.key, pin.ownerId, pin.reason, now)
          await this.db.run(
            `INSERT INTO pinned_changes (pin_key, owner_id, reason, created_at)
             VALUES ${placeholders}
             ON CONFLICT(pin_key, owner_id) DO NOTHING`,
            params
          )
        }
      })
    },
    removePinsByOwner: async (ownerId: string): Promise<void> => {
      await this.enqueueWrite(async () => {
        await this.db.run(`DELETE FROM pinned_changes WHERE owner_id = ?`, [ownerId])
      })
    },
    getPinnedKeysAmong: async (keys: readonly string[]): Promise<Set<string>> => {
      const pinned = new Set<string>()
      for (const chunk of chunkItems(keys, 500)) {
        const placeholders = chunk.map(() => '?').join(', ')
        const rows = await this.db.query<{ pin_key: string }>(
          `SELECT DISTINCT pin_key FROM pinned_changes WHERE pin_key IN (${placeholders})`,
          [...chunk]
        )
        for (const row of rows) pinned.add(row.pin_key)
      }
      return pinned
    },
    countPins: async (): Promise<number> => {
      const row = await this.db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM pinned_changes`
      )
      return row?.n ?? 0
    }
  }

  // ─── Yjs Snapshots (Extended) ─────────────────────────────────────────────

  /**
   * Save a Yjs snapshot for time travel.
   */
  async saveYjsSnapshot(snapshot: {
    nodeId: NodeId
    timestamp: number
    snapshot: Uint8Array
    docState: Uint8Array
    byteSize: number
  }): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.db.run(
        `INSERT INTO yjs_snapshots (node_id, timestamp, snapshot, doc_state, byte_size)
         VALUES (?, ?, ?, ?, ?)`,
        [
          snapshot.nodeId,
          snapshot.timestamp,
          snapshot.snapshot,
          snapshot.docState,
          snapshot.byteSize
        ]
      )
    })
  }

  /**
   * Get Yjs snapshots for a node.
   */
  async getYjsSnapshots(nodeId: NodeId): Promise<
    Array<{
      nodeId: NodeId
      timestamp: number
      snapshot: Uint8Array
      docState: Uint8Array
      byteSize: number
    }>
  > {
    const rows = await this.db.query<{
      node_id: string
      timestamp: number
      snapshot: Uint8Array
      doc_state: Uint8Array
      byte_size: number
    }>(`SELECT * FROM yjs_snapshots WHERE node_id = ? ORDER BY timestamp ASC`, [nodeId])

    return rows.map((row) => ({
      nodeId: row.node_id,
      timestamp: row.timestamp,
      snapshot: row.snapshot,
      docState: row.doc_state,
      byteSize: row.byte_size
    }))
  }

  /**
   * Delete Yjs snapshots for a node.
   */
  async deleteYjsSnapshots(nodeId: NodeId): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.db.run(`DELETE FROM yjs_snapshots WHERE node_id = ?`, [nodeId])
    })
  }

  // ─── Bulk Operations ──────────────────────────────────────────────────────

  /**
   * Import multiple nodes in a single transaction.
   * Used for sync and restore operations.
   */
  async importNodes(nodes: readonly NodeState[], options?: ImportNodesOptions): Promise<void> {
    if (nodes.length === 0) return

    await this.enqueueWrite(async () => {
      if (await this.canImportNodesWithTransactionBatch(options)) {
        await this.importNodesWithTransactionBatch(nodes, options)
        return
      }

      // Use manual transaction control for web proxy compatibility
      await this.db.beginTransaction()
      try {
        await this.importNodesInternal(nodes, options)
        await this.db.commit()
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })
  }

  async applyNodeBatch(input: ApplyNodeBatchInput): Promise<ApplyNodeBatchResult> {
    if (input.nodes.length === 0 && input.changes.length === 0) {
      return {
        nodeRowsWritten: 0,
        propertyRowsWritten: 0,
        changeRowsWritten: 0,
        scalarRowsWritten: 0,
        ftsRowsWritten: 0
      }
    }

    return this.enqueueWrite(async () => {
      const effectiveInput = await this.resolveApplyNodeBatchInput(input)

      if (await this.canApplyNodeBatchWithTypedAdapterCommand(effectiveInput)) {
        return this.applyNodeBatchWithTypedAdapterCommand(effectiveInput)
      }

      if (await this.canApplyNodeBatchWithTransactionBatch(effectiveInput)) {
        return this.applyNodeBatchWithTransactionBatch(effectiveInput)
      }

      await this.db.beginTransaction()
      try {
        const result = await this.applyNodeBatchInternal(effectiveInput)
        await this.db.commit()
        return result
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })
  }

  getOperationStats(): Promise<SQLiteOperationStats | null> | SQLiteOperationStats | null {
    return this.db.getOperationStats?.() ?? null
  }

  resetOperationStats(): Promise<void> | void {
    return this.db.resetOperationStats?.()
  }

  private async resolveApplyNodeBatchInput(
    input: ApplyNodeBatchInput
  ): Promise<ApplyNodeBatchInput> {
    if (input.indexMode !== 'touched') {
      return input
    }

    // Spatial indexes still need their existing eager per-node path until they
    // get a touched-node batch writer. Social import schemas do not use spatial
    // indexes, so this preserves correctness without blocking the common path.
    if (await this.spatialIndexing.hasTables()) {
      return { ...input, indexMode: 'eager' }
    }

    return input
  }

  private async canApplyNodeBatchWithTransactionBatch(
    input: ApplyNodeBatchInput
  ): Promise<boolean> {
    if (!this.db.transactionBatch) return false
    if (input.indexMode === 'eager') return false
    if (await this.spatialIndexing.hasTables()) return false
    return true
  }

  private async canApplyNodeBatchWithTypedAdapterCommand(
    input: ApplyNodeBatchInput
  ): Promise<boolean> {
    if (!this.db.applyNodeBatch) return false
    if (input.indexMode === 'eager') return false
    if (await this.spatialIndexing.hasTables()) return false
    return true
  }

  private async applyNodeBatchWithTypedAdapterCommand(
    input: ApplyNodeBatchInput
  ): Promise<ApplyNodeBatchResult> {
    if (!this.db.applyNodeBatch) {
      throw new Error('SQLite typed node batch apply is not available.')
    }

    return this.db.applyNodeBatch(await this.createSQLiteNodeBatchApplyInput(input))
  }

  private async createSQLiteNodeBatchApplyInput(
    input: ApplyNodeBatchInput
  ): Promise<SQLiteNodeBatchApplyInput> {
    const indexProperties = input.indexProperties ?? true
    const hasFullTextSearch =
      input.indexMode !== 'defer-schema' && (await this.fullTextIndexing.hasTable())
    const scalarIndexRows: SQLiteNodeBatchApplyInput['scalarIndexRows'] = []
    const ftsNodeIds: string[] = []
    const ftsRows: SQLiteNodeBatchApplyInput['ftsRows'] = []

    if (input.indexMode !== 'defer-schema' && indexProperties) {
      for (const node of input.nodes) {
        for (const [key, value] of Object.entries(node.properties)) {
          const timestamp = node.timestamps[key]
          const scalar = toScalarIndexValue(value)
          if (!timestamp || !scalar) continue

          scalarIndexRows.push({
            nodeId: node.id,
            schemaId: node.schemaId,
            propertyKey: key,
            valueType: scalar.valueType,
            valueText: scalar.valueText,
            valueNumber: scalar.valueNumber,
            valueBoolean: scalar.valueBoolean,
            valueHash: scalar.valueHash,
            updatedAt: timestamp.wallTime,
            lamportTime: timestamp.lamport
          })
        }
      }
    }

    if (hasFullTextSearch) {
      for (const node of input.nodes) {
        ftsNodeIds.push(node.id)
        if (node.deleted) continue

        const title = typeof node.properties.title === 'string' ? node.properties.title : ''
        const content = extractSearchableContent(node.properties) ?? ''
        if (!title && !content) continue

        ftsRows.push({
          nodeId: node.id,
          title,
          content
        })
      }
    }

    return {
      nodes: input.nodes.map((node) => ({
        id: node.id,
        schemaId: node.schemaId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        createdBy: node.createdBy,
        deletedAt: node.deleted && node.deletedAt ? node.deletedAt.wallTime : null,
        propertyKeys: Object.keys(node.properties)
      })),
      properties: input.nodes.flatMap((node) =>
        Object.entries(node.properties).flatMap(([key, value]) => {
          const timestamp = node.timestamps[key]
          if (!timestamp) return []

          return [
            {
              nodeId: node.id,
              propertyKey: key,
              value: this.serializeValue(value),
              lamportTime: timestamp.lamport,
              updatedBy: timestamp.author,
              updatedAt: timestamp.wallTime
            }
          ]
        })
      ),
      changes: input.changes.map((change) => ({
        hash: change.hash,
        nodeId: change.payload.nodeId,
        payload: this.serializeChangeRecord(change),
        lamportTime: change.lamport,
        lamportPeer: change.authorDID,
        wallTime: change.wallTime,
        author: change.authorDID,
        parentHash: change.parentHash ?? null,
        batchId: change.batchId ?? null,
        signature: change.signature
      })),
      scalarIndexRows,
      ftsNodeIds,
      ftsRows,
      affectedSchemaIds: Array.from(new Set(input.affectedSchemaIds)),
      lastLamportTime: input.lastLamportTime,
      indexMode: input.indexMode
    }
  }

  private async applyNodeBatchWithTransactionBatch(
    input: ApplyNodeBatchInput
  ): Promise<ApplyNodeBatchResult> {
    if (!this.db.transactionBatch) {
      throw new Error('SQLite transactionBatch is not available.')
    }

    const indexProperties = input.indexProperties ?? true
    const operations: Array<{ sql: string; params?: SQLValue[] }> = []
    const hasFullTextSearch =
      input.indexMode === 'touched' && (await this.fullTextIndexing.hasTable())
    const affectedSchemaIds = new Set(input.affectedSchemaIds)
    let scalarRowsWritten = 0
    let ftsRowsWritten = 0

    for (const node of input.nodes) {
      affectedSchemaIds.add(node.schemaId)
      operations.push(
        ...this.createImportNodeOperationsForIndexMode(
          node,
          indexProperties,
          hasFullTextSearch,
          input.indexMode
        )
      )
      if (input.indexMode === 'touched' && indexProperties) {
        scalarRowsWritten += this.scalarIndexing.countIndexRowsForNode(node)
      }
      if (
        input.indexMode === 'touched' &&
        hasFullTextSearch &&
        this.fullTextIndexing.hasSearchableContent(node)
      ) {
        ftsRowsWritten += 1
      }
    }

    operations.push(...input.changes.map((change) => this.createAppendChangeOperation(change)))
    operations.push(this.createSetLastLamportTimeOperation(input.lastLamportTime))

    if (input.indexMode !== 'defer-schema') {
      for (const schemaId of affectedSchemaIds) {
        operations.push(this.createInvalidateMaterializedViewsOperation(schemaId))
      }
    }

    await this.db.transactionBatch(operations)

    return {
      nodeRowsWritten: input.nodes.length,
      propertyRowsWritten: countPropertyRows(input.nodes),
      changeRowsWritten: input.changes.length,
      scalarRowsWritten,
      ftsRowsWritten
    }
  }

  private async applyNodeBatchInternal(input: ApplyNodeBatchInput): Promise<ApplyNodeBatchResult> {
    const indexProperties = input.indexProperties ?? true
    const eagerIndexes = input.indexMode === 'eager'

    await this.importNodesInternal(input.nodes, {
      indexProperties,
      trustMaterializedState: true,
      deferIndexes: !eagerIndexes
    })
    await this.appendChangesInternal(input.changes)
    await this.setLastLamportTimeInternal(input.lastLamportTime)

    let scalarRowsWritten = 0
    let ftsRowsWritten = 0
    if (input.indexMode === 'touched') {
      const touchedIndexResult = await this.syncTouchedIndexesForNodes(input.nodes, indexProperties)
      scalarRowsWritten = touchedIndexResult.scalarRowsWritten
      ftsRowsWritten = touchedIndexResult.ftsRowsWritten

      for (const schemaId of new Set(input.affectedSchemaIds)) {
        await this.invalidateMaterializedViewsForSchema(schemaId)
      }
    }

    return {
      nodeRowsWritten: input.nodes.length,
      propertyRowsWritten: countPropertyRows(input.nodes),
      changeRowsWritten: input.changes.length,
      scalarRowsWritten,
      ftsRowsWritten
    }
  }

  private async importNodesInternal(
    nodes: readonly NodeState[],
    options?: ImportNodesOptions
  ): Promise<void> {
    for (const node of nodes) {
      await this._setNodeInternal(node, options)
    }
  }

  private async canImportNodesWithTransactionBatch(options?: ImportNodesOptions): Promise<boolean> {
    if (!this.db.transactionBatch) return false
    if (options?.trustMaterializedState !== true) return false
    if (options?.deferIndexes === true) return false

    return !(await this.spatialIndexing.hasTables())
  }

  private async importNodesWithTransactionBatch(
    nodes: readonly NodeState[],
    options?: ImportNodesOptions
  ): Promise<void> {
    if (!this.db.transactionBatch) {
      throw new Error('SQLite transactionBatch is not available.')
    }

    await this.ensureNodePropertyColumns()
    const operations: Array<{ sql: string; params?: SQLValue[] }> = []
    const indexProperties = options?.indexProperties ?? true
    const hasFullTextSearch = await this.fullTextIndexing.hasTable()
    const affectedSchemaIds = new Set<SchemaIRI>()

    for (const node of nodes) {
      affectedSchemaIds.add(node.schemaId)
      operations.push(...this.createImportNodeOperations(node, indexProperties, hasFullTextSearch))
    }

    for (const schemaId of affectedSchemaIds) {
      operations.push({
        sql: `UPDATE node_query_materializations
              SET invalidated_at = ?
              WHERE schema_id = ? AND invalidated_at IS NULL`,
        params: [Date.now(), schemaId]
      })
    }

    await this.db.transactionBatch(operations)
  }

  private createImportNodeOperations(
    node: NodeState,
    indexProperties: boolean,
    hasFullTextSearch: boolean
  ): Array<{ sql: string; params?: SQLValue[] }> {
    return this.createImportNodeOperationsForIndexMode(
      node,
      indexProperties,
      hasFullTextSearch,
      'eager'
    )
  }

  private createImportNodeOperationsForIndexMode(
    node: NodeState,
    indexProperties: boolean,
    hasFullTextSearch: boolean,
    indexMode: ApplyNodeBatchInput['indexMode']
  ): Array<{ sql: string; params?: SQLValue[] }> {
    const operations: Array<{ sql: string; params?: SQLValue[] }> = [
      {
        sql: `INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                schema_id = excluded.schema_id,
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at`,
        params: [
          node.id,
          node.schemaId,
          node.createdAt,
          node.updatedAt,
          node.createdBy,
          node.deleted && node.deletedAt ? node.deletedAt.wallTime : null
        ]
      },
      createDeleteRemovedPropertiesOperation(node)
    ]

    for (const [key, value] of Object.entries(node.properties)) {
      const timestamp = node.timestamps[key]
      if (!timestamp) continue

      operations.push({
        // Full LWW ordering chain — keep in lockstep with the setNode
        // upsert above and `shouldReplace` in ./store.ts (0272/0305).
        sql: `INSERT INTO node_properties
                (node_id, property_key, value, lamport_time, updated_by, updated_at, tiebreak_key)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(node_id, property_key) DO UPDATE SET
                value = excluded.value,
                lamport_time = excluded.lamport_time,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at,
                tiebreak_key = excluded.tiebreak_key
              WHERE ${NODE_PROPERTIES_LWW_GUARD}`,
        params: [
          node.id,
          key,
          this.serializeValue(value),
          timestamp.lamport,
          timestamp.author,
          timestamp.wallTime,
          timestamp.tiebreakKey ?? null
        ]
      })
    }

    if (indexMode !== 'defer-schema') {
      operations.push({
        sql: 'DELETE FROM node_property_scalars WHERE node_id = ?',
        params: [node.id]
      })
      if (indexProperties) {
        operations.push(...this.scalarIndexing.createNodeOperations(node))
      }
      if (hasFullTextSearch) {
        operations.push(...this.fullTextIndexing.createNodeOperations(node))
      }
    }

    return operations
  }

  private createAppendChangeOperation(change: NodeChange): { sql: string; params?: SQLValue[] } {
    return {
      sql: `INSERT OR IGNORE INTO changes
            (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        change.hash,
        change.payload.nodeId,
        this.serializeChangeRecord(change),
        change.lamport,
        change.authorDID,
        change.wallTime,
        change.authorDID,
        change.parentHash ?? null,
        change.batchId ?? null,
        change.signature
      ]
    }
  }

  private createSetLastLamportTimeOperation(time: number): { sql: string; params?: SQLValue[] } {
    return {
      sql: `INSERT INTO sync_state (key, value) VALUES ('lastLamportTime', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      params: [String(time)]
    }
  }

  private createInvalidateMaterializedViewsOperation(schemaId: SchemaIRI): {
    sql: string
    params?: SQLValue[]
  } {
    return {
      sql: `UPDATE node_query_materializations
            SET invalidated_at = ?
            WHERE schema_id = ? AND invalidated_at IS NULL`,
      params: [Date.now(), schemaId]
    }
  }

  private async syncTouchedIndexesForNodes(
    nodes: readonly NodeState[],
    indexProperties: boolean
  ): Promise<{ scalarRowsWritten: number; ftsRowsWritten: number }> {
    let scalarRowsWritten = 0
    let ftsRowsWritten = 0

    for (const node of nodes) {
      scalarRowsWritten += await this.scalarIndexing.syncNode(node, indexProperties)
      ftsRowsWritten += await this.fullTextIndexing.syncNode(node, indexProperties)
    }

    return { scalarRowsWritten, ftsRowsWritten }
  }

  /**
   * Refresh the full query-planner statistics (`ANALYZE`). Call after a bulk
   * import: SQLite does not auto-maintain stats, so a large insert leaves the
   * planner "out of sync" and reads can pick full scans over indexes
   * (exploration 0184). Best-effort — never throws into the caller.
   */
  async analyze(): Promise<void> {
    try {
      await this.db.exec('ANALYZE')
    } catch {
      // ANALYZE is an optimization, never correctness-critical.
    }
  }

  /**
   * Incremental planner maintenance (`PRAGMA optimize`) — only ANALYZEs tables
   * whose row counts have drifted. Cheap; safe to call at idle / before close.
   */
  async optimize(): Promise<void> {
    try {
      await this.db.exec('PRAGMA optimize')
    } catch {
      // best-effort
    }
  }

  async rebuildIndexesForSchemas(
    schemaIds: readonly SchemaIRI[],
    options?: RebuildNodeIndexesOptions
  ): Promise<void> {
    if (schemaIds.length === 0) return

    await this.enqueueWrite(async () => {
      await this.db.beginTransaction()
      try {
        await this.rebuildIndexesForSchemasInternal(schemaIds, options)
        await this.db.commit()
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })
  }

  private async rebuildIndexesForSchemasInternal(
    schemaIds: readonly SchemaIRI[],
    options?: RebuildNodeIndexesOptions
  ): Promise<void> {
    const uniqueSchemaIds = Array.from(new Set(schemaIds.filter(Boolean)))
    if (uniqueSchemaIds.length === 0) return

    const nodesBySchemaId = new Map<SchemaIRI, NodeState[]>()
    for (const schemaId of uniqueSchemaIds) {
      nodesBySchemaId.set(
        schemaId,
        await this.listNodesOptimized({ schemaId, includeDeleted: true })
      )
    }

    const indexProperties = options?.indexProperties ?? true
    await this.scalarIndexing.rebuildForSchemas(uniqueSchemaIds, nodesBySchemaId, indexProperties)
    await this.spatialIndexing.rebuildForSchemas(uniqueSchemaIds, nodesBySchemaId, indexProperties)
    await this.fullTextIndexing.rebuildForSchemas(uniqueSchemaIds, nodesBySchemaId, indexProperties)

    for (const schemaId of uniqueSchemaIds) {
      await this.invalidateMaterializedViewsForSchema(schemaId)
    }
  }

  /**
   * Rebuild the scalar sidecar from materialized node_properties.
   */
  async rebuildScalarIndex(): Promise<{ nodesScanned: number; scalarRowsWritten: number }> {
    return this.enqueueWrite(async () => {
      await this.db.beginTransaction()
      try {
        const result = await this.scalarIndexing.rebuildAll()
        await this.db.commit()
        return result
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })
  }

  /**
   * Import multiple changes in a single transaction.
   */
  async importChanges(changes: readonly NodeChange[]): Promise<void> {
    await this.appendChanges(changes)
  }

  /**
   * Clear all data (for testing or reset).
   */
  async clear(): Promise<void> {
    await this.enqueueWrite(async () => {
      // Use manual transaction control for web proxy compatibility
      await this.db.beginTransaction()
      try {
        await this.db.run('DELETE FROM yjs_snapshots')
        await this.db.run('DELETE FROM yjs_updates')
        await this.db.run('DELETE FROM yjs_state')
        await this.db.run('DELETE FROM changes')
        await this.spatialIndexing.clear()
        await this.clearMaterializedViewRows()
        await this.scalarIndexing.clear()
        await this.db.run('DELETE FROM node_properties')
        await this.db.run('DELETE FROM nodes')
        await this.db.run("DELETE FROM sync_state WHERE key = 'lastLamportTime'")
        await this.db.commit()
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Read (or refresh) a materialized view.
   *
   * A materialized view is a purely LOCAL, DERIVED cache: an ordered list of
   * node ids (membership + order) plus bookkeeping. It is NEVER part of the
   * change log and is NEVER synced — peers each derive their own. It therefore
   * carries no authority and can be rebuilt or dropped at any time (a wiped
   * cache only costs a recompute, never data). Content is re-hydrated from the
   * live `nodes`/`node_properties` tables on every read, so the cache exposes
   * nothing the underlying tables don't already, and a write to the schema
   * (`invalidated_at`) or a grant change (`auth_fingerprint`) forces a
   * re-materialization. See exploration 0226.
   */
  private async queryMaterializedView(
    descriptor: NodeQueryDescriptor,
    start: number
  ): Promise<NodeQueryResult> {
    const materializedView = descriptor.materializedView
    if (!materializedView) {
      throw new Error('Materialized view query requires descriptor.materializedView')
    }

    await this.ensureMaterializationColumns()

    const authFingerprint = descriptor.authFingerprint ?? null
    const baseDescriptor = withoutNodeQueryMaterializedView(withoutNodeQueryPagination(descriptor))
    const descriptorJson = stringifyStable(baseDescriptor)
    const descriptorHash = hashScalarValue(descriptorJson)
    const cached = await this.getMaterializedView(materializedView.viewId)
    const cacheExpired =
      materializedView.maxAgeMs !== undefined &&
      cached !== null &&
      Date.now() - cached.generated_at > materializedView.maxAgeMs
    const refreshReason = getMaterializedQueryRefreshReason({
      cached,
      descriptorHash,
      authFingerprint,
      cacheExpired,
      forceRefresh: materializedView.forceRefresh ?? false
    })
    const canUseCache =
      cached !== null &&
      cached.descriptor_hash === descriptorHash &&
      (cached.auth_fingerprint ?? null) === authFingerprint &&
      cached.invalidated_at === null &&
      !cacheExpired &&
      !materializedView.forceRefresh
    const readPlan = canUseCache
      ? {
          viewId: materializedView.viewId,
          descriptorHash,
          generatedAt: cached.generated_at,
          invalidatedAt: cached.invalidated_at,
          rowCount: cached.row_count,
          cacheHit: true
        }
      : await this.refreshMaterializedView({
          viewId: materializedView.viewId,
          descriptor: baseDescriptor,
          descriptorHash,
          descriptorJson,
          authFingerprint,
          refreshReason: refreshReason ?? 'missing',
          invalidatedAt: cached?.invalidated_at ?? null
        })

    const result = await this.readMaterializedViewPage(descriptor, readPlan, start)
    result.plan.parityCheck = await this.auditQueryParity(descriptor, result)

    return result
  }

  private async getMaterializedView(viewId: string): Promise<MaterializedQueryRow | null> {
    return this.db.queryOne<MaterializedQueryRow>(
      `SELECT
         view_id,
         descriptor_hash,
         schema_id,
         descriptor_json,
         generated_at,
         invalidated_at,
         row_count,
         auth_fingerprint
       FROM node_query_materializations
       WHERE view_id = ?`,
      [viewId]
    )
  }

  /**
   * Ensure the `auth_fingerprint` column exists. Fresh databases get it from
   * the DDL; databases upgraded in place (the runtime applies the full DDL with
   * `CREATE TABLE IF NOT EXISTS`, which cannot add a column) need this guard.
   * Idempotent and memoized (exploration 0226).
   */
  private async ensureMaterializationColumns(): Promise<void> {
    if (this.materializationColumnsReady) return
    try {
      const columns = await this.db.query<{ name: string }>(
        `PRAGMA table_info(node_query_materializations)`
      )
      const hasColumn = columns.some((column) => column.name === 'auth_fingerprint')
      if (!hasColumn) {
        await this.db.run(
          'ALTER TABLE node_query_materializations ADD COLUMN auth_fingerprint TEXT'
        )
      }
    } catch {
      // A concurrent ALTER (duplicate column) or absent table is non-fatal:
      // a missing column surfaces as a refresh, never a leak.
    }
    this.materializationColumnsReady = true
  }

  /**
   * Ensure the `node_properties.tiebreak_key` column exists (exploration 0305).
   * Fresh databases get it from the DDL; databases created before schema v8 need
   * this in-place add so the grinding-resistant LWW guard has a column to
   * compare. Idempotent, memoized, and non-fatal on races — a legacy NULL key
   * just falls back to the author-DID tiebreak.
   */
  private async ensureNodePropertyColumns(): Promise<void> {
    // Shared in-flight promise (not a boolean like the materialization guard):
    // this runs on the read path too, where boot fires many concurrent
    // hydrates — they must all wait on ONE repair, not each race a PRAGMA.
    this.nodePropertyColumnsReady ??= (async () => {
      try {
        const columns = await this.db.query<{ name: string }>(`PRAGMA table_info(node_properties)`)
        if (!columns.some((column) => column.name === 'tiebreak_key')) {
          await this.db.run('ALTER TABLE node_properties ADD COLUMN tiebreak_key TEXT')
        }
      } catch {
        // A concurrent ALTER (duplicate column) or absent table is non-fatal.
      }
    })()
    return this.nodePropertyColumnsReady
  }

  setNodeReadAuthorizer(authorizer: NodeReadAuthorizer | undefined): void {
    this.nodeReadAuthorizer = authorizer
  }

  /**
   * Reload-stable version of the authorization-relevant control-plane state:
   * grants (`Grant` schema) and per-subject `/sys/authz/` resources. Ordinary
   * data writes do not touch these, so a database's materialized views survive
   * reloads and edits, but any grant change shifts `count`/`maxUpdatedAt` and
   * forces an `'authz-changed'` refresh (exploration 0226).
   */
  async getAuthorizationStateVersion(): Promise<AuthorizationStateVersion> {
    const grantIri = SYSTEM_SCHEMA_BASE_IRIS.Grant
    const row = await this.db.queryOne<{ count: number; max_updated_at: number }>(
      `SELECT COUNT(*) AS count, COALESCE(MAX(updated_at), 0) AS max_updated_at
       FROM nodes
       WHERE schema_id = ?
          OR schema_id LIKE ?
          OR id LIKE 'xnet://%/sys/authz/%'`,
      [grantIri, `${grantIri}@%`]
    )
    return {
      count: row?.count ?? 0,
      maxUpdatedAt: row?.max_updated_at ?? 0
    }
  }

  private async refreshMaterializedView(input: {
    viewId: string
    descriptor: NodeQueryDescriptor
    descriptorHash: string
    descriptorJson: string
    authFingerprint: string | null
    refreshReason: MaterializedQueryRefreshReason
    invalidatedAt: number | null
  }): Promise<MaterializedQueryReadPlan> {
    const refreshed = await this.queryNodes(input.descriptor)
    // Authorize the result ONCE, at materialization time, so cache hits can be
    // served from the persisted id list without per-row re-checks. The
    // fingerprint forces a re-materialization when grants change
    // (exploration 0226). Authorization only ever removes rows.
    const authorizedNodes = this.nodeReadAuthorizer
      ? await this.nodeReadAuthorizer(refreshed.nodes)
      : refreshed.nodes
    const generatedAt = Date.now()

    await this.enqueueWrite(async () => {
      await this.db.beginTransaction()
      try {
        await this.db.run('DELETE FROM node_query_materialized_ids WHERE view_id = ?', [
          input.viewId
        ])
        await this.db.run(
          `INSERT INTO node_query_materializations
            (
              view_id,
              descriptor_hash,
              schema_id,
              descriptor_json,
              generated_at,
              invalidated_at,
              row_count,
              auth_fingerprint
            )
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
           ON CONFLICT(view_id) DO UPDATE SET
             descriptor_hash = excluded.descriptor_hash,
             schema_id = excluded.schema_id,
             descriptor_json = excluded.descriptor_json,
             generated_at = excluded.generated_at,
             invalidated_at = NULL,
             row_count = excluded.row_count,
             auth_fingerprint = excluded.auth_fingerprint`,
          [
            input.viewId,
            input.descriptorHash,
            input.descriptor.schemaId,
            input.descriptorJson,
            generatedAt,
            authorizedNodes.length,
            input.authFingerprint
          ]
        )

        for (const [ordinal, node] of authorizedNodes.entries()) {
          await this.db.run(
            `INSERT INTO node_query_materialized_ids (view_id, ordinal, node_id)
             VALUES (?, ?, ?)`,
            [input.viewId, ordinal, node.id]
          )
        }

        await this.db.commit()
      } catch (err) {
        await this.db.rollback()
        throw err
      }
    })

    return {
      viewId: input.viewId,
      descriptorHash: input.descriptorHash,
      generatedAt,
      invalidatedAt: input.invalidatedAt,
      rowCount: authorizedNodes.length,
      cacheHit: false,
      refreshReason: input.refreshReason
    }
  }

  private async readMaterializedViewPage(
    descriptor: NodeQueryDescriptor,
    readPlan: MaterializedQueryReadPlan,
    start: number
  ): Promise<NodeQueryResult> {
    const sql = `
      SELECT node_id
      FROM node_query_materialized_ids
      WHERE view_id = ?
      ORDER BY ordinal ASC
      LIMIT ? OFFSET ?
    `
    const usesCursor = descriptor.after !== undefined
    const limit = usesCursor ? -1 : (descriptor.limit ?? -1)
    const offset = usesCursor ? 0 : (descriptor.offset ?? 0)
    const idRows = await this.db.query<{ node_id: string }>(sql, [readPlan.viewId, limit, offset])
    const ids = idRows.map((row) => row.node_id)
    const hydrated = await hydrateNodesByIds(this.db, ids, this.aggregatedHydration)
    const nodes = usesCursor ? applyNodeQueryDescriptor(hydrated, descriptor) : hydrated

    return {
      nodes,
      totalCount: readPlan.rowCount,
      plan: {
        strategy: 'storage-query',
        candidateNodeCount: readPlan.rowCount,
        hydratedNodeCount: nodes.length,
        returnedNodeCount: nodes.length,
        durationMs: Date.now() - start,
        sql,
        params: [readPlan.viewId, limit, offset],
        postFilterReason: readPlan.cacheHit
          ? 'materialized-view-cache-hit'
          : 'materialized-view-refreshed',
        descriptorHash: readPlan.descriptorHash,
        materializedViewId: readPlan.viewId,
        materializedCacheHit: readPlan.cacheHit,
        ...(readPlan.refreshReason ? { materializedRefreshReason: readPlan.refreshReason } : {}),
        materializedGeneratedAt: readPlan.generatedAt,
        ...(readPlan.invalidatedAt !== null
          ? { materializedInvalidatedAt: readPlan.invalidatedAt }
          : {}),
        materializedRowCount: readPlan.rowCount
      }
    }
  }

  private async invalidateMaterializedViewsForSchema(schemaId: SchemaIRI): Promise<void> {
    await this.db.run(
      `UPDATE node_query_materializations
       SET invalidated_at = ?
       WHERE schema_id = ? AND invalidated_at IS NULL`,
      [Date.now(), schemaId]
    )
  }

  private async clearMaterializedViewRows(): Promise<void> {
    await this.db.run('DELETE FROM node_query_materialized_ids')
    await this.db.run('DELETE FROM node_query_materializations')
  }

  private quoteSqlIdentifier(identifier: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
      throw new Error(`Unsafe SQLite identifier: ${identifier}`)
    }

    return `"${identifier}"`
  }

  private async recordQueryTelemetry(
    descriptor: NodeQueryDescriptor,
    result: NodeQueryResult,
    adaptiveIndexHints: AdaptiveIndexHint[]
  ): Promise<QueryTelemetry> {
    const descriptorJson = stringifyStable(descriptor)
    const descriptorHash = hashScalarValue(descriptorJson)
    const now = Date.now()
    const sample: PendingQueryTelemetry = {
      schemaId: descriptor.schemaId,
      descriptorJson,
      hits: 1,
      totalDurationMs: result.plan.durationMs,
      totalCandidates: result.plan.candidateNodeCount,
      lastSeenAt: now
    }

    if (!this.adaptiveIndexing.enabled) {
      // Buffer in memory so read queries stay write-free; the aggregate is
      // flushed periodically (and on close), preserving hit counts exactly.
      const pending = this.pendingQueryTelemetry.get(descriptorHash)
      if (pending) {
        pending.hits += 1
        pending.totalDurationMs += sample.totalDurationMs
        pending.totalCandidates += sample.totalCandidates
        pending.lastSeenAt = now
      } else {
        this.pendingQueryTelemetry.set(descriptorHash, sample)
      }
      this.pendingQueryTelemetryHits += 1
      if (this.pendingQueryTelemetryHits >= QUERY_TELEMETRY_FLUSH_THRESHOLD) {
        await this.flushQueryTelemetry()
      }

      return { descriptorHash, adaptiveIndexNames: [] }
    }

    // Adaptive indexing gates on durable hit counts (minHits), so keep the
    // per-query write when it is enabled.
    await this.writeQueryTelemetryRow(descriptorHash, sample)

    if (adaptiveIndexHints.length === 0) {
      return { descriptorHash, adaptiveIndexNames: [] }
    }

    const stats = await this.db.queryOne<QueryDescriptorStatsRow>(
      `SELECT hits, avg_duration_ms, avg_candidates
       FROM query_descriptor_stats
       WHERE descriptor_hash = ?`,
      [descriptorHash]
    )

    if (!stats || !this.shouldCreateAdaptiveIndexes(stats)) {
      return { descriptorHash, adaptiveIndexNames: [] }
    }

    // Index creation is real write work on the single serial worker — when an
    // idle scheduler is provided (the web app passes bootSettled-gated
    // scheduling), defer it off the query path (exploration 0264). The names
    // simply don't appear in THIS query's plan metadata; the index serves the
    // next one.
    if (this.scheduleMaintenance) {
      const input = {
        descriptorHash,
        schemaId: descriptor.schemaId,
        hints: adaptiveIndexHints,
        now
      }
      this.scheduleMaintenance(() =>
        this.ensureAdaptiveIndexes(input).then(
          () => undefined,
          (err) => {
            console.warn('[SQLiteNodeStorageAdapter] deferred adaptive index skipped:', err)
          }
        )
      )
      return { descriptorHash, adaptiveIndexNames: [] }
    }

    const adaptiveIndexNames = await this.ensureAdaptiveIndexes({
      descriptorHash,
      schemaId: descriptor.schemaId,
      hints: adaptiveIndexHints,
      now
    })

    return { descriptorHash, adaptiveIndexNames }
  }

  /**
   * Flush buffered query telemetry aggregates into
   * `query_descriptor_stats`. Runs automatically every
   * {@link QUERY_TELEMETRY_FLUSH_THRESHOLD} queries and on close; callers
   * that need durable stats immediately (tests, diagnostics tooling) can
   * invoke it directly.
   */
  async flushQueryTelemetry(): Promise<void> {
    if (this.pendingQueryTelemetry.size === 0) {
      return
    }

    const entries = [...this.pendingQueryTelemetry.entries()]
    this.pendingQueryTelemetry.clear()
    this.pendingQueryTelemetryHits = 0

    for (const [descriptorHash, pending] of entries) {
      await this.writeQueryTelemetryRow(descriptorHash, pending)
    }
  }

  private async writeQueryTelemetryRow(
    descriptorHash: string,
    pending: PendingQueryTelemetry
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO query_descriptor_stats
        (
          descriptor_hash,
          schema_id,
          descriptor_json,
          hits,
          total_duration_ms,
          avg_duration_ms,
          avg_candidates,
          last_seen_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(descriptor_hash) DO UPDATE SET
         schema_id = excluded.schema_id,
         descriptor_json = excluded.descriptor_json,
         hits = query_descriptor_stats.hits + excluded.hits,
         total_duration_ms =
           query_descriptor_stats.total_duration_ms + excluded.total_duration_ms,
         avg_duration_ms =
           (query_descriptor_stats.total_duration_ms + excluded.total_duration_ms) /
           (query_descriptor_stats.hits + excluded.hits),
         avg_candidates =
           ((query_descriptor_stats.avg_candidates * query_descriptor_stats.hits) +
            (excluded.avg_candidates * excluded.hits)) /
           (query_descriptor_stats.hits + excluded.hits),
         last_seen_at = excluded.last_seen_at`,
      [
        descriptorHash,
        pending.schemaId,
        pending.descriptorJson,
        pending.hits,
        pending.totalDurationMs,
        pending.totalDurationMs / pending.hits,
        pending.totalCandidates / pending.hits,
        pending.lastSeenAt
      ]
    )
  }

  private isQueryDiagnosticsEnabled(): boolean {
    return this.queryDiagnostics || this.isQueryDebugEnabled()
  }

  /**
   * Throttled: one collection per unique compiled SQL shape per session.
   * EXPLAIN plans depend on the statement, not the bound values, so keyset
   * pages of the same query share one entry. Concurrent callers share the
   * in-flight promise; failed collections are not memoized.
   */
  private collectCompiledQueryDiagnostics(
    compiled: CompiledNodeQuery
  ): Promise<CompiledQueryDiagnostics> {
    const memoKey = compiled.sql
    if (
      !this.compiledQueryDiagnosticsMemo.has(memoKey) &&
      this.compiledQueryDiagnosticsMemo.size >= COMPILED_QUERY_DIAGNOSTICS_MEMO_LIMIT
    ) {
      const oldest = this.compiledQueryDiagnosticsMemo.keys().next().value
      if (oldest !== undefined) {
        this.compiledQueryDiagnosticsMemo.delete(oldest)
      }
    }
    return singleFlight(
      this.compiledQueryDiagnosticsMemo,
      memoKey,
      () =>
        this.computeCompiledQueryDiagnostics(compiled).then((diagnostics) => {
          // Failed collections are not memoized — the next caller retries.
          if (diagnostics.diagnosticsError) {
            this.compiledQueryDiagnosticsMemo.delete(memoKey)
          }
          return diagnostics
        }),
      { retain: 'keep' }
    )
  }

  private async computeCompiledQueryDiagnostics(
    compiled: CompiledNodeQuery
  ): Promise<CompiledQueryDiagnostics> {
    try {
      const [analysis, indexes, storageCapabilities] = await Promise.all([
        analyzeQuery(this.db, compiled.sql, compiled.params),
        getIndexInfo(this.db),
        this.getStorageCapabilities()
      ])
      const adaptiveIndexCount = indexes.filter((index) =>
        index.name.startsWith('idx_auto_prop_')
      ).length

      return {
        usedIndexNames: analysis.usedIndexes,
        fullTableScan: analysis.fullTableScan,
        queryPlanDetails: analysis.plan.map((step) => step.detail),
        availableIndexCount: indexes.length,
        adaptiveIndexCount,
        storageCapabilities
      }
    } catch (err) {
      return {
        diagnosticsError: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private getStorageCapabilities(): Promise<NodeQueryStorageCapabilitiesMetadata> {
    if (this.storageCapabilitiesPromise) {
      return this.storageCapabilitiesPromise
    }

    const storageCapabilitiesPromise = detectSQLiteCapabilities(this.db).then((capabilities) => ({
      fullTextSearch: capabilities.fts5,
      rtree: capabilities.rtree
    }))
    this.storageCapabilitiesPromise = storageCapabilitiesPromise

    return storageCapabilitiesPromise
  }

  private debugQueryPlan(descriptor: NodeQueryDescriptor, result: NodeQueryResult): void {
    if (!this.isQueryDebugEnabled()) {
      return
    }

    console.debug('[SQLiteNodeStorageAdapter] query plan', {
      descriptor,
      plan: result.plan
    })
  }

  private isQueryDebugEnabled(): boolean {
    try {
      const storage = (
        globalThis as {
          localStorage?: { getItem: (key: string) => string | null }
        }
      ).localStorage

      return (
        storage?.getItem('xnet:query:debug') === 'true' ||
        storage?.getItem('xnet:sync:debug') === 'true'
      )
    } catch {
      return false
    }
  }

  private async auditQueryParity(
    descriptor: NodeQueryDescriptor,
    result: NodeQueryResult
  ): Promise<NodeQueryParityCheckMetadata> {
    if (!this.queryVerification.enabled) {
      return { strategy: 'skipped', reason: 'disabled' }
    }

    // The parity re-run is authorization-unaware; comparing it against an
    // authorized materialization would always mismatch (exploration 0226).
    if (this.nodeReadAuthorizer) {
      return { strategy: 'skipped', reason: 'authorized-materialization' }
    }

    const candidateScopeCount = descriptor.nodeId
      ? 1
      : await this.countNodes({
          schemaId: descriptor.schemaId,
          includeDeleted: descriptor.includeDeleted
        })

    if (candidateScopeCount > this.queryVerification.maxNodes) {
      return {
        strategy: 'skipped',
        reason: 'scope-too-large',
        comparedNodeCount: candidateScopeCount
      }
    }

    const parityCandidates = descriptor.nodeId
      ? await this.getNodeParityCandidates(descriptor)
      : await this.listNodesOptimized({
          schemaId: descriptor.schemaId,
          includeDeleted: descriptor.includeDeleted
        })
    const expected = applyNodeQueryDescriptor(parityCandidates, descriptor)
    const parityCheck = this.compareQueryResults(expected, result.nodes, parityCandidates.length)

    if (parityCheck.valid === false && this.queryVerification.logFailures) {
      console.error('[SQLiteNodeStorageAdapter] Node query parity failure', {
        descriptor,
        plan: {
          strategy: result.plan.strategy,
          candidateNodeCount: result.plan.candidateNodeCount,
          hydratedNodeCount: result.plan.hydratedNodeCount,
          returnedNodeCount: result.plan.returnedNodeCount,
          postFilterReason: result.plan.postFilterReason,
          sql: result.plan.sql,
          params: result.plan.params
        },
        parityCheck
      })
    }

    return parityCheck
  }

  private async getNodeParityCandidates(descriptor: NodeQueryDescriptor): Promise<NodeState[]> {
    if (!descriptor.nodeId) {
      return []
    }

    const node = await this.getNode(descriptor.nodeId)
    if (!node) {
      return []
    }

    if (node.schemaId !== descriptor.schemaId) {
      return []
    }

    if (!descriptor.includeDeleted && node.deleted) {
      return []
    }

    return [node]
  }

  private compareQueryResults(
    expected: NodeState[],
    actual: NodeState[],
    comparedNodeCount: number
  ): NodeQueryParityCheckMetadata {
    const expectedIds = expected.map((node) => node.id)
    const actualIds = actual.map((node) => node.id)
    const expectedIdSet = new Set(expectedIds)
    const actualIdSet = new Set(actualIds)
    const missingNodeIds = expectedIds.filter((id) => !actualIdSet.has(id))
    const extraNodeIds = actualIds.filter((id) => !expectedIdSet.has(id))
    const orderMismatch =
      missingNodeIds.length === 0 &&
      extraNodeIds.length === 0 &&
      (expectedIds.length !== actualIds.length ||
        expectedIds.some((id, index) => actualIds[index] !== id))
    const valid = missingNodeIds.length === 0 && extraNodeIds.length === 0 && !orderMismatch

    return {
      strategy: 'exact',
      valid,
      comparedNodeCount,
      expectedNodeCount: expectedIds.length,
      ...(missingNodeIds.length > 0 ? { missingNodeIds } : {}),
      ...(extraNodeIds.length > 0 ? { extraNodeIds } : {}),
      ...(orderMismatch ? { orderMismatch } : {})
    }
  }

  private shouldCreateAdaptiveIndexes(stats: QueryDescriptorStatsRow): boolean {
    return (
      stats.hits >= this.adaptiveIndexing.minHits &&
      stats.avg_duration_ms >= this.adaptiveIndexing.minDurationMs &&
      stats.avg_candidates >= this.adaptiveIndexing.minCandidates
    )
  }

  private async ensureAdaptiveIndexes(input: {
    descriptorHash: string
    schemaId: SchemaIRI
    hints: AdaptiveIndexHint[]
    now: number
  }): Promise<string[]> {
    await this.ensureAdaptiveIndexBudgetColumns()

    const uniqueHints = Array.from(
      new Map(
        input.hints.map((hint) => [`${hint.propertyKey}:${hint.scalar.valueType}`, hint])
      ).values()
    )

    if (uniqueHints.length === 0) {
      return []
    }

    await this.pruneAdaptiveIndexes(input.schemaId, input.now, [])

    const touchedIndexNames: string[] = []
    let createdIndex = false

    for (const hint of uniqueHints) {
      const indexName = this.buildAdaptiveIndexName(
        input.schemaId,
        hint.propertyKey,
        hint.scalar.valueType
      )
      const estimate = await this.estimateAdaptiveIndexBudget(
        input.schemaId,
        hint.propertyKey,
        hint.scalar.valueType
      )
      const existing = await this.db.queryOne<{ index_name: string }>(
        `SELECT index_name
         FROM query_index_candidates
         WHERE index_name = ?`,
        [indexName]
      )

      if (existing) {
        await this.db.run(
          `UPDATE query_index_candidates
           SET descriptor_hash = ?,
               last_used_at = ?,
               estimated_bytes = ?,
               estimated_rows = ?
           WHERE index_name = ?`,
          [input.descriptorHash, input.now, estimate.estimatedBytes, estimate.rowCount, indexName]
        )
        touchedIndexNames.push(indexName)
        continue
      }

      const hasBudget = await this.makeAdaptiveIndexBudgetRoom({
        schemaId: input.schemaId,
        estimate,
        protectedIndexNames: touchedIndexNames,
        now: input.now
      })
      if (!hasBudget) {
        continue
      }

      const ddl = this.buildAdaptiveIndexDDL(
        indexName,
        input.schemaId,
        hint.propertyKey,
        hint.scalar.valueType
      )
      await this.db.exec(ddl)
      await this.db.run(
        `INSERT INTO query_index_candidates
          (
            index_name,
            descriptor_hash,
            schema_id,
            property_key,
            value_type,
            ddl,
            created_at,
            last_used_at,
            estimated_bytes,
            estimated_rows
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          indexName,
          input.descriptorHash,
          input.schemaId,
          hint.propertyKey,
          hint.scalar.valueType,
          ddl,
          input.now,
          input.now,
          estimate.estimatedBytes,
          estimate.rowCount
        ]
      )
      touchedIndexNames.push(indexName)
      createdIndex = true
    }

    if (createdIndex) {
      await runAnalyze(this.db, 'node_property_scalars')
      await this.db.exec('PRAGMA optimize')
      // New index → plans may change; memoized diagnostics are stale.
      this.compiledQueryDiagnosticsMemo.clear()
    }

    return touchedIndexNames
  }

  private async ensureAdaptiveIndexBudgetColumns(): Promise<void> {
    if (this.adaptiveIndexBudgetColumnsReady) {
      return
    }

    const columns = await this.db.query<{ name: string }>(
      'PRAGMA table_info(query_index_candidates)'
    )
    const columnNames = new Set(columns.map((column) => column.name))
    let changed = false

    if (!columnNames.has('estimated_bytes')) {
      await this.db.exec(
        'ALTER TABLE query_index_candidates ADD COLUMN estimated_bytes INTEGER NOT NULL DEFAULT 0'
      )
      changed = true
    }

    if (!columnNames.has('estimated_rows')) {
      await this.db.exec(
        'ALTER TABLE query_index_candidates ADD COLUMN estimated_rows INTEGER NOT NULL DEFAULT 0'
      )
      changed = true
    }

    if (changed && (await this.db.getSchemaVersion()) < 4) {
      await this.db.setSchemaVersion(4)
    }

    this.adaptiveIndexBudgetColumnsReady = true
  }

  private async estimateAdaptiveIndexBudget(
    schemaId: SchemaIRI,
    propertyKey: string,
    valueType: ScalarValueType
  ): Promise<AdaptiveIndexBudgetEstimate> {
    const valueBytesExpression = this.getAdaptiveIndexValueBytesExpression(valueType)
    const row = await this.db.queryOne<{
      row_count: number
      estimated_bytes: number
    }>(
      `SELECT
         COUNT(*) as row_count,
         COALESCE(SUM(LENGTH(node_id) + ${valueBytesExpression} + 32), 0) as estimated_bytes
       FROM node_property_scalars
       WHERE schema_id = ?
         AND property_key = ?
         AND value_type = ?`,
      [schemaId, propertyKey, valueType]
    )

    return {
      rowCount: Number(row?.row_count ?? 0),
      estimatedBytes: Number(row?.estimated_bytes ?? 0)
    }
  }

  private getAdaptiveIndexValueBytesExpression(valueType: ScalarValueType): string {
    switch (valueType) {
      case 'text':
        return 'COALESCE(LENGTH(value_text), 0)'
      case 'number':
        return '8'
      case 'boolean':
        return '1'
      case 'null':
        return '0'
    }
  }

  private async makeAdaptiveIndexBudgetRoom(input: {
    schemaId: SchemaIRI
    estimate: AdaptiveIndexBudgetEstimate
    protectedIndexNames: string[]
    now: number
  }): Promise<boolean> {
    await this.pruneAdaptiveIndexes(input.schemaId, input.now, input.protectedIndexNames)

    let droppedIndex = true
    while (droppedIndex) {
      const usage = await this.getAdaptiveIndexBudgetUsage(input.schemaId)
      const withinBudget =
        usage.count + 1 <= this.adaptiveIndexing.maxIndexesPerSchema &&
        usage.estimatedBytes + input.estimate.estimatedBytes <=
          this.adaptiveIndexing.maxEstimatedBytesPerSchema &&
        usage.indexedRows + input.estimate.rowCount <= this.adaptiveIndexing.maxIndexedRowsPerSchema

      if (withinBudget) {
        return true
      }

      droppedIndex = await this.dropLeastUsefulAdaptiveIndex(
        input.schemaId,
        input.protectedIndexNames,
        'over-budget'
      )

      if (!droppedIndex) {
        return false
      }
    }

    return false
  }

  private async pruneAdaptiveIndexes(
    schemaId: SchemaIRI,
    now: number,
    protectedIndexNames: string[]
  ): Promise<void> {
    if (this.adaptiveIndexing.dropUnusedAfterMs >= 0) {
      const cutoff = now - this.adaptiveIndexing.dropUnusedAfterMs
      const protectedFilter = this.buildProtectedIndexFilter(protectedIndexNames)
      const staleIndexes = await this.db.query<{ index_name: string }>(
        `SELECT index_name
         FROM query_index_candidates
         WHERE schema_id = ?
           AND last_used_at < ?
           ${protectedFilter.clause}
         ORDER BY last_used_at ASC, created_at ASC, index_name ASC`,
        [schemaId, cutoff, ...protectedFilter.params]
      )

      for (const row of staleIndexes) {
        await this.dropAdaptiveIndex(row.index_name, 'unused')
      }
    }

    let droppedIndex = true
    while (droppedIndex) {
      const usage = await this.getAdaptiveIndexBudgetUsage(schemaId)
      const withinBudget =
        usage.count <= this.adaptiveIndexing.maxIndexesPerSchema &&
        usage.estimatedBytes <= this.adaptiveIndexing.maxEstimatedBytesPerSchema &&
        usage.indexedRows <= this.adaptiveIndexing.maxIndexedRowsPerSchema

      if (withinBudget) {
        return
      }

      droppedIndex = await this.dropLeastUsefulAdaptiveIndex(
        schemaId,
        protectedIndexNames,
        'over-budget'
      )

      if (!droppedIndex) {
        return
      }
    }
  }

  private async getAdaptiveIndexBudgetUsage(
    schemaId: SchemaIRI
  ): Promise<AdaptiveIndexBudgetUsage> {
    const row = await this.db.queryOne<{
      count: number
      estimated_bytes: number
      indexed_rows: number
    }>(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(estimated_bytes), 0) as estimated_bytes,
         COALESCE(SUM(estimated_rows), 0) as indexed_rows
       FROM query_index_candidates
       WHERE schema_id = ?`,
      [schemaId]
    )

    return {
      count: Number(row?.count ?? 0),
      estimatedBytes: Number(row?.estimated_bytes ?? 0),
      indexedRows: Number(row?.indexed_rows ?? 0)
    }
  }

  private async dropLeastUsefulAdaptiveIndex(
    schemaId: SchemaIRI,
    protectedIndexNames: string[],
    reason: 'unused' | 'over-budget'
  ): Promise<boolean> {
    const protectedFilter = this.buildProtectedIndexFilter(protectedIndexNames)
    const row = await this.db.queryOne<{ index_name: string }>(
      `SELECT index_name
       FROM query_index_candidates
       WHERE schema_id = ?
         ${protectedFilter.clause}
       ORDER BY last_used_at ASC, created_at ASC, index_name ASC
       LIMIT 1`,
      [schemaId, ...protectedFilter.params]
    )

    if (!row) {
      return false
    }

    await this.dropAdaptiveIndex(row.index_name, reason)
    return true
  }

  private async dropAdaptiveIndex(
    indexName: string,
    reason: 'unused' | 'over-budget'
  ): Promise<void> {
    await this.db.exec(`DROP INDEX IF EXISTS ${this.quoteSqlIdentifier(indexName)}`)
    await this.db.run('DELETE FROM query_index_candidates WHERE index_name = ?', [indexName])
    // Dropped index → plans may change; memoized diagnostics are stale.
    this.compiledQueryDiagnosticsMemo.clear()
    this.debugAdaptiveIndex('drop', { indexName, reason })
  }

  private debugAdaptiveIndex(action: 'drop', details: Record<string, unknown>): void {
    if (!this.isQueryDebugEnabled()) {
      return
    }

    console.debug('[SQLiteNodeStorageAdapter] adaptive index', {
      action,
      ...details
    })
  }

  private buildProtectedIndexFilter(protectedIndexNames: string[]): {
    clause: string
    params: SQLValue[]
  } {
    const uniqueNames = Array.from(new Set(protectedIndexNames))

    if (uniqueNames.length === 0) {
      return { clause: '', params: [] }
    }

    return {
      clause: `AND index_name NOT IN (${uniqueNames.map(() => '?').join(', ')})`,
      params: uniqueNames
    }
  }

  private buildAdaptiveIndexName(
    schemaId: SchemaIRI,
    propertyKey: string,
    valueType: ScalarValueType
  ): string {
    return [
      'idx_auto_prop',
      hashScalarValue(schemaId),
      hashScalarValue(propertyKey),
      valueType
    ].join('_')
  }

  private buildAdaptiveIndexDDL(
    indexName: string,
    schemaId: SchemaIRI,
    propertyKey: string,
    valueType: ScalarValueType
  ): string {
    const columns = this.getAdaptiveIndexColumns(valueType)
    const indexIdentifier = this.quoteSqlIdentifier(indexName)

    return `CREATE INDEX IF NOT EXISTS ${indexIdentifier}
ON node_property_scalars(${columns})
WHERE schema_id = ${quoteSqlLiteral(schemaId)}
  AND property_key = ${quoteSqlLiteral(propertyKey)}
  AND value_type = ${quoteSqlLiteral(valueType)}`
  }

  private getAdaptiveIndexColumns(valueType: ScalarValueType): string {
    switch (valueType) {
      case 'text':
        return 'value_text, node_id'
      case 'number':
        return 'value_number, node_id'
      case 'boolean':
        return 'value_boolean, node_id'
      case 'null':
        return 'node_id'
    }
  }

  private async countCompiledNodeQuery(
    descriptor: NodeQueryDescriptor,
    spatialPlan: SpatialQueryPlan | null,
    fullTextSearchPlan: FullTextSearchQueryPlan | null
  ): Promise<number> {
    const compiled = this.queryCompiler.compile(
      withoutNodeQueryPagination(descriptor),
      spatialPlan,
      fullTextSearchPlan
    )
    if (!compiled) return 0

    const row = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM (${compiled.sql}) counted_nodes`,
      compiled.params
    )

    return Number(row?.count ?? 0)
  }

  private serializePayload(payload: NodePayload): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(payload))
  }

  /**
   * Serialize a change for the `changes` table (exploration 0272).
   *
   * The table has no columns for `id`, `type`, `protocolVersion`,
   * `batchIndex`, or `batchSize`, yet all of them are part of the signed
   * content hash — a change re-read without them can never pass
   * `verifyChangeHash`, so the reload-resync push (getChangesSince → hub)
   * was structurally rejected as INVALID_HASH and tripped the 0224 breaker,
   * stranding offline edits. The hub's own `node_changes` table persists
   * every one of these fields; the client log now does too, by wrapping the
   * payload BLOB in an envelope instead of a schema migration (applySchema
   * re-runs idempotent DDL and never executes ALTERs, so new columns would
   * not reach existing databases).
   */
  private serializeChangeRecord(change: NodeChange): Uint8Array {
    const meta: Record<string, unknown> = { id: change.id, type: change.type }
    if (change.protocolVersion !== undefined) meta.protocolVersion = change.protocolVersion
    if (change.batchIndex !== undefined) meta.batchIndex = change.batchIndex
    if (change.batchSize !== undefined) meta.batchSize = change.batchSize
    return new TextEncoder().encode(
      JSON.stringify({ [CHANGE_ENVELOPE_KEY]: meta, payload: change.payload })
    )
  }

  private serializeValue(value: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(value))
  }

  private deserializeChange(row: ChangeRow): NodeChange {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(row.payload))
    const envelope =
      parsed !== null && typeof parsed === 'object' && CHANGE_ENVELOPE_KEY in parsed
        ? ((parsed as Record<string, unknown>)[CHANGE_ENVELOPE_KEY] as {
            id: string
            type: string
            protocolVersion?: number
            batchIndex?: number
            batchSize?: number
          })
        : null
    const payload = (envelope ? (parsed as Record<string, unknown>).payload : parsed) as NodePayload

    const change: NodeChange = {
      // Envelope rows (exploration 0272) round-trip the hashed identity
      // fields exactly, so verifyChangeHash holds after a re-read. Legacy
      // rows predate the envelope: their id/type/protocolVersion are gone
      // for good, so we keep the historical fabricated values.
      id: envelope?.id ?? row.hash,
      type: envelope?.type ?? 'node',
      hash: row.hash as ContentId,
      payload,
      lamport: row.lamport_time,
      wallTime: row.wall_time,
      authorDID: row.author_did as DID,
      parentHash: (row.parent_hash as ContentId) ?? null,
      batchId: row.batch_id ?? undefined,
      signature: row.signature
    }
    if (envelope?.protocolVersion !== undefined) change.protocolVersion = envelope.protocolVersion
    if (envelope?.batchIndex !== undefined) change.batchIndex = envelope.batchIndex
    if (envelope?.batchSize !== undefined) change.batchSize = envelope.batchSize
    return change
  }
}

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create a SQLiteNodeStorageAdapter from an existing SQLiteAdapter.
 * Use this when you want to share the SQLite connection with other services.
 *
 * @example
 * ```typescript
 * import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
 * import { createNodeStorageAdapter } from '@xnetjs/data'
 *
 * const db = await createMemorySQLiteAdapter()
 * const storage = createNodeStorageAdapter(db)
 * ```
 */
export function createNodeStorageAdapter(
  db: SQLiteAdapter,
  options?: SQLiteNodeStorageAdapterOptions
): SQLiteNodeStorageAdapter {
  return new SQLiteNodeStorageAdapter(db, options)
}
