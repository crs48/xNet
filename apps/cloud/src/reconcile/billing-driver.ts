/**
 * xNet Cloud — the driver half of the non-payment lifecycle (exploration 0418).
 *
 * `reconcileBilling` decides; this executes. Until this module existed the timer
 * half of the state machine had no caller at all: a failed payment opened grace,
 * set a deadline, and then nothing ever happened again. The policy was written,
 * tested, and inert.
 *
 * Three rules shape the code below:
 *
 *  1. **Every transition notifies.** A lifecycle the customer cannot see is not a
 *     lifecycle, it is a surprise. Stripe emails about the *money*; only we can
 *     say what happened to their *hub*.
 *  2. **Notification failure stops the clock.** A step whose notice did not send
 *     is not applied, so the tenant stays where it is and the next tick retries.
 *     The alternative — degrade now, tell them later, maybe — is how you delete
 *     someone's data without warning.
 *  3. **Deletion is opt-in per environment.** `delete` destroys the cloud replica.
 *     It stays behind a flag that ships off, because a bug in a timer that runs
 *     unattended every hour is not a bug you want to find afterwards.
 */

import type { BillingAction, BillingReconcileInput, DunningState } from './billing'
import type { ControlPlane } from '../control-plane'
import type { TenantRecord } from '../registry'

/**
 * How a tenant is told what happened to their hub. One method per transition so
 * the copy lives with the channel, and a no-op implementation is a valid choice
 * for a self-hosted control plane that has no mail transport.
 */
export interface BillingNotifier {
  graceOpened(tenant: TenantRecord, graceUntilMs: number): Promise<void>
  readOnly(tenant: TenantRecord): Promise<void>
  suspended(tenant: TenantRecord, deleteAfterMs: number): Promise<void>
  finalNotice(tenant: TenantRecord, deletesAtMs: number): Promise<void>
  deleted(tenant: TenantRecord): Promise<void>
  recovered(tenant: TenantRecord): Promise<void>
}

/** A notifier that does nothing — the default when no mail transport is configured. */
export const silentNotifier: BillingNotifier = {
  graceOpened: async () => undefined,
  readOnly: async () => undefined,
  suspended: async () => undefined,
  finalNotice: async () => undefined,
  deleted: async () => undefined,
  recovered: async () => undefined
}

export interface BillingDriverOptions {
  /**
   * Whether the terminal `delete` action may actually destroy the cloud replica.
   * Defaults to **false**: the replica is the customer's data, and an unattended
   * hourly timer is the last place to trust a first release. When false the
   * action is reported as `skipped_delete_disabled` and the tenant stays in
   * `pending_deletion`, which is safe to sit in indefinitely.
   */
  deleteEnabled?: boolean
}

/** What the driver did for one tenant — returned so the job can log/count it. */
export type BillingOutcome =
  | { kind: 'none' }
  | { kind: 'applied'; action: BillingAction['kind'] }
  | { kind: 'skipped_delete_disabled' }
  | { kind: 'failed'; action: BillingAction['kind']; error: string }

/** The dunning state a tenant with no recorded billing history is treated as. */
export const HEALTHY: DunningState = { state: 'active', subscriptionStatus: 'active' }

/** Read a tenant's dunning state, defaulting a never-lapsed tenant to healthy. */
export function dunningStateOf(tenant: TenantRecord): DunningState {
  return tenant.billing ?? HEALTHY
}

const assertNever = (value: never): never => {
  throw new Error(`Unhandled billing action: ${JSON.stringify(value)}`)
}

/**
 * Build the `reconcileBilling` input for one tenant.
 *
 * This exists because `DunningState` names the field `state` while
 * `BillingReconcileInput` names it `billingState`, so the obvious
 * `{ ...tenant.billing, nowMs }` spread compiles, leaves `billingState`
 * undefined, and makes a *healthy* tenant look eligible for `reactivate` on
 * every single tick. It cost one test to find; routing every caller through this
 * function means nobody has to find it twice.
 */
export function reconcileInputFor(tenant: TenantRecord, nowMs: number): BillingReconcileInput {
  const s = dunningStateOf(tenant)
  return {
    billingState: s.state,
    subscriptionStatus: s.subscriptionStatus,
    nowMs,
    ...(s.graceUntilMs !== undefined ? { graceUntilMs: s.graceUntilMs } : {}),
    ...(s.deleteAfterMs !== undefined ? { deleteAfterMs: s.deleteAfterMs } : {}),
    ...(s.finalNoticeUntilMs !== undefined ? { finalNoticeUntilMs: s.finalNoticeUntilMs } : {})
  }
}

/**
 * Execute one decided action against the control plane.
 *
 * Ordering within each case is deliberate. For every *degrading* step the
 * service change is applied and then recorded; for `pending_deletion` the notice
 * is sent **first**, because a final notice nobody received is worse than a
 * clock that did not start. `delete` stages an export before destroying anything
 * — the Charter §6 vanish test: a customer must be able to leave with their data
 * even when they left by not paying.
 */
export async function applyBillingAction(
  cp: ControlPlane,
  notify: BillingNotifier,
  tenant: TenantRecord,
  action: BillingAction,
  nowMs: number,
  options: BillingDriverOptions = {}
): Promise<BillingOutcome> {
  if (action.kind === 'none') return { kind: 'none' }

  const prev = dunningStateOf(tenant)
  const id = tenant.tenantId

  try {
    switch (action.kind) {
      case 'reactivate':
        await cp.reactivateTenant(id)
        await cp.setBillingState(id, { ...HEALTHY })
        await notify.recovered(tenant)
        return { kind: 'applied', action: 'reactivate' }

      case 'read_only':
        await cp.setWritesEnabled(id, false)
        await cp.setBillingState(id, { ...prev, state: 'read_only' })
        await notify.readOnly(tenant)
        return { kind: 'applied', action: 'read_only' }

      case 'suspend_cold':
        await cp.suspendTenant(id)
        await cp.setBillingState(id, {
          ...prev,
          state: 'suspended',
          deleteAfterMs: action.deleteAfterMs
        })
        await notify.suspended(tenant, action.deleteAfterMs)
        return { kind: 'applied', action: 'suspend_cold' }

      case 'pending_deletion':
        // Notify BEFORE recording. The final notice is the entire purpose of
        // this state; if it cannot be sent, the deletion clock must not start.
        await notify.finalNotice(tenant, action.finalNoticeUntilMs)
        await cp.setBillingState(id, {
          ...prev,
          state: 'pending_deletion',
          finalNoticeUntilMs: action.finalNoticeUntilMs
        })
        return { kind: 'applied', action: 'pending_deletion' }

      case 'delete': {
        if (!options.deleteEnabled) return { kind: 'skipped_delete_disabled' }
        // Charter §6 vanish test: stage the export before the replica goes.
        await cp.stageExportBundle(id)
        await cp.deleteTenant(id)
        await notify.deleted(tenant)
        return { kind: 'applied', action: 'delete' }
      }
    }
    // Exhaustiveness: adding a `BillingAction` variant without handling it above
    // fails the build here rather than silently doing nothing at runtime.
    return assertNever(action)
  } catch (err) {
    // Leave the tenant where it is. `reconcileBilling` is level-triggered, so the
    // same action is re-decided next tick and retried — no state to unwind.
    return { kind: 'failed', action: action.kind, error: (err as Error).message }
  }
}

/** Roll a tick's outcomes into something worth one log line. */
export interface BillingSweepSummary {
  scanned: number
  applied: number
  failed: number
  skipped: number
  /** Tenant ids whose action threw — the actionable list. */
  failures: string[]
}

export function summarizeSweep(
  results: { tenantId: string; outcome: BillingOutcome }[]
): BillingSweepSummary {
  const failures = results.filter((r) => r.outcome.kind === 'failed').map((r) => r.tenantId)
  return {
    scanned: results.length,
    applied: results.filter((r) => r.outcome.kind === 'applied').length,
    failed: failures.length,
    skipped: results.filter((r) => r.outcome.kind === 'skipped_delete_disabled').length,
    failures
  }
}
