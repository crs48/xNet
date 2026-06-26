/**
 * @xnetjs/sqlite - Reader-thread pool + dispatcher for the Electron adapter
 *
 * A least-busy dispatcher over K read-only `better-sqlite3` reader threads
 * (exploration 0230). The writer connection stays on the data-process thread;
 * heavy reads (FTS, large aggregates, big scans) are offloaded here so they run
 * in parallel on other cores instead of blocking the single data-process thread.
 *
 * Cheap reads are intentionally NOT routed here — the structured-clone cost of
 * shipping a result across the worker boundary dominates a sub-millisecond
 * query, so {@link isHeavyRead} gates what's worth offloading. The pool is also
 * resilient: a reader that fails to boot or dies is dropped, and once no healthy
 * readers remain the adapter falls back to the inline connection.
 */

import type { SQLValue, SQLRow } from '../types'
import type { ReaderRequest, ReaderResponse } from './reader-thread'

/** A reader request minus its correlation id (distributes over the union). */
type ReaderRequestBody =
  | { op: 'query'; sql: string; params?: SQLValue[] }
  | { op: 'queryOne'; sql: string; params?: SQLValue[] }
  | { op: 'ping' }

/**
 * Minimal shape of a worker the pool drives. `node:worker_threads`' `Worker`
 * satisfies this; tests inject an in-process fake to exercise routing without
 * spawning a thread or loading the native addon.
 */
export interface ReaderWorkerLike {
  postMessage(value: ReaderRequest): void
  on(event: 'message', listener: (value: ReaderResponse | { id: 0; ready: boolean }) => void): void
  on(event: 'error', listener: (err: Error) => void): void
  on(event: 'exit', listener: (code: number) => void): void
  terminate(): void | Promise<number>
}

/** Factory that creates a reader worker for index `i`. */
export type ReaderWorkerFactory = (index: number) => ReaderWorkerLike

export interface ReaderPoolOptions {
  /** Database file path; passed to each reader as `workerData.dbPath`. */
  dbPath: string
  /** Number of reader threads to spawn (≥ 1). */
  size: number
  /**
   * Worker factory. Production passes {@link workerThreadsFactory}; tests inject
   * an in-process fake to exercise routing without spawning a thread.
   */
  createWorker: ReaderWorkerFactory
}

export interface ReaderPoolStats {
  /** Configured reader count. */
  size: number
  /** Readers currently able to serve requests. */
  healthy: number
  /** Requests currently awaiting a response across all readers. */
  inFlight: number
  /** Total requests dispatched over the pool's lifetime. */
  dispatched: number
  /** Total reader failures (boot errors + crashes) over the pool's lifetime. */
  failures: number
}

interface PendingRequest {
  resolve: (value: ReaderResponse) => void
  reject: (err: Error) => void
  reader: ReaderState
}

interface ReaderState {
  index: number
  worker: ReaderWorkerLike
  inFlight: number
  healthy: boolean
}

/**
 * Heuristic for reads worth offloading to a reader thread: the query's compute
 * is likely to dwarf the structured-clone cost of its result. Full-text MATCH,
 * grouping/aggregation, and large explicit LIMITs qualify; a point lookup does
 * not. Conservative by design — a false negative just keeps a read inline.
 */
export function isHeavyRead(sql: string): boolean {
  return /\bMATCH\b|\bGROUP\s+BY\b|\bCOUNT\s*\(|\bSUM\s*\(|\bAVG\s*\(|\bjson_extract\s*\(|\bORDER\s+BY\b[\s\S]*\bLIMIT\b\s*\d{3,}/i.test(
    sql
  )
}

/**
 * Resolve a configured pool size (`number | 'auto'`) to a concrete reader count.
 * `'auto'` leaves the writer + UI threads headroom and caps the fan-out, since
 * read parallelism past a few cores yields little for this workload. In-memory
 * databases can't be shared across connections, so they always resolve to 0.
 */
export function resolveReaderPoolSize(
  size: number | 'auto' | undefined,
  dbPath: string,
  availableCores: number
): number {
  if (dbPath === ':memory:' || dbPath === '') return 0
  if (size === undefined || size === 0) return 0
  if (size === 'auto') return Math.max(0, Math.min(4, availableCores - 2))
  return Math.max(0, Math.floor(size))
}

export class ReaderPool {
  private readonly readers: ReaderState[] = []
  private readonly pending = new Map<number, PendingRequest>()
  private seq = 0
  private dispatched = 0
  private failures = 0
  private closed = false

  constructor(options: ReaderPoolOptions) {
    const create = options.createWorker
    for (let i = 0; i < options.size; i++) {
      let worker: ReaderWorkerLike
      try {
        worker = create(i)
      } catch {
        this.failures++
        continue
      }
      const reader: ReaderState = { index: i, worker, inFlight: 0, healthy: true }
      worker.on('message', (msg) => this.onMessage(reader, msg))
      worker.on('error', () => this.onReaderDown(reader))
      worker.on('exit', (code) => {
        if (code !== 0) this.onReaderDown(reader)
      })
      this.readers.push(reader)
    }
  }

  /** Whether at least one reader can currently serve requests. */
  isHealthy(): boolean {
    return !this.closed && this.readers.some((r) => r.healthy)
  }

  /** Run a SELECT on the least-busy healthy reader. Rejects if none are healthy. */
  query<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T[]> {
    return this.dispatch({ op: 'query', sql, params }).then((res) => {
      if (res.ok && 'rows' in res) return res.rows as T[]
      throw new Error(res.ok ? 'reader returned no rows' : res.error)
    })
  }

  /** Run a single-row SELECT on the least-busy healthy reader. */
  queryOne<T extends SQLRow = SQLRow>(sql: string, params?: SQLValue[]): Promise<T | null> {
    return this.dispatch({ op: 'queryOne', sql, params }).then((res) => {
      if (res.ok && 'row' in res) return res.row as T | null
      throw new Error(res.ok ? 'reader returned no row' : res.error)
    })
  }

  stats(): ReaderPoolStats {
    return {
      size: this.readers.length,
      healthy: this.readers.filter((r) => r.healthy).length,
      inFlight: this.pending.size,
      dispatched: this.dispatched,
      failures: this.failures
    }
  }

  async close(): Promise<void> {
    this.closed = true
    for (const reader of this.readers) {
      reader.healthy = false
      try {
        await reader.worker.terminate()
      } catch {
        // best-effort teardown
      }
    }
    for (const [, p] of this.pending) {
      p.reject(new Error('reader pool closed'))
    }
    this.pending.clear()
  }

  private dispatch(req: ReaderRequestBody): Promise<ReaderResponse> {
    const reader = this.pickLeastBusy()
    if (!reader) return Promise.reject(new Error('no healthy reader available'))

    const id = ++this.seq
    const message = { id, ...req } as ReaderRequest
    reader.inFlight++
    this.dispatched++

    return new Promise<ReaderResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, reader })
      try {
        reader.worker.postMessage(message)
      } catch (err) {
        this.pending.delete(id)
        reader.inFlight--
        this.onReaderDown(reader)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  private pickLeastBusy(): ReaderState | null {
    let best: ReaderState | null = null
    for (const reader of this.readers) {
      if (!reader.healthy) continue
      if (!best || reader.inFlight < best.inFlight) best = reader
    }
    return best
  }

  private onMessage(reader: ReaderState, msg: ReaderResponse | { id: 0; ready: boolean }): void {
    // Boot signal: id 0 carries readiness, not a query result.
    if (msg.id === 0 && 'ready' in msg) {
      if (!msg.ready) this.onReaderDown(reader)
      return
    }
    const pending = this.pending.get(msg.id)
    if (!pending) return
    this.pending.delete(msg.id)
    reader.inFlight = Math.max(0, reader.inFlight - 1)
    pending.resolve(msg as ReaderResponse)
  }

  private onReaderDown(reader: ReaderState): void {
    if (!reader.healthy) return
    reader.healthy = false
    this.failures++
    // Reject every in-flight request bound to this reader.
    for (const [id, p] of this.pending) {
      if (p.reader === reader) {
        this.pending.delete(id)
        p.reject(new Error(`reader ${reader.index} is unavailable`))
      }
    }
  }
}

/**
 * Build a factory that spawns a real `worker_threads` Worker running the bundled
 * `reader-thread.js`. The `Worker` constructor is injected (the adapter imports
 * `node:worker_threads` lazily) so this module never pulls Node-only builtins
 * into the web graph.
 */
export function workerThreadsFactory(
  WorkerCtor: typeof import('node:worker_threads').Worker,
  dbPath: string
): ReaderWorkerFactory {
  const scriptUrl = new URL('./reader-thread.js', import.meta.url)
  return () => new WorkerCtor(scriptUrl, { workerData: { dbPath } }) as unknown as ReaderWorkerLike
}
