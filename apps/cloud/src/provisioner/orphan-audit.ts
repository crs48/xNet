/**
 * xNet Cloud — orphaned-hub audit (0411 G1).
 *
 * Before the compensating saga landed, a `provisionTenant` that failed after the
 * hub was created left a running, billable Cloud Run service that no
 * `TenantRecord` referenced. The saga stops NEW orphans; this finds any the old
 * code already made.
 *
 * The comparison logic is a pure set difference so it is testable without GCP;
 * the credentials-only part is listing live services, which the caller supplies.
 */

import type { TenantRecord } from '../registry'

/** A service as seen on the substrate, independent of what we think we own. */
export interface LiveService {
  /** The `substrateRef` the provisioner would use for this service. */
  substrateRef: string
  /** Tenant id parsed from the resource name, when derivable. */
  tenantId?: string
}

export interface OrphanReport {
  /** Live services with no tenant record pointing at them — the billable leak. */
  orphans: LiveService[]
  /** Records whose hub is gone — the opposite drift (a tenant with no hub). */
  danglingRecords: string[]
  liveCount: number
  recordCount: number
}

/**
 * Compare live services against tenant records.
 *
 * Deliberately reports both directions. An orphaned service costs money; a
 * dangling record means a tenant whose hub vanished. Collapsing them into one
 * "mismatch" count would hide which of the two is happening.
 */
export function findOrphans(live: LiveService[], records: TenantRecord[]): OrphanReport {
  const ownedRefs = new Set(records.map((r) => r.substrateRef))
  const liveRefs = new Set(live.map((s) => s.substrateRef))

  return {
    orphans: live.filter((s) => !ownedRefs.has(s.substrateRef)),
    danglingRecords: records.filter((r) => !liveRefs.has(r.substrateRef)).map((r) => r.tenantId),
    liveCount: live.length,
    recordCount: records.length
  }
}

/** One-line summary for an operator. */
export function formatOrphanReport(report: OrphanReport): string {
  if (report.orphans.length === 0 && report.danglingRecords.length === 0) {
    return `OK — ${report.liveCount} live service(s) match ${report.recordCount} tenant record(s)`
  }
  const parts: string[] = []
  if (report.orphans.length > 0) {
    parts.push(
      `${report.orphans.length} ORPHANED service(s) (billing with no tenant): ` +
        report.orphans.map((o) => o.substrateRef).join(', ')
    )
  }
  if (report.danglingRecords.length > 0) {
    parts.push(
      `${report.danglingRecords.length} dangling record(s) (tenant with no hub): ` +
        report.danglingRecords.join(', ')
    )
  }
  return parts.join(' | ')
}
