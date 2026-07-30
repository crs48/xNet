/**
 * xNet Cloud — cold-demotion sync gate (exploration 0288).
 *
 * `ControlPlane.demoteIfCold` destroys a tenant's live volume + machine; the DB
 * then lives only in R2. That is safe ONLY if every write is already durable there.
 * This builds the `assertSynced` gate the demotion path requires, backed by the
 * hub's public `/health` `backup.fresh` signal — and it **fails closed**: an
 * unreachable hub, a missing field, or a stale replica all read as "not synced",
 * so a volume is never destroyed on an unproven backup.
 */

import { fetchHubHealth, type HubHealth } from '../hub-status'

/**
 * True only when the hub reports a fresh R2 replica. `fresh` is the hub's own
 * verdict (measured `lastSyncMs` within the lag budget); absent/false/unknown all
 * fail closed.
 */
export function backupSynced(health: HubHealth | null): boolean {
  return Boolean(health?.backup?.fresh)
}

/**
 * Build the `assertSynced(tenantId)` predicate `demoteIfCold` takes, resolving each
 * tenant's hub URL then reading its `/health`. A tenant with no live hub URL cannot
 * be confirmed synced → fail closed (don't demote).
 */
export function assertSyncedViaHealth(
  hubUrlOf: (tenantId: string) => Promise<string | null>,
  fetchHealth: typeof fetchHubHealth = fetchHubHealth
): (tenantId: string) => Promise<boolean> {
  return async (tenantId: string): Promise<boolean> => {
    const url = await hubUrlOf(tenantId)
    if (!url) return false
    return backupSynced(await fetchHealth(url))
  }
}
