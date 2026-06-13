/**
 * @xnetjs/cloud-litestream — replication freshness.
 *
 * Pure helpers behind two checks from exploration 0178: the replication-freshness
 * alert (warn if the replica lags writes by more than a threshold) and the
 * "confirm final sync before demoting/destroying a cold tenant" gate.
 */

/** How far the replica is behind the DB, in ms (0 if caught up). */
export function replicaLagMs(lastWriteMs: number, lastSyncMs: number): number {
  return Math.max(0, lastWriteMs - lastSyncMs)
}

/** True if the replica is within `maxLagMs` of the latest write. */
export function isReplicaFresh(lastWriteMs: number, lastSyncMs: number, maxLagMs: number): boolean {
  return replicaLagMs(lastWriteMs, lastSyncMs) <= maxLagMs
}

/**
 * Safe to destroy a tenant's live DB only once every write is durable in R2
 * (`lastSyncMs >= lastWriteMs`) — the demotion gate.
 */
export function isFullySynced(lastWriteMs: number, lastSyncMs: number): boolean {
  return lastSyncMs >= lastWriteMs
}
