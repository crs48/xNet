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

import type { DuckConnection } from './duckdb'
import type { TelemetryStore } from './store'
import { createCappedInstance, loadDuckDb, sqlLiteral } from './duckdb'

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

/** Apply the (optional) S3/R2 credentials as DuckDB session settings. */
async function applyS3Credentials(
  conn: DuckConnection,
  credentials: ColdStorageCredentials
): Promise<void> {
  const settings: Array<[string, string | undefined]> = [
    ['s3_endpoint', credentials.endpoint],
    ['s3_region', credentials.region],
    ['s3_access_key_id', credentials.accessKeyId],
    ['s3_secret_access_key', credentials.secretAccessKey]
  ]
  for (const [key, value] of settings) {
    if (value) await conn.run(`SET ${key} = '${sqlLiteral(value)}';`)
  }
}

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
  const cutoff = Math.floor(cutoffMs)
  const duck = await loadDuckDb('cold-tier export')
  const instance = await createCappedInstance(duck)
  const conn = await instance.connect()
  try {
    await conn.run('INSTALL sqlite; LOAD sqlite; INSTALL httpfs; LOAD httpfs;')
    await applyS3Credentials(conn, credentials)
    await conn.run(`ATTACH '${sqlLiteral(telemetryDbPath)}' AS tel (TYPE sqlite, READ_ONLY);`)

    const dest = `${coldBucket.replace(/\/+$/, '')}/events`
    const where = `tel.telemetry_events WHERE ts < ${cutoff}`
    await conn.run(
      `COPY (SELECT * FROM ${where})
       TO '${sqlLiteral(dest)}' (FORMAT parquet, COMPRESSION zstd, PARTITION_BY (kind), OVERWRITE_OR_IGNORE);`
    )
    const reader = await conn.runAndReadAll(`SELECT count(*) AS n FROM ${where}`)
    return Number(reader.getRowObjects()[0]?.n ?? 0)
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
