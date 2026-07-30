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
import {
  checkpoint,
  isDecided,
  loadOrStart,
  type RolloutRun,
  type RolloutRunStore,
  type TenantOutcome
} from './run-record'

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

/**
 * Optional durability for a wave (0411 G3). When supplied, each tenant's
 * outcome + captured `priorVersion` is checkpointed **before moving to the
 * next tenant**, and already-decided tenants are skipped on resume. Without it
 * the wave behaves exactly as before — in-process and restart-unsafe — which
 * keeps the pure engine testable and lets callers opt in.
 */
export interface WaveDurability {
  run: RolloutRun
  /** Persist a checkpoint. Called once per tenant, awaited before continuing. */
  save: (run: RolloutRun) => Promise<void>
}

/**
 * Roll one wave: upgrade each tenant, measure, keep-or-rollback.
 *
 * With `durability`, a process that dies mid-wave resumes without re-upgrading
 * the tenants it already decided, and can still roll them back — the captured
 * `priorVersion` lives in the checkpoint, not in a local variable that the
 * restart destroyed.
 */
export async function rollWave(
  deps: RolloutEngineDeps,
  tenants: string[],
  opts: WaveOptions,
  durability?: WaveDurability
): Promise<WaveResult> {
  const promoted: string[] = []
  const rolledBack: string[] = []
  let run = durability?.run

  for (const id of tenants) {
    // Resume: a tenant decided by a previous process is replayed from its
    // checkpoint, never re-upgraded.
    if (run && isDecided(run, id)) {
      const prev = run.checkpoints.find((c) => c.tenantId === id)
      if (prev?.outcome === 'promoted') promoted.push(id)
      else rolledBack.push(id)
      continue
    }

    const prior = await deps.priorVersion(id)
    await deps.upgrade(id, opts.target)
    const availability = await deps.measure(id)
    const outcome: TenantOutcome = availability < opts.minAvailability ? 'rolled-back' : 'promoted'

    if (outcome === 'rolled-back') {
      if (prior && prior !== opts.target) await deps.upgrade(id, prior) // instant rollback
      rolledBack.push(id)
    } else {
      promoted.push(id)
    }

    if (run && durability) {
      run = checkpoint(run, { tenantId: id, priorVersion: prior, outcome })
      durability.run = run
      await durability.save(run)
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
 * Optional durability for a whole rollout (0411 G3). Supply a store plus a
 * stable `runId` (e.g. the target tag) and the rollout checkpoints after every
 * tenant, resuming from where a killed process left off.
 */
export interface RolloutDurability {
  store: RolloutRunStore
  /** Stable id for this rollout — re-running with the same id resumes it. */
  runId: string
}

/**
 * Run a full rollout: gate on the fleet budget, bake the canary, then roll waves.
 * Aborts (leaving already-promoted tenants in place) on a frozen budget or — when
 * `abortOnCanaryRollback` — on any canary rollback.
 *
 * With `durability`, the run survives a control-plane restart: already-decided
 * tenants are not re-upgraded, and the terminal status (`complete` / `aborted`)
 * is recorded so an abort is not silently retried as a fresh rollout.
 */
export async function runRollout(
  deps: RolloutEngineDeps,
  plan: RolloutPlan,
  gate: { budgetPolicy: () => Promise<BudgetPolicy> },
  durability?: RolloutDurability
): Promise<RolloutReport> {
  const opts: WaveOptions = { target: plan.target, minAvailability: plan.minAvailability }

  const run = durability
    ? await loadOrStart(durability.store, durability.runId, plan.target)
    : undefined
  const waveDurability: WaveDurability | undefined =
    run && durability ? { run, save: (r) => durability.store.put(durability.runId, r) } : undefined

  /** Record a terminal status, so a resumed call does not re-run a finished plan. */
  const finish = async (status: RolloutRun['status'], reason?: string): Promise<void> => {
    if (!waveDurability || !durability) return
    await durability.store.put(durability.runId, {
      ...waveDurability.run,
      status,
      ...(reason ? { abortReason: reason } : {})
    })
  }

  if ((await gate.budgetPolicy()) === 'freeze') {
    await finish('aborted', 'error-budget frozen')
    return { aborted: true, reason: 'error-budget frozen', waves: [] }
  }

  const canary = await rollWave(deps, plan.canary, opts, waveDurability)
  if ((plan.abortOnCanaryRollback ?? true) && canary.rolledBack.length > 0) {
    await finish('aborted', 'canary regressed')
    return { aborted: true, reason: 'canary regressed', canary, waves: [] }
  }

  const waves: WaveResult[] = []
  for (const [index, wave] of plan.waves.entries()) {
    if ((await gate.budgetPolicy()) === 'freeze') {
      await finish('aborted', 'error-budget frozen mid-rollout')
      return { aborted: true, reason: 'error-budget frozen mid-rollout', canary, waves }
    }
    if (waveDurability) {
      // Persist the bump immediately: if the process dies on the FIRST tenant of
      // this wave there is no checkpoint to carry the index, and the resumed run
      // would report the previous wave as still in progress.
      waveDurability.run = { ...waveDurability.run, waveIndex: index }
      await waveDurability.save(waveDurability.run)
    }
    waves.push(await rollWave(deps, wave, opts, waveDurability))
  }
  await finish('complete')
  return { aborted: false, canary, waves }
}
