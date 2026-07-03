/**
 * xNet Cloud — non-payment (dunning) lifecycle decision (exploration 0260).
 *
 * Stripe owns the money mechanics — Smart Retries, the card updater, and the
 * failed-payment emails. This module owns the *service* consequence: what happens
 * to the tenant's hub as an unpaid account moves through grace → read-only →
 * suspended-cold → deletion, and straight back to active the moment payment
 * recovers. It is the pure *decision* — data-in/data-out, no I/O — mirroring
 * {@link reconcileTenant} in `reconcile.ts`, so the whole policy is exhaustively
 * testable; a thin driver maps the action to `ControlPlane` calls (read-only flip,
 * demote-to-cold, destroy).
 *
 * Philosophy (0216 "Google One, not Dropbox" + local-first): degrade gracefully,
 * retain the data cheaply (cold in R2 costs pennies/month), warn on a dated
 * schedule, and delete only the **cloud replica** after the window — never the
 * user's local-first copy, which lives on their device and is exportable and
 * self-hostable. So the timers can be generous.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Default lifecycle windows (exploration 0260). Grace tracks Stripe's ~2-week Smart
 * Retry window (≈42% of recoverable payments recover after day 14); retention is the
 * industry-modal ~30-day recoverable suspension; the final notice is a last dated
 * warning before the cloud replica is destroyed.
 */
export const DUNNING_WINDOWS = {
  graceMs: 14 * DAY_MS,
  retentionMs: 30 * DAY_MS,
  finalNoticeMs: 7 * DAY_MS
} as const

export type DunningWindows = typeof DUNNING_WINDOWS

/** Where an unpaid tenant sits in the non-payment lifecycle. */
export type BillingState =
  | 'active'
  | 'grace' // payment failed; Stripe retrying; hub still serving
  | 'read_only' // grace elapsed unpaid; writes blocked (507), data intact
  | 'suspended' // Stripe gave up; hub cold (R2 only); deletion scheduled
  | 'pending_deletion' // final-notice window before the cloud replica is destroyed
  | 'deleted'

/** Latest known subscription status from the billing provider (Stripe). */
export type SubscriptionStatus = 'active' | 'past_due' | 'unpaid' | 'canceled'

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'past_due',
  'unpaid',
  'canceled'
]

/** Narrow an arbitrary provider status string to a known {@link SubscriptionStatus}. */
export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
}

export interface BillingReconcileInput {
  /** The tenant's current lifecycle state. */
  billingState: BillingState
  /** Latest Stripe subscription status. */
  subscriptionStatus: SubscriptionStatus
  nowMs: number
  /** When a `grace` hub degrades to read-only if still unpaid (set on entering grace). */
  graceUntilMs?: number
  /** When a `suspended` hub enters pending_deletion (set on suspend). */
  deleteAfterMs?: number
  /** When a `pending_deletion` hub's cloud replica is destroyed (set on the final notice). */
  finalNoticeUntilMs?: number
}

export type BillingAction =
  | { kind: 'none' }
  /** Payment recovered before deletion → restore the hub to service (from R2 if cold). */
  | { kind: 'reactivate'; reason: string }
  /** Grace elapsed unpaid → block writes, keep all data. */
  | { kind: 'read_only'; reason: string }
  /** Stripe gave up → tear the machine down (R2 replica retained) + schedule deletion. */
  | { kind: 'suspend_cold'; reason: string; deleteAfterMs: number }
  /** Retention elapsed → final-notice window before destroying the cloud replica. */
  | { kind: 'pending_deletion'; reason: string; finalNoticeUntilMs: number }
  /** Final notice elapsed → destroy the CLOUD replica (the local-first copy survives). */
  | { kind: 'delete'; reason: string }

/**
 * Decide the next lifecycle action for one tenant. Order matters:
 *
 *  1. A `deleted` tenant is terminal — nothing to do.
 *  2. **Recovery beats everything**: a paid (`active`) subscription anywhere before
 *     deletion returns the hub to service, however far down the funnel it had slid.
 *  3. Otherwise the deadline timers advance one step: grace → read_only (when grace
 *     lapses) → suspend_cold (when Stripe marks it `unpaid`/`canceled`) →
 *     pending_deletion (when retention lapses) → delete (when the final notice lapses).
 *
 * Entering `grace` is *event-driven* (the `invoice.payment_failed` webhook sets
 * `billingState='grace'` + `graceUntilMs`), not decided here — exactly as
 * provisioning is triggered outside `reconcileTenant`. This function is the
 * timer-driven convergence half, safe to run on a schedule and idempotent.
 */
export function reconcileBilling(
  input: BillingReconcileInput,
  windows: DunningWindows = DUNNING_WINDOWS
): BillingAction {
  const { billingState, subscriptionStatus, nowMs } = input

  if (billingState === 'deleted') return { kind: 'none' }

  // Recovery wins from any pre-deletion state.
  if (subscriptionStatus === 'active' && billingState !== 'active') {
    return { kind: 'reactivate', reason: 'payment recovered' }
  }

  switch (billingState) {
    case 'active':
      // The failure→grace transition is event-driven (webhook), not converged here.
      return { kind: 'none' }

    case 'grace':
      if (input.graceUntilMs !== undefined && nowMs >= input.graceUntilMs) {
        return { kind: 'read_only', reason: 'grace elapsed, still unpaid' }
      }
      return { kind: 'none' }

    case 'read_only':
      // Stripe has exhausted retries (unpaid) or the sub was canceled → suspend cold.
      if (subscriptionStatus === 'unpaid' || subscriptionStatus === 'canceled') {
        return {
          kind: 'suspend_cold',
          reason: 'subscription unpaid',
          deleteAfterMs: nowMs + windows.retentionMs
        }
      }
      return { kind: 'none' }

    case 'suspended':
      if (input.deleteAfterMs !== undefined && nowMs >= input.deleteAfterMs) {
        return {
          kind: 'pending_deletion',
          reason: 'retention window elapsed',
          finalNoticeUntilMs: nowMs + windows.finalNoticeMs
        }
      }
      return { kind: 'none' }

    case 'pending_deletion':
      if (input.finalNoticeUntilMs !== undefined && nowMs >= input.finalNoticeUntilMs) {
        return { kind: 'delete', reason: 'final notice elapsed' }
      }
      return { kind: 'none' }

    default:
      return { kind: 'none' }
  }
}

/**
 * The persisted dunning state for one tenant (rides on `TenantRecord.billing`).
 * Together with the reconcile timers it is the whole state machine: this captures
 * *where* the tenant is and *when* the next deadline fires; {@link reconcileBilling}
 * reads it to decide the next action.
 */
export interface DunningState {
  state: BillingState
  subscriptionStatus: SubscriptionStatus
  graceUntilMs?: number
  deleteAfterMs?: number
  finalNoticeUntilMs?: number
}

/**
 * A dunning-relevant provider event, already reduced from a verified Stripe webhook
 * (`invoice.payment_failed` → `payment_failed`, `invoice.paid` → `payment_recovered`,
 * `customer.subscription.updated` → `subscription_status`).
 */
export type BillingEvent =
  | { kind: 'payment_failed' }
  | { kind: 'payment_recovered' }
  | { kind: 'subscription_status'; status: SubscriptionStatus }

const ACTIVE: DunningState = { state: 'active', subscriptionStatus: 'active' }

/**
 * The **event-driven** half of the state machine (the sibling of the timer-driven
 * {@link reconcileBilling}). Fold a provider event into the tenant's dunning state:
 *
 *  - `payment_recovered` (or a status flip back to `active`) returns any un-deleted
 *    tenant to `active` and clears the timers — recovery always wins.
 *  - the first `payment_failed` (or a status flip to `past_due`) on an `active`
 *    tenant opens `grace` with a `graceUntilMs` deadline; later failures don't reset
 *    the clock.
 *  - `unpaid`/`canceled` records the provider status so `reconcileBilling` can move a
 *    `read_only` hub to `suspend_cold`; it never advances the lifecycle by itself
 *    (the timers do that), keeping the two halves cleanly separated.
 *
 * Pure and idempotent-where-it-matters; `deleted` is terminal.
 */
export function applyBillingEvent(
  prev: DunningState | undefined,
  event: BillingEvent,
  nowMs: number,
  windows: DunningWindows = DUNNING_WINDOWS
): DunningState {
  const cur: DunningState = prev ?? { ...ACTIVE }
  if (cur.state === 'deleted') return cur

  const openGrace = (): DunningState => ({
    state: 'grace',
    subscriptionStatus: 'past_due',
    graceUntilMs: nowMs + windows.graceMs
  })

  switch (event.kind) {
    case 'payment_recovered':
      return { ...ACTIVE }

    case 'payment_failed':
      if (cur.state === 'active') return openGrace()
      // Already in the funnel — annotate the status, don't reset the deadline.
      return {
        ...cur,
        subscriptionStatus:
          cur.subscriptionStatus === 'active' ? 'past_due' : cur.subscriptionStatus
      }

    case 'subscription_status':
      if (event.status === 'active') return { ...ACTIVE }
      if (event.status === 'past_due' && cur.state === 'active') return openGrace()
      // unpaid / canceled (or past_due while already in the funnel): record the
      // status so the timer half can advance read_only → suspend_cold.
      return { ...cur, subscriptionStatus: event.status }

    default:
      return cur
  }
}
