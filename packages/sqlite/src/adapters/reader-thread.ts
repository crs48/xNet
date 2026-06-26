/**
 * @xnetjs/sqlite - Read-only reader thread for the Electron reader pool
 *
 * Runs in a Node `worker_threads` worker spawned by {@link ReaderPool}
 * (exploration 0230). It opens its **own** `better-sqlite3` connection to the
 * same database file in **read-only** mode and serves SELECTs against the WAL
 * snapshot. Because native SQLite + WAL allows one writer concurrent with many
 * readers — each on its own connection — these threads run genuinely in parallel
 * on other cores, unlike the browser (where the `opfs-sahpool` VFS holds an
 * exclusive handle and a second connection is impossible, exploration 0228).
 *
 * Each reader uses one-shot autocommit selects (no long-lived read transaction),
 * so every query observes the latest committed snapshot and nothing holds back
 * the writer's WAL checkpoint.
 *
 * The request handler is exported so it can be unit-tested against an in-process
 * connection without spawning a worker.
 */

import type { SQLValue, SQLRow } from '../types'
import type DatabaseType from 'better-sqlite3'

/** A read request sent from the pool to a reader thread. */
export type ReaderRequest =
  | { id: number; op: 'query'; sql: string; params?: SQLValue[] }
  | { id: number; op: 'queryOne'; sql: string; params?: SQLValue[] }
  | { id: number; op: 'ping' }

/** A reader thread's response, correlated back to the request by `id`. */
export type ReaderResponse =
  | { id: number; ok: true; rows: SQLRow[] }
  | { id: number; ok: true; row: SQLRow | null }
  | { id: number; ok: true; pong: true }
  | { id: number; ok: false; error: string }

/** Signal the pool the reader booted (or failed to). `id` is always 0. */
export type ReaderReady = { id: 0; ready: true } | { id: 0; ready: false; error: string }

/**
 * Execute one reader request against `db`, caching prepared statements per
 * connection. Pure and synchronous — `better-sqlite3` is synchronous, which is
 * exactly why a reader thread fully occupies a core for the duration of a query.
 */
export function handleReaderRequest(
  db: DatabaseType.Database,
  cache: Map<string, DatabaseType.Statement>,
  req: ReaderRequest
): ReaderResponse {
  try {
    if (req.op === 'ping') {
      return { id: req.id, ok: true, pong: true }
    }

    let stmt = cache.get(req.sql)
    if (!stmt) {
      stmt = db.prepare(req.sql)
      cache.set(req.sql, stmt)
    }

    if (req.op === 'query') {
      const rows = (req.params ? stmt.all(...req.params) : stmt.all()) as SQLRow[]
      return { id: req.id, ok: true, rows }
    }

    const row = (req.params ? stmt.get(...req.params) : stmt.get()) as SQLRow | undefined
    return { id: req.id, ok: true, row: row ?? null }
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Open a read-only connection for a reader thread. Applies connection-local
 * pragmas only — `journal_mode` is owned by the writer and cannot be set on a
 * read-only handle, but the reader transparently observes the file's WAL.
 */
export async function openReaderConnection(dbPath: string): Promise<DatabaseType.Database> {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  db.pragma('cache_size = -32000') // 32MB per reader
  db.pragma('temp_store = MEMORY')
  return db
}

/**
 * Worker bootstrap: wire `parentPort` to {@link handleReaderRequest}. Only runs
 * when this module is loaded as a `worker_threads` entry, never when imported on
 * the main thread (e.g. by tests).
 */
async function bootstrapReaderThread(): Promise<void> {
  const { parentPort, workerData, isMainThread } = await import('node:worker_threads')
  if (isMainThread || !parentPort) return

  const dbPath = (workerData as { dbPath?: string } | undefined)?.dbPath
  if (!dbPath) {
    parentPort.postMessage({ id: 0, ready: false, error: 'reader thread: missing dbPath' })
    return
  }

  try {
    const db = await openReaderConnection(dbPath)
    const cache = new Map<string, DatabaseType.Statement>()
    parentPort.on('message', (req: ReaderRequest) => {
      parentPort.postMessage(handleReaderRequest(db, cache, req))
    })
    parentPort.postMessage({ id: 0, ready: true } satisfies ReaderReady)
  } catch (err) {
    parentPort.postMessage({
      id: 0,
      ready: false,
      error: err instanceof Error ? err.message : String(err)
    } satisfies ReaderReady)
  }
}

void bootstrapReaderThread()
