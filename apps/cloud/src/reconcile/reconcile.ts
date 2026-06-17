/**
 * xNet Cloud — tenant reconciliation decision (exploration 0193).
 *
 * The control plane is happiest as a reconciliation loop: compare each tenant's
 * desired state to what's observed and emit the single next action that converges
 * them. This module is the *pure decision* — no I/O — so it's exhaustively
 * testable; a thin driver maps the action to ControlPlane calls (provision /
 * upgrade / suspend / demote / restart). Keeping it data-in/data-out is what makes
 * "automate as much as possible, keep it simple" tractable.
 */

export interface ReconcileInput {
  dataTier: 'hot' | 'cold'
  /** Opaque live-machine ref; empty when there is no running hub. */
  substrateRef: string
  hubUrl: string
  lastActiveMs: number
  subscriptionStatus?: 'active' | 'canceled'
  /** Latest health verdict: true/false, or null when there's no signal yet. */
  healthy: boolean | null
  /** Whether the R2 replica is caught up (gate for safe demotion). */
  synced: boolean
  nowMs: number
  /** Idle duration after which a hot tenant should demote to cold. */
  coldAfterMs: number
}

export type ReconcileAction =
  | { kind: 'none' }
  | { kind: 'reprovision'; reason: string }
  | { kind: 'restart'; reason: string }
  | { kind: 'demote'; reason: string }

/**
 * Decide the next convergence action for one tenant. Order matters: a canceled
 * subscription is left suspended; a hot tenant with no live machine is re-provisioned
 * (crash/loss); an unhealthy live hub is restarted; an idle, fully-synced hub is
 * demoted to cold; otherwise nothing to do.
 */
export function reconcileTenant(input: ReconcileInput): ReconcileAction {
  if (input.subscriptionStatus === 'canceled') return { kind: 'none' }

  if (input.dataTier === 'hot') {
    if (!input.substrateRef || !input.hubUrl) {
      return { kind: 'reprovision', reason: 'hot tenant has no live hub' }
    }
    if (input.healthy === false) {
      return { kind: 'restart', reason: 'health probe failing' }
    }
    if (input.nowMs - input.lastActiveMs >= input.coldAfterMs && input.synced) {
      return { kind: 'demote', reason: 'idle and fully synced' }
    }
    return { kind: 'none' }
  }

  // Cold tenants reactivate on a real request (not from the reconciler).
  return { kind: 'none' }
}
