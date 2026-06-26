/**
 * Electron adapter — scheduler, read/write split, cooperative yielding, and
 * diagnostics (exploration 0230). Uses real `better-sqlite3`; skips when the
 * native addon can't load (e.g. CI arch mismatch).
 *
 * The benchmark cases double as the "perf harness" the exploration calls for:
 * they record interactive-read p50/p95 under a write/import burst.
 */
import type { SQLiteNodeBatchApplyInput, SQLiteNodeBatchNodeRow, SQLiteConfig } from '../types'
import { randomUUID } from 'crypto'
import { unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect, afterEach } from 'vitest'
import { ElectronSQLiteAdapter, createElectronSQLiteAdapter } from './electron'

function getTestDbPath(): string {
  return join(tmpdir(), `xnet-parallel-${randomUUID()}.db`)
}

function cleanupDb(path: string): void {
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch {
      // ignore
    }
  }
}

function isNativeLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('better_sqlite3.node') ||
    message.includes('incompatible architecture') ||
    message.includes('Cannot find module')
  )
}

async function probeNative(): Promise<boolean> {
  const dbPath = getTestDbPath()
  try {
    const a = await createElectronSQLiteAdapter({ path: dbPath })
    await a.close()
    return true
  } catch (err) {
    if (isNativeLoadError(err)) return false
    throw err
  } finally {
    cleanupDb(dbPath)
  }
}

const native = await probeNative()
const d = native ? describe : describe.skip

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function nodeRow(id: string): SQLiteNodeBatchNodeRow {
  const now = Date.now()
  return {
    id,
    schemaId: 'xnet://Page/1.0',
    createdAt: now,
    updatedAt: now,
    createdBy: 'did:key:test',
    deletedAt: null,
    propertyKeys: []
  }
}

function batchOfNodes(count: number): SQLiteNodeBatchApplyInput {
  return {
    nodes: Array.from({ length: count }, (_, i) => nodeRow(`batch-${i}`)),
    properties: [],
    changes: [],
    scalarIndexRows: [],
    ftsNodeIds: [],
    ftsRows: [],
    affectedSchemaIds: [],
    lastLamportTime: count,
    indexMode: 'defer-schema'
  }
}

d('ElectronSQLiteAdapter scheduling + parallel reads (0230)', () => {
  const open: ElectronSQLiteAdapter[] = []
  const paths: string[] = []

  async function makeAdapter(extra: Partial<SQLiteConfig> = {}): Promise<ElectronSQLiteAdapter> {
    const path = getTestDbPath()
    paths.push(path)
    const adapter = await createElectronSQLiteAdapter({ path, ...extra })
    open.push(adapter)
    return adapter
  }

  afterEach(async () => {
    for (const a of open.splice(0)) {
      if (a.isOpen()) await a.close()
    }
    for (const p of paths.splice(0)) cleanupDb(p)
  })

  it('keeps interactive-read p95 low under a write burst (perf harness)', async () => {
    const adapter = await makeAdapter()
    const now = Date.now()
    // Seed a few thousand rows so reads are non-trivial.
    await adapter.transaction(async () => {
      for (let i = 0; i < 3000; i++) {
        await adapter.run(
          'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
          [`seed-${i}`, 'xnet://Page/1.0', now, now, 'did:key:test']
        )
      }
    })

    // Fire a sustained write burst concurrently with interactive reads.
    const writeBurst = (async () => {
      for (let i = 0; i < 400; i++) {
        await adapter.run(
          'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
          [`burst-${i}`, 'xnet://Page/1.0', now, now, 'did:key:test']
        )
      }
    })()

    const latencies: number[] = []
    const readers = Array.from({ length: 100 }, async () => {
      const start = performance.now()
      await adapter.queryOne('SELECT * FROM nodes WHERE id = ?', ['seed-1500'])
      latencies.push(performance.now() - start)
    })

    await Promise.all([writeBurst, ...readers])
    latencies.sort((a, b) => a - b)
    const p50 = percentile(latencies, 50)
    const p95 = percentile(latencies, 95)
    // eslint-disable-next-line no-console
    console.log(
      `interactive read under write burst — p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms`
    )
    expect(p95).toBeLessThan(50) // one frame budget is ~16ms; generous bound for CI
  })

  it('applyNodeBatch yields so an interactive read interleaves mid-import', async () => {
    const adapter = await makeAdapter()

    let batchDone = false
    const batch = adapter.applyNodeBatch(batchOfNodes(2000)).then((r) => {
      batchDone = true
      return r
    })

    // Issued while the (chunked) import is running; it must resolve before the
    // whole batch because applyNodeBatch yields between chunks.
    const readDuringImport = await adapter.queryOne<{ c: number }>(
      'SELECT COUNT(*) as c FROM sqlite_master'
    )
    const readResolvedBeforeBatch = !batchDone

    const result = await batch
    expect(result.nodeRowsWritten).toBe(2000)
    expect(readDuringImport).not.toBeNull()
    expect(readResolvedBeforeBatch).toBe(true)

    const count = await adapter.queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM nodes WHERE id LIKE 'batch-%'"
    )
    expect(count?.c).toBe(2000)
  })

  it('serves reads from a read-only secondary connection (Phase 0.5)', async () => {
    const adapter = await makeAdapter({ readonlyReadConnection: true })
    const now = Date.now()
    await adapter.run(
      'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
      ['rw-1', 'xnet://Page/1.0', now, now, 'did:key:test']
    )
    // Read-your-writes across connections holds under WAL: the committed row is
    // visible on the read-only connection immediately.
    const row = await adapter.queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = ?', [
      'rw-1'
    ])
    expect(row?.id).toBe('rw-1')

    const diag = await adapter.getDiagnostics()
    expect(diag.readonlyConnection).toBe(true)
    expect(diag.scheduler).not.toBeNull()
  })

  it('reports scheduler + WAL diagnostics', async () => {
    const adapter = await makeAdapter()
    const diag = await adapter.getDiagnostics()
    expect(diag.scheduler).toMatchObject({ interactive: 0, bulk: 0, write: 0 })
    expect(diag.wal).not.toBeNull()
    expect(diag.wal!.pageCount).toBeGreaterThan(0)
    expect(diag.readerPool).toBeNull() // no pool configured here
  })

  it('keeps a manual transaction atomic under concurrent interactive reads', async () => {
    const adapter = await makeAdapter()
    const now = Date.now()

    await adapter.beginTransaction()
    // Reads issued while the transaction is open run on the writer (read their
    // own writes) and must not deadlock or corrupt the in-flight transaction.
    const reads = Array.from({ length: 20 }, () =>
      adapter.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM nodes')
    )
    await adapter.run(
      'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
      ['tx-a', 'xnet://Page/1.0', now, now, 'did:key:test']
    )
    await adapter.run(
      'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
      ['tx-b', 'xnet://Page/1.0', now, now, 'did:key:test']
    )
    await adapter.commit()
    await Promise.all(reads)

    const count = await adapter.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM nodes')
    expect(count?.c).toBe(2)
  })

  it('rolls a manual transaction back atomically', async () => {
    const adapter = await makeAdapter()
    const now = Date.now()
    await adapter.run(
      'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
      ['keep', 'xnet://Page/1.0', now, now, 'did:key:test']
    )
    await adapter.beginTransaction()
    await adapter.run(
      'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
      ['drop', 'xnet://Page/1.0', now, now, 'did:key:test']
    )
    await adapter.rollback()
    const rows = await adapter.query<{ id: string }>('SELECT id FROM nodes ORDER BY id')
    expect(rows).toEqual([{ id: 'keep' }])
  })
})
