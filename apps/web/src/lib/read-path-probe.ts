/**
 * Read-path probe (exploration 0212).
 *
 * The recurring "no data until it syncs with the hub" symptom was always
 * debugged with SYNC-layer logs, which say nothing about the local read path:
 * whether the SQLite projection is even populated, or how fast the landing
 * queries resolve. A populated, durable cache (proven by a non-zero persisted
 * sync cursor) that still paints at "green" is a read-path/timing problem, not
 * an empty-cache problem — but the sync logs can't tell the two apart.
 *
 * This module instruments the LOCAL READ PATH:
 *
 *  - {@link logStoreContents} prints a one-shot count matrix — `nodes`,
 *    `node_properties`, `changes`, the persisted sync cursors and the last
 *    Lamport time — plus a verdict that classifies the boot:
 *      • nodes > 0            → projection populated; read path should paint.
 *      • changes only         → projection not materialized (a real data bug).
 *      • cursor only          → cursor persisted without data → the client
 *                               under-fetches from the hub (silent data loss).
 *      • all zero             → genuinely cold/evicted cache (the 0204 path).
 *  - {@link useQueryTimer} logs each landing query's fire→resolve latency and
 *    row count, which distinguishes "projection populated AND query fast"
 *    (read path works; symptom is serial boot / perception) from "projection
 *    populated but query slow" (starved behind the sync write burst, or a
 *    schema/startup-surface mismatch).
 *
 * All output is gated behind the existing `xnet:boot:debug` flag (or dev), so
 * production users pay nothing until they opt in for a capture.
 */
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { useEffect, useRef } from 'react'
import { isBootDebugEnabled } from './boot-timeline'

const SYNC_CURSOR_PREFIX = 'nodeSync:hwm:'

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export interface StoreContentsProbe {
  /** Materialized node rows the list/table queries read (-1 if the count failed). */
  nodes: number
  /** Materialized property rows (-1 if the count failed). */
  nodeProperties: number
  /** Append-only signed change-log rows (-1 if the count failed). */
  changes: number
  /** Persisted NodeStore Lamport high-water mark. */
  lastLamportTime: number
  /** Persisted per-room sync cursors (room → confirmed hub high-water mark). */
  syncCursors: Record<string, number>
  /** Human-readable classification of the boot (the R1–R5 matrix from 0212). */
  verdict: string
}

/**
 * Classify a boot from the durable counts. Pure so the matrix is unit-testable
 * without a database. `nodes > 0` can't by itself tell R1 (fast) from R2 (slow)
 * — that needs the per-query timing — so it points at the query timer.
 */
export function classifyStoreContents(nodes: number, changes: number, maxCursor: number): string {
  if (nodes < 0 || changes < 0) {
    // A COUNT query threw (e.g. a missing table). Don't infer "empty" from a
    // failed measurement — say so and let the raw counts in the probe speak.
    return 'count query failed (-1) — verdict unreliable; inspect the raw counts (R0)'
  }
  if (nodes > 0) {
    return 'projection populated — local read path should paint before sync; compare landing-query timings (R1 fast vs R2 starved/mismatched)'
  }
  if (changes > 0) {
    return 'PROJECTION EMPTY but change-log present — materialization/projection bug (R3)'
  }
  if (maxCursor > 0) {
    return 'CURSOR PERSISTED but no data — client will under-fetch from the hub; possible silent data loss (R4)'
  }
  return 'projection, change-log and cursor all empty — genuinely cold/evicted cache (R5)'
}

/** Read the durable count matrix. Never throws — a failed count reports -1. */
export async function probeStoreContents(
  adapter: Pick<SQLiteAdapter, 'query' | 'queryOne'>
): Promise<StoreContentsProbe> {
  const count = async (table: string): Promise<number> => {
    try {
      const row = await adapter.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
      return row ? Number(row.n) : 0
    } catch {
      return -1
    }
  }

  const [nodes, nodeProperties, changes] = await Promise.all([
    count('nodes'),
    count('node_properties'),
    count('changes')
  ])

  let lastLamportTime = 0
  const syncCursors: Record<string, number> = {}
  try {
    const rows = await adapter.query<{ key: string; value: string }>(
      'SELECT key, value FROM sync_state'
    )
    for (const row of rows) {
      if (row.key === 'lastLamportTime') {
        lastLamportTime = parseInt(row.value, 10) || 0
      } else if (row.key.startsWith(SYNC_CURSOR_PREFIX)) {
        syncCursors[row.key.slice(SYNC_CURSOR_PREFIX.length)] = parseInt(row.value, 10) || 0
      }
    }
  } catch {
    // sync_state may not exist on a brand-new database — treat as empty.
  }

  const maxCursor = Object.values(syncCursors).reduce((m, v) => Math.max(m, v), 0)
  return {
    nodes,
    nodeProperties,
    changes,
    lastLamportTime,
    syncCursors,
    verdict: classifyStoreContents(nodes, changes, maxCursor)
  }
}

/**
 * Log the durable count matrix once at boot, gated behind `xnet:boot:debug`
 * (or dev). The single most useful diagnostic for the "no data until sync"
 * report: it proves whether the local projection is populated independent of
 * the React store lifecycle. Never throws.
 */
export async function logStoreContents(
  adapter: Pick<SQLiteAdapter, 'query' | 'queryOne'>
): Promise<void> {
  if (!isBootDebugEnabled()) return
  try {
    const probe = await probeStoreContents(adapter)
    // eslint-disable-next-line no-console
    console.info('[xNet] read-path probe @ boot:', probe)
  } catch {
    // instrumentation must never break boot
  }
}

/**
 * Log a landing query's fire→resolve latency and row count the first time it
 * resolves. `t0` is captured on first render (query fire), so the latency is
 * the wall-clock a returning user waits for that section to paint. Gated
 * behind `xnet:boot:debug` (or dev); a no-op otherwise.
 */
export function useQueryTimer(label: string, loading: boolean, rowCount: number): void {
  const t0 = useRef(now())
  const logged = useRef(false)
  useEffect(() => {
    if (loading || logged.current || !isBootDebugEnabled()) return
    logged.current = true
    // eslint-disable-next-line no-console
    console.info(`[xNet] landing query ${label}: ${Math.round(now() - t0.current)}ms`, {
      rows: rowCount
    })
  }, [loading, rowCount, label])
}
