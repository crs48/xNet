/**
 * @xnetjs/hub - Lazy DuckDB analytics for telemetry (exploration 0187).
 *
 * DuckDB is the only embedded engine that can ATTACH both telemetry.db AND
 * hub.db and JOIN across them in one SQL statement — the answer to "join
 * telemetry with canonical xNet data". Each query spins up an in-memory DuckDB
 * capped to a small memory budget, attaches both SQLite files READ-ONLY, runs
 * one query, and tears the instance down. Read-only ATTACH is safe while
 * better-sqlite3 holds the write lock.
 *
 * SQL is NOT taken from untrusted callers — the hub exposes named/allowlisted
 * aggregates, never arbitrary ad-hoc SQL over HTTP (exploration 0187 risk note).
 */

import { createCappedInstance, loadDuckDb, sqlLiteral } from './duckdb'

export { isDuckDbAvailable, resetDuckDbAvailabilityCache } from './duckdb'

export interface TelemetryJoinPaths {
  /** Absolute path to telemetry.db (must be a real file, not ':memory:'). */
  telemetryDb: string
  /** Absolute path to hub.db. */
  hubDb: string
}

export interface DuckDbQueryOptions {
  /** DuckDB memory_limit. Default '256MB'. */
  memoryLimit?: string
  /** DuckDB threads. Default 1. */
  threads?: number
}

/**
 * Run a single read-only SQL query with both SQLite databases attached as
 * `tel` (telemetry.db) and `app` (hub.db). Throws if DuckDB is not installed.
 *
 * @example
 * runTelemetryJoinQuery(
 *   `SELECT app.doc_meta.title AS space, count(*) AS events
 *    FROM tel.telemetry_events e
 *    JOIN app.node_container nc ON nc.node_id = e.attributes ->> '$.spaceId'
 *    JOIN app.doc_meta ON app.doc_meta.doc_id = nc.container_id
 *    WHERE e.kind = 'usage' GROUP BY 1 ORDER BY 2 DESC`,
 *   { telemetryDb, hubDb }
 * )
 */
export async function runTelemetryJoinQuery(
  sql: string,
  paths: TelemetryJoinPaths,
  opts: DuckDbQueryOptions = {}
): Promise<Array<Record<string, unknown>>> {
  const duck = await loadDuckDb('joined/columnar telemetry analytics')
  const instance = await createCappedInstance(duck, opts.memoryLimit ?? '256MB', opts.threads ?? 1)
  const conn = await instance.connect()
  try {
    await conn.run('INSTALL sqlite; LOAD sqlite;')
    await conn.run(`ATTACH '${sqlLiteral(paths.telemetryDb)}' AS tel (TYPE sqlite, READ_ONLY);`)
    await conn.run(`ATTACH '${sqlLiteral(paths.hubDb)}' AS app (TYPE sqlite, READ_ONLY);`)
    const reader = await conn.runAndReadAll(sql)
    return reader.getRowObjects()
  } finally {
    conn.closeSync?.()
  }
}
