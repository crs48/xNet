/**
 * @xnetjs/sqlite - Main thread proxy for SQLite Web Worker
 *
 * This provides a SQLiteAdapter-compatible interface that communicates
 * with the SQLite worker via postMessage/Comlink.
 */

import type { SQLiteWorkerHandler } from './web-worker'
import type { SQLiteAdapter, PreparedStatement } from '../adapter'
import type {
  SQLiteConfig,
  SQLValue,
  SQLRow,
  RunResult,
  SQLiteOperationStats,
  SQLBatchRead,
  SQLiteNodeBatchApplyInput,
  SQLiteNodeBatchApplyResult
} from '../types'
import type { RouterLike, TabRole, TabRoleHandle } from './web-leader'
import type { SchedulerOpStats } from './worker-scheduler'
import * as Comlink from 'comlink'
import { readBootLogArgs } from './boot-log-bridge'
import { openWithTimeoutRetry } from './open-retry'
import {
  FollowerCallGuard,
  acquireTabRole,
  connectRouter,
  isMultiTabSupported,
  requestDbPort,
  serveLeaderPorts
} from './web-leader'

function isDebugEnabled(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sqlite:debug') === 'true'
}

function log(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(...args)
  }
}

function createEmptyOperationStats(): SQLiteOperationStats {
  return {
    queryCount: 0,
    queryOneCount: 0,
    runCount: 0,
    execCount: 0,
    transactionCount: 0,
    transactionBatchCount: 0,
    transactionBatchOperationCount: 0,
    workerRequestCount: 0
  }
}

function cloneOperationStats(stats: SQLiteOperationStats): SQLiteOperationStats {
  return { ...stats }
}

function estimateNodeBatchSqlOperations(input: SQLiteNodeBatchApplyInput): number {
  const indexOperations =
    input.indexMode === 'defer-schema'
      ? 0
      : input.nodes.length +
        input.scalarIndexRows.length +
        input.ftsNodeIds.length +
        input.ftsRows.length +
        input.affectedSchemaIds.length

  return (
    input.nodes.length * 2 + input.properties.length + input.changes.length + indexOperations + 1
  )
}

/**
 * Comlink-wrapped worker handler type
 */
type RemoteHandler = Comlink.Remote<SQLiteWorkerHandler>

/**
 * SQLite proxy for the main thread.
 *
 * This wraps the Web Worker and provides the SQLiteAdapter interface
 * for use in the main thread React components.
 *
 * @example
 * ```typescript
 * const proxy = await createWebSQLiteProxy({ path: '/xnet.db' })
 * const nodes = await proxy.query('SELECT * FROM nodes')
 * ```
 */
export class WebSQLiteProxy implements SQLiteAdapter {
  private worker: Worker | null = null
  private proxy: RemoteHandler | null = null
  private _config: SQLiteConfig | null = null
  private inTransaction = false
  private operationStats = createEmptyOperationStats()

  // ─── Multi-tab leadership (exploration 0263) ────────────────────────────
  /** 'single-tab' = the pre-0263 per-tab worker path (or multiTab: false). */
  private role: TabRole | 'single-tab' = 'single-tab'
  private roleHandle: TabRoleHandle | null = null
  private router: RouterLike | null = null
  private unsubscribeLeaderServe: (() => void) | null = null
  private unsubscribeRouterEvents: (() => void) | null = null
  /** The Comlink port into the LEADER's SQLite worker (follower role only). */
  private followerPort: MessagePort | null = null
  private readonly guard = new FollowerCallGuard()
  /** Resolvers waiting for the connection to come back after leader loss. */
  private reconnectWaiters: Array<() => void> = []
  /** Serializes role transitions (promotion vs. reattach can race). */
  private transition: Promise<void> = Promise.resolve()

  private createWorkerProxy(): RemoteHandler {
    log('[WebSQLiteProxy] Creating worker...')

    this.worker = new Worker(new URL('./web-worker.js', import.meta.url), { type: 'module' })

    this.worker.onerror = (event) => {
      console.error('[WebSQLiteProxy] Worker error:', event)
    }

    this.worker.onmessageerror = (event) => {
      console.error('[WebSQLiteProxy] Worker message error:', event)
    }

    // Re-emit boot-debug lines the worker forwards (per-op timing + DB stats)
    // on the main-thread console, so the in-app Logs panel — which only taps the
    // main thread — captures them. Non-boot-log messages (Comlink RPC) are left
    // untouched for Comlink to handle (exploration 0229).
    this.worker.addEventListener('message', (event: MessageEvent) => {
      const bootLogArgs = readBootLogArgs(event.data)
      if (bootLogArgs) {
        // eslint-disable-next-line no-console
        console.info(...bootLogArgs)
      }
    })

    log('[WebSQLiteProxy] Worker created, wrapping with Comlink...')

    this.proxy = Comlink.wrap<SQLiteWorkerHandler>(this.worker)
    return this.proxy
  }

  async open(config: SQLiteConfig): Promise<void> {
    if (this.worker || this.proxy) {
      throw new Error('Already open. Call close() first.')
    }

    // Multi-tab leadership (exploration 0263): where Web Locks + SharedWorker
    // exist, tabs elect one leader that owns the SQLite worker and other tabs
    // route to it — instead of the second tab losing the OPFS handle race and
    // silently running on a non-durable :memory: database (0204). Any failure
    // in the routing layer falls back to the previous per-tab behaviour.
    if (config.multiTab !== false && isMultiTabSupported()) {
      try {
        await this.openMultiTab(config)
        this._config = config
        return
      } catch (err) {
        console.warn(
          '[WebSQLiteProxy] Multi-tab routing failed — falling back to single-tab open:',
          err
        )
        this.teardownMultiTab()
      }
    }

    await this.openSingleTab(config)
    this._config = config
  }

  private async openSingleTab(config: SQLiteConfig): Promise<void> {
    // A cold `installOpfsSAHPoolVfs()` on a large DB file (the 318k-change body,
    // exploration 0253) intermittently exceeds the per-attempt timeout — most
    // often because a PRIOR boot's open timed out and *leaked* a worker still
    // holding the file's exclusive OPFS handle, so this boot's
    // `createSyncAccessHandle()` blocks on the contended handle. The old code
    // hard-failed on the first timeout ("Initialization failed: Worker
    // initialization timeout after 15s" → error screen). Instead retry with a
    // FRESH worker after terminating the stuck one (which frees the handle), so the
    // leaked-handle cascade recovers instead of failing (bounded — a genuinely
    // broken OPFS still fails cleanly). See open-retry.ts.
    await openWithTimeoutRetry(
      () => {
        const proxy = this.createWorkerProxy()
        log('[WebSQLiteProxy] Calling proxy.open()...')
        this.operationStats.workerRequestCount += 1
        return {
          open: proxy.open(config),
          // (createWorkerProxy() set this.worker, but the top `if (this.worker)
          // throw` guard narrowed it to null here — re-widen the read.)
          abandon: () => {
            const worker = this.worker as Worker | null
            worker?.terminate()
            this.worker = null
            this.proxy = null
          }
        }
      },
      {
        timeoutMs: config.openTimeoutMs ?? 15000,
        onRetry: (attempt, err) => {
          console.warn(
            `[WebSQLiteProxy] SQLite worker open timed out (attempt ${attempt}); terminated the ` +
              'stuck worker to release its OPFS handle and retrying with a fresh worker (this ' +
              'usually clears handle contention left by a prior boot).',
            err
          )
        }
      }
    )

    log('[WebSQLiteProxy] proxy.open() completed')
  }

  // ─── Multi-tab open / transitions (exploration 0263) ────────────────────

  private async openMultiTab(config: SQLiteConfig): Promise<void> {
    const router = connectRouter()
    if (!router) {
      throw new Error('SharedWorker router unavailable')
    }
    this.router = router

    const locks = (navigator as Navigator & { locks: LockManager }).locks
    this.roleHandle = await acquireTabRole(locks, () => {
      this.enqueueTransition(() => this.promoteToLeader())
    })
    this.role = this.roleHandle.role

    if (this.role === 'leader') {
      await this.openSingleTab(config)
      this.becomeLeaderOnRouter()
    } else {
      // Followers reattach when leadership moves to ANOTHER tab (if this tab
      // had won, promoteToLeader flips the role before this event lands).
      this.unsubscribeRouterEvents = router.onMessage((message) => {
        const msg = message as { t?: string }
        if (msg.t === 'leader-changed' && this.role === 'follower') {
          this.enqueueTransition(() => this.reattachFollower())
        }
      })
      await this.attachToLeader()
    }

    // Always-on single info line: which role this tab took. A 'follower' line
    // is the signal that the 0204 :memory: fallback would have fired pre-0263.
    console.info('[xNet] sqlite tab role', this.role)
  }

  private becomeLeaderOnRouter(): void {
    if (!this.router) return
    this.unsubscribeLeaderServe = serveLeaderPorts(this.router, () => this.createMessagePort())
  }

  private async attachToLeader(): Promise<void> {
    if (!this.router) throw new Error('router not connected')
    const port = await requestDbPort(this.router)
    this.followerPort = port
    this.proxy = Comlink.wrap<SQLiteWorkerHandler>(port)
    const isOpen = await this.guard.run(() => this.proxy!.isOpen())
    if (!isOpen) {
      throw new Error('leader database is not open')
    }
    this.guard.markReconnected()
    this.notifyReconnected()
  }

  /** This tab won the leadership lock after the previous leader went away. */
  private async promoteToLeader(): Promise<void> {
    if (this.role !== 'follower' || !this._config) return
    log('[WebSQLiteProxy] Promoted to SQLite leader — opening own worker')
    this.guard.markLeaderLost()
    this.followerPort?.close()
    this.followerPort = null
    this.proxy = null
    this.unsubscribeRouterEvents?.()
    this.unsubscribeRouterEvents = null

    try {
      // openSingleTab's timeout-retry loop absorbs the window where the dead
      // leader's OPFS handles are still being released by the browser.
      await this.openSingleTab(this._config)
      this.role = 'leader'
      this.becomeLeaderOnRouter()
      this.guard.markReconnected()
      this.notifyReconnected()
      console.info('[xNet] sqlite tab role', this.role, '(promoted)')
    } catch (err) {
      console.error('[WebSQLiteProxy] Leader promotion failed:', err)
    }
  }

  /** Another tab became leader; drop the dead port and fetch a fresh one. */
  private async reattachFollower(): Promise<void> {
    if (this.role !== 'follower' || !this.router) return
    this.guard.markLeaderLost()
    this.followerPort?.close()
    this.followerPort = null
    this.proxy = null
    try {
      await this.attachToLeader()
      log('[WebSQLiteProxy] Reattached to new SQLite leader')
    } catch (err) {
      console.error('[WebSQLiteProxy] Reattach to new leader failed:', err)
    }
  }

  private enqueueTransition(fn: () => Promise<void>): void {
    this.transition = this.transition.then(fn, fn)
  }

  private notifyReconnected(): void {
    const waiters = this.reconnectWaiters
    this.reconnectWaiters = []
    for (const resolve of waiters) resolve()
  }

  private whenReconnected(): Promise<void> {
    if (this.proxy) return Promise.resolve()
    return new Promise<void>((resolve) => {
      this.reconnectWaiters.push(resolve)
    })
  }

  private teardownMultiTab(): void {
    this.unsubscribeLeaderServe?.()
    this.unsubscribeLeaderServe = null
    this.unsubscribeRouterEvents?.()
    this.unsubscribeRouterEvents = null
    this.roleHandle?.release()
    this.roleHandle = null
    this.followerPort?.close()
    this.followerPort = null
    if (this.role === 'follower') this.proxy = null
    this.router = null
    this.role = 'single-tab'
  }

  /**
   * Run a worker RPC with follower protections: leader loss REJECTS in-flight
   * calls immediately instead of hanging, and `retryable` (idempotent read)
   * calls transparently re-issue once the connection is re-established —
   * against this tab's own worker if it was promoted, or the new leader's.
   */
  private rpc<T>(retryable: boolean, op: (proxy: RemoteHandler) => Promise<T>): Promise<T> {
    const exec = async (): Promise<T> => {
      const proxy = this.proxy
      if (!proxy) throw new Error('Database not open')
      this.operationStats.workerRequestCount += 1
      return op(proxy)
    }
    if (this.role !== 'follower') return exec()
    return this.guard.run(
      exec,
      retryable
        ? {
            retry: async () => {
              await this.whenReconnected()
              return exec()
            }
          }
        : {}
    )
  }

  async resetStorage(config: SQLiteConfig): Promise<void> {
    if (this.worker) {
      throw new Error('Already open. Call close() first.')
    }

    const proxy = this.createWorkerProxy()
    const resetPromise = proxy.resetStorage(config)
    this.operationStats.workerRequestCount += 1
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Worker storage reset timeout after 15s')), 15000)
    )

    try {
      await Promise.race([resetPromise, timeoutPromise])
    } finally {
      await this.close()
    }
  }

  async close(): Promise<void> {
    if (this.role === 'follower') {
      // A follower must NOT close the leader's database — just detach.
      this.teardownMultiTab()
      this._config = null
      this.inTransaction = false
      return
    }

    // Leader/single-tab: drain + close the worker FIRST so its OPFS handles
    // are released, THEN release the leadership lock (teardownMultiTab) so the
    // promoted tab's open doesn't race the handle release (exploration 0263).
    this.unsubscribeLeaderServe?.()
    this.unsubscribeLeaderServe = null
    if (this.proxy) {
      this.operationStats.workerRequestCount += 1
      await this.proxy.close()
      this.proxy = null
    }

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }

    this.teardownMultiTab()
    this._config = null
    this.inTransaction = false
  }

  isOpen(): boolean {
    return this.proxy !== null
  }

  async query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    this.operationStats.queryCount += 1
    const result = await this.rpc(true, (proxy) => proxy.query(sql, params))
    return result as T[]
  }

  async queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    this.operationStats.queryOneCount += 1
    const result = await this.rpc(true, (proxy) => proxy.queryOne(sql, params))
    return result as T | null
  }

  /**
   * Execute several reads in ONE worker round-trip. N queries previously cost
   * N postMessage round-trips; a batch costs one (exploration 0263).
   */
  async queryBatch(reads: SQLBatchRead[]): Promise<SQLRow[][]> {
    if (reads.length === 0) return []
    this.operationStats.queryCount += reads.length
    return this.rpc(true, (proxy) => proxy.queryBatch(reads))
  }

  async run(sql: string, params?: SQLValue[]): Promise<RunResult> {
    this.operationStats.runCount += 1
    return this.rpc(false, (proxy) => proxy.run(sql, params))
  }

  async exec(sql: string): Promise<void> {
    this.operationStats.execCount += 1
    return this.rpc(false, (proxy) => proxy.exec(sql))
  }

  async transaction<T>(_fn: () => Promise<T>): Promise<T> {
    // Complex transactions with callbacks can't easily cross the worker boundary
    // because functions aren't serializable. Use transactionBatch() instead.
    throw new Error('Complex transactions not supported in proxy. Use transactionBatch() instead.')
  }

  /**
   * Execute multiple operations in a single transaction.
   * This is the recommended way to do transactions across the worker boundary.
   *
   * @example
   * ```typescript
   * await proxy.transactionBatch([
   *   { sql: 'INSERT INTO nodes ...', params: [...] },
   *   { sql: 'UPDATE nodes ...', params: [...] }
   * ])
   * ```
   */
  async transactionBatch(operations: Array<{ sql: string; params?: SQLValue[] }>): Promise<void> {
    this.operationStats.transactionBatchCount += 1
    this.operationStats.transactionBatchOperationCount += operations.length
    await this.rpc(false, (proxy) => proxy.transaction(operations))
  }

  async applyNodeBatch(input: SQLiteNodeBatchApplyInput): Promise<SQLiteNodeBatchApplyResult> {
    this.operationStats.transactionBatchCount += 1
    this.operationStats.transactionBatchOperationCount += estimateNodeBatchSqlOperations(input)
    return this.rpc(false, (proxy) => proxy.applyNodeBatch(input))
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Transaction already in progress')
    }

    this.operationStats.execCount += 1
    await this.rpc(false, (proxy) => proxy.exec('BEGIN IMMEDIATE'))
    this.inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) {
      throw new Error('No transaction in progress')
    }

    this.operationStats.execCount += 1
    await this.rpc(false, (proxy) => proxy.exec('COMMIT'))
    this.inTransaction = false
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) {
      return
    }

    this.operationStats.execCount += 1
    await this.rpc(false, (proxy) => proxy.exec('ROLLBACK'))
    this.inTransaction = false
  }

  async prepare(_sql: string): Promise<PreparedStatement> {
    // Prepared statements can't cross the worker boundary because the
    // statement handle isn't serializable. Use query() or run() directly.
    throw new Error('Prepared statements not supported in proxy. Use query() or run() directly.')
  }

  async getSchemaVersion(): Promise<number> {
    this.operationStats.queryOneCount += 1
    return this.rpc(true, (proxy) => proxy.getSchemaVersion())
  }

  async setSchemaVersion(version: number): Promise<void> {
    this.operationStats.runCount += 1
    await this.rpc(false, (proxy) =>
      proxy.run('INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)', [
        version,
        Date.now()
      ])
    )
  }

  async applySchema(version: number, sql: string): Promise<boolean> {
    const currentVersion = await this.getSchemaVersion()
    if (currentVersion >= version) return false

    await this.exec(sql)
    await this.setSchemaVersion(version)
    return true
  }

  async getDatabaseSize(): Promise<number> {
    return this.rpc(true, (proxy) => proxy.getDatabaseSize())
  }

  async vacuum(): Promise<void> {
    return this.rpc(false, (proxy) => proxy.vacuum())
  }

  async checkpoint(): Promise<number> {
    // opfs-sahpool handles checkpointing internally
    return 0
  }

  async getStorageMode(): Promise<'opfs' | 'memory'> {
    try {
      log('[WebSQLiteProxy] Calling proxy.getStorageMode()...')
      const mode = await this.rpc(true, (proxy) => proxy.getStorageMode())
      log('[WebSQLiteProxy] getStorageMode() returned:', mode)
      return mode
    } catch (err) {
      console.error('[WebSQLiteProxy] getStorageMode() failed:', err)
      throw err
    }
  }

  /** This tab's multi-tab role: 'leader', 'follower', or 'single-tab'. */
  getTabRole(): TabRole | 'single-tab' {
    return this.role
  }

  /**
   * Create a MessagePort connected directly to the SQLite worker.
   *
   * The returned port speaks the same Comlink `SQLiteWorkerHandler`
   * protocol as this proxy and can be transferred to another worker
   * (e.g. the data worker) so its storage calls skip the main thread.
   */
  async createMessagePort(): Promise<MessagePort> {
    // MessagePorts transfer through other MessagePorts, so a follower can mint
    // ports into the LEADER's worker (its data worker rides the same path).
    const channel = new MessageChannel()
    await this.rpc(false, (proxy) =>
      proxy.connectPort(Comlink.transfer(channel.port1, [channel.port1]))
    )
    return channel.port2
  }

  /**
   * Worker-side scheduler stats: per-lane p50/p95 queue+exec latency and
   * coalesce hits (exploration 0263). Complements getOperationStats(), which
   * counts main-thread RPCs — together they give "how many round-trips" and
   * "how long each op spent in the worker".
   */
  async getSchedulerOpStats(): Promise<SchedulerOpStats> {
    return this.rpc(true, (proxy) => proxy.getSchedulerOpStats())
  }

  /** Zero the worker-side scheduler stats for a focused measurement. */
  async resetSchedulerOpStats(): Promise<void> {
    return this.rpc(false, (proxy) => proxy.resetSchedulerOpStats())
  }

  getOperationStats(): SQLiteOperationStats {
    return cloneOperationStats(this.operationStats)
  }

  resetOperationStats(): void {
    this.operationStats = createEmptyOperationStats()
  }
}

/**
 * Create a WebSQLiteProxy ready for use.
 *
 * @example
 * ```typescript
 * const db = await createWebSQLiteProxy({ path: '/xnet.db' })
 * const nodes = await db.query('SELECT * FROM nodes')
 * await db.close()
 * ```
 */
export async function createWebSQLiteProxy(config: SQLiteConfig): Promise<WebSQLiteProxy> {
  const proxy = new WebSQLiteProxy()
  await proxy.open(config)
  return proxy
}

export async function resetWebSQLiteStorage(config: SQLiteConfig): Promise<void> {
  const proxy = new WebSQLiteProxy()
  await proxy.resetStorage(config)
}
