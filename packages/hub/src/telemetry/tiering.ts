/**
 * @xnetjs/hub - Telemetry tiering + retention (exploration 0187).
 *
 * Keeps the hot store bounded. Periodically:
 *   1. (optional) export raw events older than the retention window to columnar
 *      Parquet on R2/S3 via DuckDB — the cheap cold tier (~100x cheaper than
 *      block storage), queryable later with `read_parquet('s3://…')`.
 *   2. delete those aged raw rows from telemetry.db. Hourly rollups stay forever
 *      (tiny), so dashboard time-series survive the prune.
 *
 * The Parquet export is OPTIONAL and guarded: it needs `@duckdb/node-api`
 * (optional dep), a real telemetry.db file (not ':memory:'), and a configured
 * cold bucket + S3/R2 credentials. With none of those, tiering degrades to a
 * pure retention prune.
 */

import type { TelemetryStore } from './store'

const DUCKDB_MODULE = '@duckdb/node-api'
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6h

/** S3/R2 credentials for the cold-tier export. */
export interface ColdStorageCredentials {
  endpoint?: string // e.g. <account>.r2.cloudflarestorage.com
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
}

export interface TelemetryTieringConfig {
  store: TelemetryStore
  /** Raw events older than this are exported (if configured) then deleted. */
  retentionMs?: number
  /** Cold Parquet destination, e.g. 's3://xnet-telemetry'. When unset → prune only. */
  coldBucket?: string
  credentials?: ColdStorageCredentials
}

export interface TieringResult {
  mode: 'prune-only' | 'export-and-prune'
  exported: number
  deleted: number
}

const sqlLiteral = (value: string): string => value.replace(/'/g, "''")

/**
 * Export aged raw events to partitioned Parquet on R2/S3, then return how many
 * rows were written. Throws if DuckDB is unavailable. Partitioned by `kind` so
 * later `read_parquet` queries can prune by kind.
 */
async function exportColdTier(
  telemetryDbPath: string,
  cutoffMs: number,
  coldBucket: string,
  credentials: ColdStorageCredentials = {}
): Promise<number> {
  let duck: {
    DuckDBInstance: { create(path: string, config?: Record<string, string>): Promise<DuckInstance> }
  }
  try {
    duck = (await import(DUCKDB_MODULE)) as typeof duck
  } catch {
    throw new Error('@duckdb/node-api is not installed; cold-tier export unavailable')
  }

  const instance = await duck.DuckDBInstance.create(':memory:', {
    memory_limit: '256MB',
    threads: '1'
  })
  const conn = await instance.connect()
  try {
    await conn.run('INSTALL sqlite; LOAD sqlite; INSTALL httpfs; LOAD httpfs;')
    if (credentials.endpoint)
      await conn.run(`SET s3_endpoint = '${sqlLiteral(credentials.endpoint)}';`)
    if (credentials.region) await conn.run(`SET s3_region = '${sqlLiteral(credentials.region)}';`)
    if (credentials.accessKeyId)
      await conn.run(`SET s3_access_key_id = '${sqlLiteral(credentials.accessKeyId)}';`)
    if (credentials.secretAccessKey)
      await conn.run(`SET s3_secret_access_key = '${sqlLiteral(credentials.secretAccessKey)}';`)
    await conn.run(`ATTACH '${sqlLiteral(telemetryDbPath)}' AS tel (TYPE sqlite, READ_ONLY);`)

    const dest = `${coldBucket.replace(/\/+$/, '')}/events`
    await conn.run(
      `COPY (SELECT * FROM tel.telemetry_events WHERE ts < ${Math.floor(cutoffMs)})
       TO '${sqlLiteral(dest)}' (FORMAT parquet, COMPRESSION zstd, PARTITION_BY (kind), OVERWRITE_OR_IGNORE);`
    )
    const reader = await conn.runAndReadAll(
      `SELECT count(*) AS n FROM tel.telemetry_events WHERE ts < ${Math.floor(cutoffMs)}`
    )
    const rows = reader.getRowObjects()
    return Number(rows[0]?.n ?? 0)
  } finally {
    conn.closeSync?.()
  }
}

/**
 * Run one tiering pass: export-then-prune when a cold tier is configured and
 * available, else prune only.
 */
export async function runTelemetryTiering(config: TelemetryTieringConfig): Promise<TieringResult> {
  const retentionMs = config.retentionMs ?? DEFAULT_RETENTION_MS
  const cutoffMs = Date.now() - retentionMs
  const canExport = Boolean(config.coldBucket) && config.store.path !== ':memory:'

  let exported = 0
  let mode: TieringResult['mode'] = 'prune-only'
  if (canExport) {
    try {
      exported = await exportColdTier(
        config.store.path,
        cutoffMs,
        config.coldBucket as string,
        config.credentials
      )
      mode = 'export-and-prune'
    } catch {
      // Cold export unavailable (no DuckDB / creds) — fall back to prune only so
      // the hot store still stays bounded.
      mode = 'prune-only'
    }
  }

  const deleted = config.store.pruneRaw(retentionMs)
  return { mode, exported, deleted }
}

export interface TelemetryMaintenance {
  start(): void
  stop(): void
  /** Run a single tiering pass now (manual trigger / tests). */
  runOnce(): Promise<TieringResult>
}

export interface TelemetryMaintenanceConfig extends TelemetryTieringConfig {
  /** How often to run tiering. Default 6h. */
  intervalMs?: number
  onResult?: (result: TieringResult) => void
  onError?: (err: unknown) => void
}

/**
 * A periodic maintenance loop the server lifecycle can start on boot and stop on
 * shutdown. Idempotent start/stop; never throws from the timer (errors go to
 * `onError`).
 */
export function createTelemetryMaintenance(
  config: TelemetryMaintenanceConfig
): TelemetryMaintenance {
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS
  let timer: ReturnType<typeof setInterval> | null = null

  const runOnce = () => runTelemetryTiering(config)

  const tick = async () => {
    try {
      const result = await runOnce()
      config.onResult?.(result)
    } catch (err) {
      config.onError?.(err)
    }
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(() => void tick(), intervalMs)
      // Don't hold the event loop open in short-lived processes / tests.
      timer.unref?.()
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    runOnce
  }
}

// Minimal structural types for the DuckDB surface used here.
interface DuckInstance {
  connect(): Promise<DuckConnection>
}
interface DuckConnection {
  run(sql: string): Promise<unknown>
  runAndReadAll(sql: string): Promise<{ getRowObjects(): Array<Record<string, unknown>> }>
  closeSync?: () => void
}
