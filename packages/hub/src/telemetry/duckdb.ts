/**
 * @xnetjs/hub - Optional DuckDB loader (exploration 0187).
 *
 * `@duckdb/node-api` is NOT a hard dependency (native binary, can't be
 * Litestream-replicated), so it's resolved lazily via a non-literal specifier —
 * TypeScript leaves it a runtime dynamic import and never tries to type-resolve
 * the optional module. Shared by the analytics (join) and tiering (cold export)
 * paths so the load/guard logic lives in one place.
 */

// Non-literal so the bundler/tsc does not resolve the optional module at build.
const DUCKDB_MODULE = '@duckdb/node-api'

/** Minimal structural slice of the DuckDB Node API we use. */
export interface DuckModule {
  DuckDBInstance: {
    create(path: string, config?: Record<string, string>): Promise<DuckInstance>
  }
}
export interface DuckInstance {
  connect(): Promise<DuckConnection>
}
export interface DuckConnection {
  run(sql: string): Promise<unknown>
  runAndReadAll(sql: string): Promise<{ getRowObjects(): Array<Record<string, unknown>> }>
  closeSync?: () => void
}

let availability: boolean | null = null

/** Whether `@duckdb/node-api` can be loaded in this process. Cached. */
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

/** Load DuckDB or throw a clear, actionable error. */
export async function loadDuckDb(context = 'telemetry analytics'): Promise<DuckModule> {
  try {
    return (await import(DUCKDB_MODULE)) as DuckModule
  } catch {
    throw new Error(`@duckdb/node-api is not installed; ${context} unavailable`)
  }
}

/** Escape a value for a single-quoted SQL literal. */
export const sqlLiteral = (value: string): string => value.replace(/'/g, "''")

/** Create an in-memory DuckDB instance with a small, capped footprint. */
export async function createCappedInstance(
  duck: DuckModule,
  memoryLimit = '256MB',
  threads = 1
): Promise<DuckInstance> {
  return duck.DuckDBInstance.create(':memory:', {
    memory_limit: memoryLimit,
    threads: String(threads)
  })
}
