/**
 * xNet Cloud — error-budget-gated fleet rollout engine (exploration 0193).
 *
 * Builds staged rollouts on top of the one-step `ControlPlane.upgradeTenant`:
 * a **canary cohort** bakes first, then **waves** roll out, each tenant's new
 * image kept only if its post-bake availability holds — otherwise rolled back by
 * re-pointing to its previous **immutable** tag (instant, no data movement). The
 * whole rollout is **gated on the fleet error budget**: a frozen budget aborts
 * remaining waves (the caller exempts security/reliability patches by not gating).
 *
 * Pure + deterministic: `upgrade`/`priorVersion`/`measure` are injected, so it's
 * keyless-testable and also drives a real `ControlPlane` via the adapter below.
 */

import type { BudgetPolicy } from '../observability/slo'

export interface RolloutEngineDeps {
  /** Apply the new image to a tenant (wraps ControlPlane.upgradeTenant). */
  upgrade(tenantId: string, target: string): Promise<void>
  /** The tenant's current pinned tag, captured before upgrade for rollback. */
  priorVersion(tenantId: string): Promise<string>
  /** Post-bake availability SLI (0..1) for a tenant. */
  measure(tenantId: string): Promise<number>
}

export interface WaveResult {
  promoted: string[]
  rolledBack: string[]
}

export interface WaveOptions {
  target: string
  /** Keep the new image only if post-bake availability ≥ this; else roll back. */
  minAvailability: number
}

/** Roll one wave: upgrade each tenant, measure, keep-or-rollback. */
export async function rollWave(
  deps: RolloutEngineDeps,
  tenants: string[],
  opts: WaveOptions
): Promise<WaveResult> {
  const promoted: string[] = []
  const rolledBack: string[] = []
  for (const id of tenants) {
    const prior = await deps.priorVersion(id)
    await deps.upgrade(id, opts.target)
    const availability = await deps.measure(id)
    if (availability < opts.minAvailability) {
      if (prior && prior !== opts.target) await deps.upgrade(id, prior) // instant rollback
      rolledBack.push(id)
    } else {
      promoted.push(id)
    }
  }
  return { promoted, rolledBack }
}

export interface RolloutPlan {
  target: string
  /** Lowest-risk cohort (xNet's own hubs + opt-in beta), rolled first. */
  canary: string[]
  /** Ordered waves of tenant ids (e.g. by plan tier, riskiest last). */
  waves: string[][]
  minAvailability: number
  /** Abort the whole rollout if the canary rolls any tenant back (default true). */
  abortOnCanaryRollback?: boolean
}

export interface RolloutReport {
  aborted: boolean
  reason?: string
  canary?: WaveResult
  waves: WaveResult[]
}

/**
 * Run a full rollout: gate on the fleet budget, bake the canary, then roll waves.
 * Aborts (leaving already-promoted tenants in place) on a frozen budget or — when
 * `abortOnCanaryRollback` — on any canary rollback.
 */
export async function runRollout(
  deps: RolloutEngineDeps,
  plan: RolloutPlan,
  gate: { budgetPolicy: () => Promise<BudgetPolicy> }
): Promise<RolloutReport> {
  const opts: WaveOptions = { target: plan.target, minAvailability: plan.minAvailability }

  if ((await gate.budgetPolicy()) === 'freeze') {
    return { aborted: true, reason: 'error-budget frozen', waves: [] }
  }

  const canary = await rollWave(deps, plan.canary, opts)
  if ((plan.abortOnCanaryRollback ?? true) && canary.rolledBack.length > 0) {
    return { aborted: true, reason: 'canary regressed', canary, waves: [] }
  }

  const waves: WaveResult[] = []
  for (const wave of plan.waves) {
    if ((await gate.budgetPolicy()) === 'freeze') {
      return { aborted: true, reason: 'error-budget frozen mid-rollout', canary, waves }
    }
    waves.push(await rollWave(deps, wave, opts))
  }
  return { aborted: false, canary, waves }
}
