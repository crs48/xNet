/**
 * @xnetjs/hub - Litestream-aware SQLite pragmas + replication-freshness readout.
 *
 * When the managed fleet runs the hub under Litestream (replicating the SQLite WAL
 * to R2 — exploration 0178), SQLite must NOT autocheckpoint: Litestream holds a long
 * read transaction to control checkpointing, and a competing autocheckpoint silently
 * drops WAL frames. Self-host (no `LITESTREAM` env) keeps SQLite's default behavior so
 * the WAL stays bounded without Litestream.
 *
 * The reader half (exploration 0288) scrapes Litestream's Prometheus metrics to
 * derive a live `lastSyncMs`, so `GET /health` can publish a real backup-freshness
 * signal and the control plane can gate cold-demotion on it. Pure + unit-testable.
 */

/** Extra pragmas to apply when Litestream owns checkpointing; `[]` otherwise. */
export function litestreamWalPragmas(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.LITESTREAM === '1' ? ['wal_autocheckpoint = 0'] : []
}

/**
 * Sum the `litestream_replica_operation_total` counter across every replica/label
 * set in a Litestream Prometheus metrics dump, or `null` if the metric is absent.
 *
 * This counter increments whenever Litestream pushes WAL/snapshot data to R2, so a
 * rising value is a version-independent "the replica actually synced" signal — more
 * robust than depending on a specific gauge name across Litestream releases
 * (exploration 0288). Pure + unit-testable.
 */
export function parseLitestreamOperationTotal(metricsText: string): number | null {
  let total: number | null = null
  for (const raw of metricsText.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^litestream_replica_operation_total\S*\s+([0-9.eE+-]+)$/.exec(line)
    if (m) total = (total ?? 0) + Number(m[1])
  }
  return total
}

/** Fetch Litestream's metrics text from its localhost `addr`, or `null` on any error. */
export async function readLitestreamMetrics(
  url = 'http://127.0.0.1:9090/metrics',
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchImpl(url)
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/**
 * Tracks a live `lastSyncMs` from repeated Litestream metrics scrapes. Because
 * Litestream exposes sync *operations* rather than a wall-clock "last sync at"
 * gauge, we infer the sync time: whenever the operation counter advances between
 * observations, the replica just synced → stamp `now`. The first observation
 * establishes a baseline and is treated as a liveness point (the replica is
 * reachable and has a WAL position). Returns `null` until the first observation.
 */
export class LitestreamSyncTracker {
  private prevTotal: number | null = null
  private lastSyncMs: number | null = null

  /** Feed a metrics dump; returns the current best `lastSyncMs` (or null). */
  observe(metricsText: string, nowMs: number): number | null {
    const total = parseLitestreamOperationTotal(metricsText)
    if (total === null) return this.lastSyncMs
    if (this.prevTotal === null || total > this.prevTotal) {
      this.prevTotal = total
      this.lastSyncMs = nowMs
    }
    return this.lastSyncMs
  }

  get value(): number | null {
    return this.lastSyncMs
  }
}

/**
 * Is the R2 replica fresh enough to trust? Fails closed on an unknown sync time
 * (`lastSyncMs === null`) so a scrape failure never reads as "backed up". A null
 * `lastWriteMs` means nothing has been written, so there is nothing to sync → fresh.
 * Local mirror of `@xnetjs/cloud`'s `isReplicaFresh` to avoid a hub→cloud dep.
 */
export function isBackupFresh(
  lastWriteMs: number | null,
  lastSyncMs: number | null,
  maxLagMs = 5 * 60_000
): boolean {
  if (lastSyncMs === null) return false
  if (lastWriteMs === null) return true
  return lastWriteMs - lastSyncMs <= maxLagMs
}
