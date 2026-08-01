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

/**
 * Prefix the nightly restore drill provisions its throwaway hubs under
 * (`verifyRestore` → `drill-<tenantId>`).
 */
export const DRILL_PREFIX = 'drill-'

/** Is this service a restore-drill hub rather than a tenant's? */
export function isDrillService(service: LiveService): boolean {
  return (
    service.tenantId?.startsWith(DRILL_PREFIX) === true ||
    service.substrateRef.includes(`/${DRILL_PREFIX}`) ||
    service.substrateRef.startsWith(DRILL_PREFIX)
  )
}

export interface OrphanReport {
  /** Live services with no tenant record pointing at them — the billable leak. */
  orphans: LiveService[]
  /** Records whose hub is gone — the opposite drift (a tenant with no hub). */
  danglingRecords: string[]
  /**
   * Restore-drill hubs seen live (exploration 0418). They never have a tenant
   * record, so a naive audit calls every one an orphan — including the drill
   * currently running, every night. Reported separately: a drill hub alive
   * *during* the nightly window is expected, one alive at any other time is a
   * failed teardown, and only an operator looking at the clock can tell which.
   * Folding them into `orphans` would put a permanent false positive in the
   * audit, which is how a check stops being read.
   */
  drillServices: LiveService[]
  liveCount: number
  recordCount: number
}

/**
 * Compare live services against tenant records.
 *
 * Deliberately reports three buckets. An orphaned service costs money; a
 * dangling record means a tenant whose hub vanished; a drill hub is neither.
 * Collapsing them into one "mismatch" count would hide which is happening.
 */
export function findOrphans(live: LiveService[], records: TenantRecord[]): OrphanReport {
  const ownedRefs = new Set(records.map((r) => r.substrateRef))
  const liveRefs = new Set(live.map((s) => s.substrateRef))
  const unowned = live.filter((s) => !ownedRefs.has(s.substrateRef))

  return {
    orphans: unowned.filter((s) => !isDrillService(s)),
    drillServices: unowned.filter(isDrillService),
    danglingRecords: records.filter((r) => !liveRefs.has(r.substrateRef)).map((r) => r.tenantId),
    liveCount: live.length,
    recordCount: records.length
  }
}

/** One-line summary for an operator. */
export function formatOrphanReport(report: OrphanReport): string {
  const drill =
    report.drillServices.length > 0
      ? ` | ${report.drillServices.length} restore-drill hub(s) live ` +
        `(expected during the nightly window, a failed teardown otherwise): ` +
        report.drillServices.map((d) => d.substrateRef).join(', ')
      : ''
  if (report.orphans.length === 0 && report.danglingRecords.length === 0) {
    return `OK — ${report.liveCount} live service(s) match ${report.recordCount} tenant record(s)${drill}`
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
  return `${parts.join(' | ')}${drill}`
}
