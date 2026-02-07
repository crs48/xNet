/**
 * @xnet/sqlite - Database diagnostics and analysis utilities
 *
 * These functions help debug performance issues, analyze query plans,
 * and inspect database state.
 */

import type { SQLiteAdapter } from './adapter'
import type { SQLValue } from './types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IndexInfo {
  name: string
  tableName: string
  unique: boolean
  columns: string[]
  partial: boolean
}

export interface TableStats {
  name: string
  rowCount: number
  pageCount: number
  unusedBytes: number
}

export interface QueryPlanStep {
  id: number
  parent: number
  detail: string
}

export interface DatabaseStats {
  pageSize: number
  pageCount: number
  freePageCount: number
  schemaVersion: number
  walMode: boolean
  foreignKeys: boolean
}

// ─── Index Analysis ──────────────────────────────────────────────────────────

/**
 * Get information about all indexes in the database.
 */
export async function getIndexInfo(db: SQLiteAdapter): Promise<IndexInfo[]> {
  interface IndexRow {
    name: string
    tbl_name: string
    sql: string | null
    [key: string]: SQLValue
  }

  const indexes = await db.query<IndexRow>(
    "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
  )

  const result: IndexInfo[] = []

  for (const idx of indexes) {
    // Get columns for this index
    interface IndexColRow {
      name: string
      [key: string]: SQLValue
    }
    const columns = await db.query<IndexColRow>(`PRAGMA index_info('${idx.name}')`)

    result.push({
      name: idx.name,
      tableName: idx.tbl_name,
      unique: idx.sql?.includes('UNIQUE') ?? false,
      columns: columns.map((c) => c.name),
      partial: idx.sql?.includes('WHERE') ?? false
    })
  }

  return result
}

/**
 * Check which indexes are being used for a query.
 */
export async function analyzeQuery(
  db: SQLiteAdapter,
  sql: string,
  params?: SQLValue[]
): Promise<{
  plan: QueryPlanStep[]
  usedIndexes: string[]
  fullTableScan: boolean
}> {
  // Use EXPLAIN QUERY PLAN
  interface PlanRow {
    id: number
    parent: number
    detail: string
    [key: string]: SQLValue
  }

  const plan = await db.query<PlanRow>(`EXPLAIN QUERY PLAN ${sql}`, params)

  const steps: QueryPlanStep[] = plan.map((row) => ({
    id: row.id,
    parent: row.parent,
    detail: row.detail
  }))

  // Extract index usage from plan details
  const usedIndexes: string[] = []
  let fullTableScan = false

  for (const step of steps) {
    const detail = step.detail.toUpperCase()

    // Check for index usage
    const indexMatch = step.detail.match(/USING (?:COVERING )?INDEX (\w+)/i)
    if (indexMatch) {
      usedIndexes.push(indexMatch[1])
    }

    // Check for full table scan
    if (detail.includes('SCAN TABLE') && !detail.includes('USING')) {
      fullTableScan = true
    }
  }

  return { plan: steps, usedIndexes, fullTableScan }
}

// ─── Table Analysis ──────────────────────────────────────────────────────────

/**
 * Get statistics about a table.
 */
export async function analyzeTable(db: SQLiteAdapter, tableName: string): Promise<TableStats> {
  // Get row count
  interface CountRow {
    count: number
    [key: string]: SQLValue
  }
  const countResult = await db.queryOne<CountRow>(`SELECT COUNT(*) as count FROM ${tableName}`)
  const rowCount = countResult?.count ?? 0

  // Get page info using dbstat (if available)
  interface PageRow {
    pageno: number
    unused: number
    [key: string]: SQLValue
  }

  let pageCount = 0
  let unusedBytes = 0

  try {
    const pages = await db.query<PageRow>(`SELECT pageno, unused FROM dbstat WHERE name = ?`, [
      tableName
    ])
    pageCount = pages.length
    unusedBytes = pages.reduce((sum, p) => sum + p.unused, 0)
  } catch {
    // dbstat not available
  }

  return {
    name: tableName,
    rowCount,
    pageCount,
    unusedBytes
  }
}

/**
 * Get statistics about all tables.
 */
export async function getAllTableStats(db: SQLiteAdapter): Promise<TableStats[]> {
  interface TableRow {
    name: string
    [key: string]: SQLValue
  }

  const tables = await db.query<TableRow>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  )

  const stats: TableStats[] = []
  for (const table of tables) {
    stats.push(await analyzeTable(db, table.name))
  }

  return stats.sort((a, b) => b.rowCount - a.rowCount)
}

// ─── Database Analysis ───────────────────────────────────────────────────────

/**
 * Get overall database statistics.
 */
export async function getDatabaseStats(db: SQLiteAdapter): Promise<DatabaseStats> {
  interface PragmaRow {
    [key: string]: SQLValue
  }

  const [pageSize, pageCount, freePageCount, schemaVersion, walMode, foreignKeys] =
    await Promise.all([
      db.queryOne<PragmaRow>('PRAGMA page_size'),
      db.queryOne<PragmaRow>('PRAGMA page_count'),
      db.queryOne<PragmaRow>('PRAGMA freelist_count'),
      db.queryOne<PragmaRow>('PRAGMA schema_version'),
      db.queryOne<PragmaRow>('PRAGMA journal_mode'),
      db.queryOne<PragmaRow>('PRAGMA foreign_keys')
    ])

  return {
    pageSize: Number(pageSize?.page_size ?? 4096),
    pageCount: Number(pageCount?.page_count ?? 0),
    freePageCount: Number(freePageCount?.freelist_count ?? 0),
    schemaVersion: Number(schemaVersion?.schema_version ?? 0),
    walMode: String(walMode?.journal_mode ?? '').toLowerCase() === 'wal',
    foreignKeys: Boolean(foreignKeys?.foreign_keys)
  }
}

/**
 * Run ANALYZE to update query planner statistics.
 */
export async function runAnalyze(db: SQLiteAdapter, tableName?: string): Promise<void> {
  if (tableName) {
    await db.exec(`ANALYZE ${tableName}`)
  } else {
    await db.exec('ANALYZE')
  }
}

/**
 * Check database integrity.
 */
export async function checkIntegrity(db: SQLiteAdapter): Promise<{
  ok: boolean
  errors: string[]
}> {
  interface IntegrityRow {
    integrity_check: string
    [key: string]: SQLValue
  }

  const results = await db.query<IntegrityRow>('PRAGMA integrity_check(100)')

  const errors: string[] = []
  for (const row of results) {
    if (row.integrity_check !== 'ok') {
      errors.push(row.integrity_check)
    }
  }

  return {
    ok: errors.length === 0,
    errors
  }
}

// ─── Query Explain ───────────────────────────────────────────────────────────

/**
 * Get the full EXPLAIN output for a query (bytecode).
 */
export async function explainQuery(
  db: SQLiteAdapter,
  sql: string,
  params?: SQLValue[]
): Promise<string[]> {
  interface ExplainRow {
    opcode: string
    p1: number
    p2: number
    p3: number
    p4: string
    p5: string
    comment: string
    [key: string]: SQLValue
  }

  const rows = await db.query<ExplainRow>(`EXPLAIN ${sql}`, params)

  return rows.map(
    (row) =>
      `${row.opcode.padEnd(15)} ${String(row.p1).padStart(4)} ${String(row.p2).padStart(4)} ${String(row.p3).padStart(4)} ${row.p4 || ''}`
  )
}

// ─── Slow Query Detection ────────────────────────────────────────────────────

/**
 * Time a query and return the result with timing info.
 */
export async function timeQuery<T>(
  db: SQLiteAdapter,
  sql: string,
  params?: SQLValue[]
): Promise<{
  result: T[]
  durationMs: number
  rowCount: number
}> {
  const start = performance.now()
  const result = await db.query<T & Record<string, SQLValue>>(sql, params)
  const durationMs = performance.now() - start

  return {
    result: result as T[],
    durationMs,
    rowCount: result.length
  }
}
