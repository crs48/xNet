/**
 * Pins the WASM-binding defect behind the compaction reclaim being a silent
 * near-no-op (found by seeding a 464 MB replica of a bloated profile and
 * watching `reclaimed: true` leave the file at full size, 2026-07-05):
 *
 * SQLite frees ONE freelist page per `sqlite3_step` of
 * `PRAGMA incremental_vacuum`, and the oo1 `exec` path steps a statement only
 * once when it collects no rows — so `exec('PRAGMA incremental_vacuum')` freed
 * exactly one page per call (with or without a page-count argument). This is a
 * *binding* behaviour, invisible to the better-sqlite3 test that "proved" the
 * reclaim (better-sqlite3's pragma() steps to completion), so it must be pinned
 * against the real @sqlite.org/sqlite-wasm oo1 API the web worker uses.
 *
 * `stepIncrementalVacuumToCompletion` is the fix: step until done (or a cap).
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stepIncrementalVacuumToCompletion } from './web'

type Oo1Db = {
  exec(sql: string): unknown
  selectValue(sql: string): unknown
  prepare(sql: string): {
    step(): boolean
    finalize(): unknown
    bind(v: unknown[]): { stepReset(): unknown }
  }
  close(): void
}

let db: Oo1Db

function freelist(): number {
  return Number(db.selectValue('PRAGMA freelist_count'))
}
function pageCount(): number {
  return Number(db.selectValue('PRAGMA page_count'))
}

/** Seed rows then delete most of them, leaving a large freelist. */
function bloat(): void {
  db.exec('BEGIN')
  const ins = db.prepare('INSERT INTO t (blob) VALUES (?)')
  const big = new Uint8Array(4096).fill(7)
  for (let i = 0; i < 3000; i++) ins.bind([big]).stepReset()
  ins.finalize()
  db.exec('COMMIT')
  db.exec('DELETE FROM t WHERE id IN (SELECT id FROM t ORDER BY id LIMIT 2800)')
}

beforeAll(async () => {
  const sqlite3 = await sqlite3InitModule()
  db = new sqlite3.oo1.DB(':memory:') as unknown as Oo1Db
  db.exec('PRAGMA auto_vacuum = INCREMENTAL')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, blob BLOB)')
  db.exec('VACUUM') // apply the pending INCREMENTAL mode
  expect(Number(db.selectValue('PRAGMA auto_vacuum'))).toBe(2)
})

afterAll(() => {
  db?.close()
})

describe('incremental_vacuum stepping on the WASM oo1 binding', () => {
  it('exec frees only ONE page per call — the bug this guards against', () => {
    bloat()
    const before = freelist()
    expect(before).toBeGreaterThan(1000)

    db.exec('PRAGMA incremental_vacuum')
    expect(freelist()).toBe(before - 1)

    // The page-count argument does not help: still one page per exec.
    db.exec('PRAGMA incremental_vacuum(500)')
    expect(freelist()).toBe(before - 2)
  })

  it('stepIncrementalVacuumToCompletion drains the whole freelist and shrinks the db', () => {
    const before = freelist()
    const pagesBefore = pageCount()
    expect(before).toBeGreaterThan(1000)

    const freed = stepIncrementalVacuumToCompletion(db)

    expect(freed).toBe(before)
    expect(freelist()).toBe(0)
    expect(pageCount()).toBeLessThan(pagesBefore - before + 8)
  })

  it('honours the maxPages cap', () => {
    bloat()
    const before = freelist()
    expect(before).toBeGreaterThan(200)

    const freed = stepIncrementalVacuumToCompletion(db, 100)
    expect(freed).toBe(100)
    expect(freelist()).toBe(before - 100)

    // Drain the rest so the suite leaves a clean db.
    expect(stepIncrementalVacuumToCompletion(db)).toBe(before - 100)
    expect(freelist()).toBe(0)
  })
})
