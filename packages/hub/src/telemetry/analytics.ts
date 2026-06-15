/**
 * @xnetjs/hub - Lazy DuckDB analytics for telemetry (exploration 0187).
 *
 * DuckDB is the only embedded engine that can ATTACH both telemetry.db AND
 * hub.db and JOIN across them in one SQL statement — the answer to "join
 * telemetry with canonical xNet data". It is loaded LAZILY and OPTIONALLY:
 * `@duckdb/node-api` is NOT a hard dependency (it carries a native binary and
 * can't be Litestream-replicated), so it is resolved at call time and a clear
 * error is thrown when it isn't installed.
 *
 * Each query spins up an in-memory DuckDB capped to a small memory budget,
 * attaches both SQLite files READ-ONLY, runs one query, and tears the instance
 * down to free RAM. Read-only ATTACH is safe while better-sqlite3 holds the
 * write lock; the two libraries bundle their own SQLite copies.
 *
 * SQL is NOT taken from untrusted callers — the hub exposes named/allowlisted
 * aggregates, never arbitrary ad-hoc SQL over HTTP (exploration 0187 risk note).
 */

// Non-literal specifier so TypeScript does not try to resolve the optional
// module at build time; it stays a runtime dynamic import returning `unknown`.
const DUCKDB_MODULE = '@duckdb/node-api'

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

let availability: boolean | null = null

/** Whether @duckdb/node-api can be loaded in this process. Cached. */
export async function isDuckDbAvailable(): Promise<boolean> {
  if (availability !== null) return availability
  try {
    await import(DUCKDB_MODULE)
    availability = true
  } catch {
    availability = false
  }
  return availability
}

/** Reset the cached availability flag (tests). */
export function resetDuckDbAvailabilityCache(): void {
  availability = null
}

const sqlLiteral = (value: string): string => value.replace(/'/g, "''")

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
  let duck: {
    DuckDBInstance: { create(path: string, config?: Record<string, string>): Promise<DuckInstance> }
  }
  try {
    duck = (await import(DUCKDB_MODULE)) as typeof duck
  } catch {
    throw new Error(
      '@duckdb/node-api is not installed. Install it on the hub to enable joined/columnar telemetry analytics.'
    )
  }

  const instance = await duck.DuckDBInstance.create(':memory:', {
    memory_limit: opts.memoryLimit ?? '256MB',
    threads: String(opts.threads ?? 1)
  })
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

// Minimal structural types for the slice of the DuckDB API we use.
interface DuckInstance {
  connect(): Promise<DuckConnection>
}
interface DuckConnection {
  run(sql: string): Promise<unknown>
  runAndReadAll(sql: string): Promise<{ getRowObjects(): Array<Record<string, unknown>> }>
  closeSync?: () => void
}
