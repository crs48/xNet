/**
 * Semantics proof for the incremental-auto-vacuum cold-open reclaim (exploration
 * 0260). The web/OPFS adapter runs in a browser worker and cannot be exercised
 * in Node, but the SQLite behaviour the fix relies on is engine-level and
 * identical across builds, so we pin it here with better-sqlite3:
 *
 *  1. Default `auto_vacuum` is NONE — a DELETE only moves pages to the freelist,
 *     so the file never shrinks (the exact bloat that keeps the cold read slow).
 *  2. A fresh database opened with `PRAGMA auto_vacuum = INCREMENTAL` is in
 *     incremental mode from birth, and `PRAGMA incremental_vacuum` returns freed
 *     pages to the OS — page_count and the on-disk file both shrink.
 *  3. A pre-existing NONE database is *converted* to incremental mode by a single
 *     `VACUUM` (mirroring the one-time boot VACUUM); thereafter
 *     `incremental_vacuum` reclaims per call.
 */
import { randomUUID } from 'crypto'
import { existsSync, statSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let dbPath: string
let db: Database.Database

function pageCount(): number {
  return db.pragma('page_count', { simple: true }) as number
}
function freelistCount(): number {
  return db.pragma('freelist_count', { simple: true }) as number
}
function autoVacuum(): number {
  // 0 = NONE, 1 = FULL, 2 = INCREMENTAL
  return db.pragma('auto_vacuum', { simple: true }) as number
}
function seedRows(n: number, start = 0): void {
  const insert = db.prepare('INSERT INTO changes (id, blob) VALUES (?, ?)')
  const payload = 'x'.repeat(2000) // force many pages
  const tx = db.transaction((count: number) => {
    for (let i = 0; i < count; i++) insert.run(start + i, payload)
  })
  tx(n)
}

beforeEach(() => {
  dbPath = join(tmpdir(), `xnet-autovac-${randomUUID()}.db`)
})

afterEach(() => {
  db?.close()
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = dbPath + suffix
    if (existsSync(p)) unlinkSync(p)
  }
})

describe('incremental auto-vacuum reclaim (0260)', () => {
  it('under the default auto_vacuum=NONE a DELETE does NOT shrink the file', () => {
    db = new Database(dbPath)
    db.pragma('page_size = 8192')
    db.pragma('journal_mode = TRUNCATE')
    expect(autoVacuum()).toBe(0) // NONE is the default

    db.exec('CREATE TABLE changes (id INTEGER PRIMARY KEY, blob TEXT)')
    seedRows(500)
    const grown = pageCount()

    db.exec('DELETE FROM changes WHERE id >= 50')
    // Pages went to the freelist; the file did not shrink.
    expect(freelistCount()).toBeGreaterThan(0)
    expect(pageCount()).toBe(grown)

    // incremental_vacuum is a no-op in NONE mode — bloat persists.
    db.pragma('incremental_vacuum')
    expect(pageCount()).toBe(grown)
  })

  it('a fresh INCREMENTAL database reclaims freed pages to the OS', () => {
    db = new Database(dbPath)
    db.pragma('page_size = 8192')
    // Set BEFORE any table exists — takes effect immediately on a fresh DB.
    db.pragma('auto_vacuum = INCREMENTAL')
    db.pragma('journal_mode = TRUNCATE')
    db.exec('CREATE TABLE changes (id INTEGER PRIMARY KEY, blob TEXT)')
    expect(autoVacuum()).toBe(2) // INCREMENTAL

    seedRows(500)
    const grown = pageCount()
    const grownBytes = statSync(dbPath).size

    db.exec('DELETE FROM changes WHERE id >= 50')
    expect(freelistCount()).toBeGreaterThan(0)

    const reclaimed = db.pragma('incremental_vacuum') // hand pages back to the OS
    expect(reclaimed).toBeDefined()
    expect(pageCount()).toBeLessThan(grown)
    expect(freelistCount()).toBe(0)
    expect(statSync(dbPath).size).toBeLessThan(grownBytes)
  })

  it('a pre-existing NONE database is converted by one VACUUM, then reclaims per call', () => {
    // Simulate the user's fat, pre-existing database: created in NONE mode.
    db = new Database(dbPath)
    db.pragma('page_size = 8192')
    db.pragma('journal_mode = TRUNCATE')
    db.exec('CREATE TABLE changes (id INTEGER PRIMARY KEY, blob TEXT)')
    seedRows(500)
    expect(autoVacuum()).toBe(0)

    // Compaction deletes superseded history; incremental_vacuum can't help yet
    // because the DB is still NONE (matches the no-op guard in web.ts pre-VACUUM).
    db.exec('DELETE FROM changes WHERE id >= 250')
    db.pragma('auto_vacuum = INCREMENTAL') // intent; pending until a VACUUM
    db.pragma('incremental_vacuum')
    expect(autoVacuum()).toBe(0) // still NONE — not converted yet
    const beforeConvert = pageCount() // freelist pages still bloat the file

    // The one-time boot VACUUM performs the conversion (and compacts the file).
    db.exec('VACUUM')
    expect(autoVacuum()).toBe(2) // now INCREMENTAL, permanently (stored in header)
    expect(pageCount()).toBeLessThan(beforeConvert) // the one-time VACUUM compacted

    // From here every compaction pass reclaims incrementally, no full rewrite.
    seedRows(500, 1000) // fresh id range 1000..1499
    const afterReseed = pageCount()
    db.exec('DELETE FROM changes WHERE id >= 1000')
    expect(freelistCount()).toBeGreaterThan(0)
    db.pragma('incremental_vacuum')
    expect(freelistCount()).toBe(0)
    expect(pageCount()).toBeLessThan(afterReseed)
  })
})
