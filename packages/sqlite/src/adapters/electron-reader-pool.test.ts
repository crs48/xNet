/**
 * Integration test: real parallelism across `worker_threads` reader threads
 * (exploration 0230, Phase 1). Spawns genuine workers running `better-sqlite3`
 * read-only connections and proves two reads execute concurrently on distinct
 * threads — the thing the browser's `opfs-sahpool` VFS cannot do.
 *
 * Concurrency is proven with a shared-memory rendezvous, not wall-clock ratios:
 * each reader parks inside its request handler until the other reader arrives,
 * so the test only passes if both requests are simultaneously executing on two
 * threads. A serial dispatcher (or a single reusable thread) deadlocks at the
 * barrier and fails via its timeout. Wall-clock speedup assertions were removed
 * — they flake on contended CI runners where 2× cores aren't really available.
 *
 * Best-effort: skips if the native addon or worker spawning is unavailable.
 */
import { randomUUID } from 'crypto'
import { unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { ReaderPool, type ReaderWorkerLike } from './reader-pool'

// CommonJS reader worker, inlined so the test needs no built .js on disk. Mirrors
// reader-thread.ts: a read-only better-sqlite3 connection answering query/ping.
const READER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const Database = require('better-sqlite3')
const db = new Database(workerData.dbPath, { readonly: true, fileMustExist: true })
db.pragma('busy_timeout = 5000')
const cache = new Map()
parentPort.on('message', (req) => {
  try {
    if (req.op === 'ping') { parentPort.postMessage({ id: req.id, ok: true, pong: true }); return }
    if (req.op === 'query' && req.sql.indexOf('rendezvous') !== -1) {
      // Two-thread barrier: park until the peer reader is ALSO inside its
      // handler. Only genuinely concurrent threads can both get here — a
      // single thread serving both requests blocks on the first and times out.
      const lane = new Int32Array(workerData.sab)
      Atomics.add(lane, 0, 1)
      Atomics.notify(lane, 0)
      const deadline = Date.now() + 10000
      while (Atomics.load(lane, 0) < 2) {
        if (Date.now() >= deadline) {
          parentPort.postMessage({ id: req.id, ok: false, error: 'rendezvous timeout: no second reader thread ran concurrently' })
          return
        }
        Atomics.wait(lane, 0, Atomics.load(lane, 0), 100)
      }
      parentPort.postMessage({ id: req.id, ok: true, rows: [{ met: 1 }] })
      return
    }
    let stmt = cache.get(req.sql)
    if (!stmt) { stmt = db.prepare(req.sql); cache.set(req.sql, stmt) }
    if (req.op === 'query') {
      const rows = req.params ? stmt.all(...req.params) : stmt.all()
      parentPort.postMessage({ id: req.id, ok: true, rows })
    } else {
      const row = req.params ? stmt.get(...req.params) : stmt.get()
      parentPort.postMessage({ id: req.id, ok: true, row: row == null ? null : row })
    }
  } catch (e) {
    parentPort.postMessage({ id: req.id, ok: false, error: String((e && e.message) || e) })
  }
})
parentPort.postMessage({ id: 0, ready: true })
`

// Marker SQL routed to the barrier branch above instead of SQLite.
const RENDEZVOUS_SQL = "SELECT 'rendezvous'"

async function canSpawnReaders(dbPath: string): Promise<boolean> {
  try {
    const { Worker } = await import('node:worker_threads')
    const Database = (await import('better-sqlite3')).default
    const writer = new Database(dbPath)
    writer.pragma('journal_mode = WAL')
    writer.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    writer.close()
    // Boot a single worker and wait for its ready signal.
    const ok = await new Promise<boolean>((resolve) => {
      const w = new Worker(READER_SOURCE, { eval: true, workerData: { dbPath } })
      const timer = setTimeout(() => {
        w.terminate()
        resolve(false)
      }, 4000)
      w.on('message', (m: { id: number; ready?: boolean }) => {
        if (m.id === 0) {
          clearTimeout(timer)
          w.terminate()
          resolve(m.ready === true)
        }
      })
      w.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
    })
    return ok
  } catch {
    return false
  }
}

function cleanup(path: string): void {
  for (const f of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(f)) unlinkSync(f)
    } catch {
      // ignore
    }
  }
}

const probePath = join(tmpdir(), `xnet-pool-probe-${randomUUID()}.db`)
const canSpawn = await canSpawnReaders(probePath)
cleanup(probePath)
const d = canSpawn ? describe : describe.skip

d('ReaderPool real worker_threads parallelism (0230)', () => {
  async function withPool(size: number, fn: (pool: ReaderPool) => Promise<void>): Promise<void> {
    const dbPath = join(tmpdir(), `xnet-pool-${randomUUID()}.db`)
    const Database = (await import('better-sqlite3')).default
    const writer = new Database(dbPath)
    writer.pragma('journal_mode = WAL')
    writer.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    writer.close()

    const { Worker } = await import('node:worker_threads')
    // Shared rendezvous lane visible to every reader in this pool.
    const sab = new SharedArrayBuffer(4)
    const pool = new ReaderPool({
      dbPath,
      size,
      createWorker: () =>
        new Worker(READER_SOURCE, {
          eval: true,
          workerData: { dbPath, sab }
        }) as unknown as ReaderWorkerLike
    })
    // Wait for boot.
    await new Promise((r) => setTimeout(r, 200))
    try {
      await fn(pool)
    } finally {
      await pool.close()
      cleanup(dbPath)
    }
  }

  it('runs a query on a reader thread and returns the result', async () => {
    await withPool(1, async (pool) => {
      const rows = await pool.query<{ n: number }>('SELECT 1 + 1 AS n')
      expect(rows).toEqual([{ n: 2 }])
    })
  })

  it('two reads execute concurrently on distinct reader threads', async () => {
    await withPool(2, async (pool) => {
      // Each request parks at the shared-memory barrier until the other reader
      // is simultaneously inside its handler. Both resolving proves two
      // requests were concurrently executing on two real threads; anything
      // serial deadlocks at the barrier and fails via the reader-side timeout.
      const rows = await Promise.all([
        pool.query<{ met: number }>(RENDEZVOUS_SQL),
        pool.query<{ met: number }>(RENDEZVOUS_SQL)
      ])
      expect(rows).toEqual([[{ met: 1 }], [{ met: 1 }]])
    })
  }, 20000)
})
