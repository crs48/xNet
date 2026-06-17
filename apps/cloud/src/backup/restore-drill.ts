/**
 * xNet Cloud — automated restore-verification drill (exploration 0193).
 *
 * "We replicate to R2" is not "we can restore your hub." This drill *proves* it:
 * provision a THROWAWAY hub that restores a tenant's DB from its R2 replica
 * (Litestream restore-on-boot), assert it comes up ready, then always tear it
 * down. Run nightly over a rotating sample so it costs little and catches a
 * broken backup before a real reactivation does.
 */

import type { TenantRecord } from './../registry'
import type { Provisioner } from '@xnetjs/cloud/provisioner'
import type { PlanEntitlements } from '@xnetjs/entitlements'
import { snapshotKeyFor } from '../control-plane'

/** Probes whether a freshly-restored hub is up + writable (`GET /ready`). */
export interface RestoreProbe {
  ready(hubUrl: string): Promise<boolean>
}

export interface RestoreDrillResult {
  tenantId: string
  ok: boolean
  error?: string
}

/** Verify one tenant restores from R2 into a throwaway hub, then tear it down. */
export async function verifyRestore(
  provisioner: Provisioner,
  probe: RestoreProbe,
  tenant: { tenantId: string; entitlements: PlanEntitlements; targetVersion: string }
): Promise<RestoreDrillResult> {
  let substrateRef: string | null = null
  try {
    const handle = await provisioner.provision({
      tenantId: `drill-${tenant.tenantId}`,
      entitlements: tenant.entitlements,
      targetVersion: tenant.targetVersion,
      env: {},
      restoreFromR2: snapshotKeyFor(tenant.tenantId)
    })
    substrateRef = handle.substrateRef
    const ok = await probe.ready(handle.hubUrl)
    return { tenantId: tenant.tenantId, ok, ...(ok ? {} : { error: 'restored hub not ready' }) }
  } catch (err) {
    return { tenantId: tenant.tenantId, ok: false, error: (err as Error).message }
  } finally {
    if (substrateRef) await provisioner.destroy(substrateRef).catch(() => undefined)
  }
}

/**
 * Deterministically pick `sampleSize` tenants for tonight's drill, rotating by a
 * day index so the whole fleet is covered over time without drilling all of it
 * every night (a silent cap is logged by the caller — see exploration 0193).
 */
export function pickDrillSample(
  tenants: TenantRecord[],
  sampleSize: number,
  dayIndex: number
): TenantRecord[] {
  const eligible = tenants.filter((t) => t.tenantId) // every tenant has an R2 replica path
  if (eligible.length <= sampleSize) return eligible
  const start = (dayIndex * sampleSize) % eligible.length
  const rotated = [...eligible.slice(start), ...eligible.slice(0, start)]
  return rotated.slice(0, sampleSize)
}

/** Run the drill across a sample; returns per-tenant results (failures included). */
export async function runRestoreDrills(
  provisioner: Provisioner,
  probe: RestoreProbe,
  sample: TenantRecord[]
): Promise<RestoreDrillResult[]> {
  const results: RestoreDrillResult[] = []
  for (const t of sample) {
    results.push(
      await verifyRestore(provisioner, probe, {
        tenantId: t.tenantId,
        entitlements: t.entitlements,
        targetVersion: t.targetVersion
      })
    )
  }
  return results
}
