/**
 * @xnetjs/hub - Telemetry store (exploration 0187).
 *
 * A SQLite store that is DELIBERATELY SEPARATE from the main hub.db: telemetry
 * is high-volume, append-only, and privacy-bucketed, so it lives in its own
 * `telemetry.db` file with its own WAL, retention, and (optionally) Litestream
 * replication. Keeping it out of hub.db means telemetry writes never contend
 * with app writes on the single SQLite writer and the main DB stays clean.
 *
 * The store maintains a raw `telemetry_events` table plus an hourly rollup
 * (`telemetry_rollup_hourly`) updated on each ingest, so dashboard panels read
 * cheap pre-aggregated counts instead of scanning raw rows.
 */

import type { TelemetryEventInput } from './normalize'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { litestreamWalPragmas } from '../storage/litestream'

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    producer TEXT NOT NULL,
    did_hash TEXT,
    service_name TEXT,
    service_version TEXT,
    os_type TEXT,
    schema_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT,
    severity TEXT,
    value_bucket TEXT,
    trace_id TEXT,
    span_id TEXT,
    attributes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tel_ts ON telemetry_events(ts);
  CREATE INDEX IF NOT EXISTS idx_tel_kind ON telemetry_events(kind, ts);
  CREATE INDEX IF NOT EXISTS idx_tel_name ON telemetry_events(name, ts);

  CREATE TABLE IF NOT EXISTS telemetry_rollup_hourly (
    bucket INTEGER NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    value_bucket TEXT NOT NULL DEFAULT '',
    cnt INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, kind, name, value_bucket)
  );
  CREATE INDEX IF NOT EXISTS idx_tel_rollup_bucket ON telemetry_rollup_hourly(bucket);
`

const HOUR_MS = 3_600_000

/** A persisted telemetry event row (read shape). */
export interface TelemetryEventRow {
  id: number
  ts: number
  receivedAt: number
  producer: string
  didHash: string | null
  schemaId: string
  kind: string
  name: string | null
  severity: string | null
  valueBucket: string | null
  serviceName: string | null
  serviceVersion: string | null
  osType: string | null
  traceId: string | null
  spanId: string | null
  attributes: string | null
}

export interface RollupRow {
  bucket: number
  kind: string
  name: string
  valueBucket: string
  cnt: number
}

export interface TelemetryQueryFilter {
  kind?: string
  name?: string
  /** Only include events at/after this ms timestamp. */
  sinceMs?: number
  /** Only include events strictly before this ms timestamp. */
  untilMs?: number
  limit?: number
}

export interface TelemetryStore {
  /** Insert a batch of events in a single transaction. Returns rows written. */
  appendBatch(rows: TelemetryEventInput[]): number
  /** Hourly count time-series for the filter. */
  timeseries(filter?: TelemetryQueryFilter): Array<{ bucket: number; count: number }>
  /** Total event count per kind for the window. */
  kindCounts(filter?: TelemetryQueryFilter): Array<{ kind: string; count: number }>
  /** Top metric/event names by count for the window. */
  topNames(filter?: TelemetryQueryFilter): Array<{ kind: string; name: string; count: number }>
  /** Raw rollup rows (for the join/analytics layer). */
  rollups(filter?: TelemetryQueryFilter): RollupRow[]
  /** Most recent raw events (log view). */
  recentEvents(filter?: TelemetryQueryFilter): TelemetryEventRow[]
  /** Total raw event count. */
  count(): number
  /** Delete raw events older than `olderThanMs` (retention). Returns rows deleted. */
  pruneRaw(olderThanMs: number): number
  /** Absolute path to the DB file (for DuckDB ATTACH), or ':memory:'. */
  readonly path: string
  close(): void
}

const toHourBucket = (ts: number): number => Math.floor(ts / HOUR_MS) * HOUR_MS

/**
 * Open (or create) the telemetry store. Pass a data directory for a durable
 * `telemetry.db`, or ':memory:' for tests.
 */
export function createTelemetryStore(dataDirOrMemory: string): TelemetryStore {
  const isMemory = dataDirOrMemory === ':memory:'
  let dbPath = ':memory:'
  if (!isMemory) {
    mkdirSync(dataDirOrMemory, { recursive: true })
    dbPath = join(dataDirOrMemory, 'telemetry.db')
  }

  const db = new Database(dbPath)
  if (!isMemory) {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    // Same Litestream handoff as hub.db (exploration 0178): a second DB file
    // in the same data dir replicates for free.
    for (const pragma of litestreamWalPragmas()) db.pragma(pragma)
  }
  db.exec(SCHEMA_SQL)

  const insertEvent = db.prepare(`
    INSERT INTO telemetry_events (
      ts, received_at, producer, did_hash, service_name, service_version, os_type,
      schema_id, kind, name, severity, value_bucket, trace_id, span_id, attributes
    ) VALUES (
      @ts, @receivedAt, @producer, @didHash, @serviceName, @serviceVersion, @osType,
      @schemaId, @kind, @name, @severity, @valueBucket, @traceId, @spanId, @attributes
    )
  `)

  const upsertRollup = db.prepare(`
    INSERT INTO telemetry_rollup_hourly (bucket, kind, name, value_bucket, cnt)
    VALUES (@bucket, @kind, @name, @valueBucket, 1)
    ON CONFLICT(bucket, kind, name, value_bucket)
    DO UPDATE SET cnt = cnt + 1
  `)

  const appendOne = (row: TelemetryEventInput, now: number): void => {
    insertEvent.run({
      ts: row.ts,
      receivedAt: now,
      producer: row.producer,
      didHash: row.didHash,
      serviceName: row.serviceName,
      serviceVersion: row.serviceVersion,
      osType: row.osType,
      schemaId: row.schemaId,
      kind: row.kind,
      name: row.name,
      severity: row.severity,
      valueBucket: row.valueBucket,
      traceId: row.traceId,
      spanId: row.spanId,
      attributes: row.attributes
    })
    upsertRollup.run({
      bucket: toHourBucket(row.ts),
      kind: row.kind,
      name: row.name ?? '',
      valueBucket: row.valueBucket ?? ''
    })
  }

  const appendTxn = db.transaction((rows: TelemetryEventInput[], now: number) => {
    for (const row of rows) appendOne(row, now)
    return rows.length
  })

  /** Build a WHERE clause + params for the rollup table from a filter. */
  const rollupWhere = (filter?: TelemetryQueryFilter): { sql: string; params: unknown[] } => {
    const clauses: string[] = []
    const params: unknown[] = []
    if (filter?.kind) {
      clauses.push('kind = ?')
      params.push(filter.kind)
    }
    if (filter?.name) {
      clauses.push('name = ?')
      params.push(filter.name)
    }
    if (filter?.sinceMs !== undefined) {
      clauses.push('bucket >= ?')
      params.push(toHourBucket(filter.sinceMs))
    }
    if (filter?.untilMs !== undefined) {
      clauses.push('bucket < ?')
      params.push(filter.untilMs)
    }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
  }

  return {
    path: dbPath,

    appendBatch(rows) {
      if (rows.length === 0) return 0
      return appendTxn(rows, Date.now()) as number
    },

    timeseries(filter) {
      const { sql, params } = rollupWhere(filter)
      const rows = db
        .prepare(
          `SELECT bucket, SUM(cnt) AS count FROM telemetry_rollup_hourly ${sql}
           GROUP BY bucket ORDER BY bucket ASC`
        )
        .all(...params) as Array<{ bucket: number; count: number }>
      return rows
    },

    kindCounts(filter) {
      const { sql, params } = rollupWhere(filter)
      return db
        .prepare(
          `SELECT kind, SUM(cnt) AS count FROM telemetry_rollup_hourly ${sql}
           GROUP BY kind ORDER BY count DESC`
        )
        .all(...params) as Array<{ kind: string; count: number }>
    },

    topNames(filter) {
      const { sql, params } = rollupWhere(filter)
      const limit = Math.min(filter?.limit ?? 20, 200)
      return db
        .prepare(
          `SELECT kind, name, SUM(cnt) AS count FROM telemetry_rollup_hourly
           ${sql ? sql + ' AND' : 'WHERE'} name <> ''
           GROUP BY kind, name ORDER BY count DESC LIMIT ?`
        )
        .all(...params, limit) as Array<{ kind: string; name: string; count: number }>
    },

    rollups(filter) {
      const { sql, params } = rollupWhere(filter)
      const limit = Math.min(filter?.limit ?? 1000, 10_000)
      return db
        .prepare(
          `SELECT bucket, kind, name, value_bucket AS valueBucket, cnt
           FROM telemetry_rollup_hourly ${sql} ORDER BY bucket DESC LIMIT ?`
        )
        .all(...params, limit) as RollupRow[]
    },

    recentEvents(filter) {
      const clauses: string[] = []
      const params: unknown[] = []
      if (filter?.kind) {
        clauses.push('kind = ?')
        params.push(filter.kind)
      }
      if (filter?.name) {
        clauses.push('name = ?')
        params.push(filter.name)
      }
      if (filter?.sinceMs !== undefined) {
        clauses.push('ts >= ?')
        params.push(filter.sinceMs)
      }
      if (filter?.untilMs !== undefined) {
        clauses.push('ts < ?')
        params.push(filter.untilMs)
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      const limit = Math.min(filter?.limit ?? 100, 1000)
      return db
        .prepare(
          `SELECT id, ts, received_at AS receivedAt, producer, did_hash AS didHash,
                  service_name AS serviceName, service_version AS serviceVersion,
                  os_type AS osType, schema_id AS schemaId, kind, name, severity,
                  value_bucket AS valueBucket, trace_id AS traceId, span_id AS spanId, attributes
           FROM telemetry_events ${where} ORDER BY ts DESC LIMIT ?`
        )
        .all(...params, limit) as TelemetryEventRow[]
    },

    count() {
      const row = db.prepare('SELECT COUNT(*) AS n FROM telemetry_events').get() as { n: number }
      return row.n
    },

    pruneRaw(olderThanMs) {
      const cutoff = Date.now() - olderThanMs
      const info = db.prepare('DELETE FROM telemetry_events WHERE ts < ?').run(cutoff)
      return info.changes
    },

    close() {
      db.close()
    }
  }
}
