/**
 * Integration test: real parallelism across `worker_threads` reader threads
 * (exploration 0230, Phase 1). Spawns genuine workers running `better-sqlite3`
 * read-only connections and proves two CPU-heavy reads complete in ≈ max(t1,t2),
 * not t1 + t2 — the thing the browser's `opfs-sahpool` VFS cannot do.
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

// A CPU-heavy read: a recursive CTE that burns cycles in SQLite (so the work is
// in the reader thread, not the dispatcher). Tuned to a few tens of ms.
const HEAVY_SQL =
  'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 3000000) SELECT count(*) AS n FROM c'

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
    const pool = new ReaderPool({
      dbPath,
      size,
      createWorker: () =>
        new Worker(READER_SOURCE, {
          eval: true,
          workerData: { dbPath }
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

  it('two heavy reads complete in ≈ max(t1,t2), not the sum', async () => {
    await withPool(2, async (pool) => {
      // Warm both readers' page cache + statement cache so timing is steady.
      await Promise.all([pool.query(HEAVY_SQL), pool.query(HEAVY_SQL)])

      const t0 = performance.now()
      await pool.query(HEAVY_SQL)
      const single = performance.now() - t0

      const t1 = performance.now()
      await Promise.all([pool.query(HEAVY_SQL), pool.query(HEAVY_SQL)])
      const both = performance.now() - t1

      // eslint-disable-next-line no-console
      console.log(
        `heavy read single=${single.toFixed(1)}ms  two-parallel=${both.toFixed(1)}ms  ratio=${(both / single).toFixed(2)}`
      )
      // Serial execution would be ~2×; parallelism keeps it well under.
      expect(both).toBeLessThan(single * 1.8)
    })
  }, 20000)
})
