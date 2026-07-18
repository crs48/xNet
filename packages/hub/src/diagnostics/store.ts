/**
 * @xnetjs/hub — SQLite quarantine for the diagnostics inbox (exploration 0341).
 *
 * The hub-side `DebugReportStore`: crash/debug reports quarantined on the
 * deployment's OWN hub, in their own `diagnostics.db` (the 0187 telemetry.db
 * pattern — separate file, own WAL, Litestream replicates it for free, and
 * quarantine writes never contend with app writes on hub.db's single writer).
 *
 * Bounded by construction (the 0291 lesson — quotas that aren't enforced
 * don't exist): beyond time-based retention (`prune`), `put` enforces a hard
 * row cap by evicting the oldest DRAINED records first. Pending records are
 * never evicted here — the inbox feature instead refuses NEW reports with 507
 * when pending alone reaches the cap, so an unread quarantine backpressures
 * instead of silently dropping triage state.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  toSummaryIssue,
  type DebugReportRecord,
  type DebugReportStore,
  type DiagnosticsSummary
} from '@xnetjs/telemetry/inbox'
import Database from 'better-sqlite3'
import { litestreamWalPragmas } from '../storage/litestream'

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS debug_reports (
    id TEXT PRIMARY KEY,
    lane TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    issue_key TEXT,
    error_name TEXT NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    release TEXT,
    surface TEXT NOT NULL,
    boot_stage TEXT,
    ua_family TEXT,
    user_description TEXT,
    breadcrumbs TEXT,
    did_hash TEXT,
    occurrences INTEGER NOT NULL,
    status TEXT NOT NULL,
    first_seen_ms INTEGER NOT NULL,
    last_seen_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dr_status ON debug_reports(status, first_seen_ms);
  CREATE INDEX IF NOT EXISTS idx_dr_last_seen ON debug_reports(last_seen_ms);
`

/** Hard row cap — quarantine disk stays bounded no matter what floods in. */
export const DEFAULT_MAX_ROWS = 10_000

interface Row {
  id: string
  lane: string
  fingerprint: string
  issue_key: string | null
  error_name: string
  message: string
  stack: string | null
  release: string | null
  surface: string
  boot_stage: string | null
  ua_family: string | null
  user_description: string | null
  breadcrumbs: string | null
  did_hash: string | null
  occurrences: number
  status: string
  first_seen_ms: number
  last_seen_ms: number
}

const toRecord = (row: Row): DebugReportRecord => ({
  id: row.id,
  lane: row.lane as DebugReportRecord['lane'],
  fingerprint: row.fingerprint,
  issueKey: row.issue_key ?? undefined,
  errorName: row.error_name,
  message: row.message,
  stack: row.stack ?? undefined,
  release: row.release ?? undefined,
  surface: row.surface as DebugReportRecord['surface'],
  bootStage: row.boot_stage ?? undefined,
  uaFamily: row.ua_family ?? undefined,
  userDescription: row.user_description ?? undefined,
  breadcrumbs: row.breadcrumbs ? (JSON.parse(row.breadcrumbs) as string[]) : undefined,
  didHash: row.did_hash ?? undefined,
  occurrences: row.occurrences,
  status: row.status as DebugReportRecord['status'],
  firstSeenMs: row.first_seen_ms,
  lastSeenMs: row.last_seen_ms
})

export interface SqliteDebugReportStoreOptions {
  /** Row cap enforced on every put (default 10k). */
  maxRows?: number
}

export interface HubDebugReportStore extends DebugReportStore {
  summary(topN?: number): Promise<DiagnosticsSummary>
  pendingCount(): Promise<number>
  readonly path: string
  close(): void
}

/**
 * Open (or create) the diagnostics quarantine. Pass a data directory for a
 * durable `diagnostics.db`, or ':memory:' for tests.
 */
export function createSqliteDebugReportStore(
  dataDirOrMemory: string,
  options: SqliteDebugReportStoreOptions = {}
): HubDebugReportStore {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
  const isMemory = dataDirOrMemory === ':memory:'
  let dbPath = ':memory:'
  if (!isMemory) {
    mkdirSync(dataDirOrMemory, { recursive: true })
    dbPath = join(dataDirOrMemory, 'diagnostics.db')
  }

  const db = new Database(dbPath)
  if (!isMemory) {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    // Same Litestream handoff as hub.db/telemetry.db (exploration 0178).
    for (const pragma of litestreamWalPragmas()) db.pragma(pragma)
  }
  db.exec(SCHEMA_SQL)

  const upsert = db.prepare(`
    INSERT INTO debug_reports (
      id, lane, fingerprint, issue_key, error_name, message, stack, release, surface,
      boot_stage, ua_family, user_description, breadcrumbs, did_hash,
      occurrences, status, first_seen_ms, last_seen_ms
    ) VALUES (
      @id, @lane, @fingerprint, @issueKey, @errorName, @message, @stack, @release, @surface,
      @bootStage, @uaFamily, @userDescription, @breadcrumbs, @didHash,
      @occurrences, @status, @firstSeenMs, @lastSeenMs
    )
    ON CONFLICT(id) DO UPDATE SET
      message = excluded.message,
      stack = excluded.stack,
      occurrences = excluded.occurrences,
      status = excluded.status,
      last_seen_ms = excluded.last_seen_ms
  `)
  const selectOne = db.prepare('SELECT * FROM debug_reports WHERE id = ?')
  const selectPending = db.prepare(
    "SELECT * FROM debug_reports WHERE status = 'pending' ORDER BY first_seen_ms ASC LIMIT ?"
  )
  const markDrained = db.prepare(
    "UPDATE debug_reports SET status = 'drained' WHERE id = ? AND status != 'drained'"
  )
  const deleteStale = db.prepare(
    "DELETE FROM debug_reports WHERE status = 'drained' AND last_seen_ms < ?"
  )
  const countAll = db.prepare('SELECT COUNT(*) AS n FROM debug_reports')
  const countPending = db.prepare(
    "SELECT COUNT(*) AS n FROM debug_reports WHERE status = 'pending'"
  )
  const lastSeen = db.prepare('SELECT MAX(last_seen_ms) AS m FROM debug_reports')
  const topByOccurrences = db.prepare(
    'SELECT * FROM debug_reports ORDER BY occurrences DESC, last_seen_ms DESC LIMIT ?'
  )
  // Eviction: oldest DRAINED first, never pending (triage state is sacred).
  const evictDrained = db.prepare(`
    DELETE FROM debug_reports WHERE id IN (
      SELECT id FROM debug_reports WHERE status = 'drained'
      ORDER BY last_seen_ms ASC LIMIT ?
    )
  `)

  return {
    path: dbPath,

    async get(id: string): Promise<DebugReportRecord | null> {
      const row = selectOne.get(id) as Row | undefined
      return row ? toRecord(row) : null
    },

    async put(record: DebugReportRecord): Promise<void> {
      upsert.run({
        id: record.id,
        lane: record.lane,
        fingerprint: record.fingerprint,
        issueKey: record.issueKey ?? null,
        errorName: record.errorName,
        message: record.message,
        stack: record.stack ?? null,
        release: record.release ?? null,
        surface: record.surface,
        bootStage: record.bootStage ?? null,
        uaFamily: record.uaFamily ?? null,
        userDescription: record.userDescription ?? null,
        breadcrumbs: record.breadcrumbs ? JSON.stringify(record.breadcrumbs) : null,
        didHash: record.didHash ?? null,
        occurrences: record.occurrences,
        status: record.status,
        firstSeenMs: record.firstSeenMs,
        lastSeenMs: record.lastSeenMs
      })
      const total = (countAll.get() as { n: number }).n
      if (total > maxRows) evictDrained.run(total - maxRows)
    },

    async listPending(limit = 100): Promise<DebugReportRecord[]> {
      return (selectPending.all(limit) as Row[]).map(toRecord)
    },

    async ack(ids: string[]): Promise<number> {
      let changed = 0
      const tx = db.transaction((toAck: string[]) => {
        for (const id of toAck) changed += markDrained.run(id).changes
      })
      tx(ids)
      return changed
    },

    async prune(keepMs: number, nowMs: number): Promise<number> {
      return deleteStale.run(nowMs - keepMs).changes
    },

    async summary(topN = 5): Promise<DiagnosticsSummary> {
      const total = (countAll.get() as { n: number }).n
      const pending = (countPending.get() as { n: number }).n
      const m = (lastSeen.get() as { m: number | null }).m
      return {
        pending,
        drained: total - pending,
        total,
        lastSeenMs: m ?? null,
        topIssues: (topByOccurrences.all(topN) as Row[]).map((row) =>
          toSummaryIssue(toRecord(row))
        )
      }
    },

    async pendingCount(): Promise<number> {
      return (countPending.get() as { n: number }).n
    },

    close(): void {
      db.close()
    }
  }
}
