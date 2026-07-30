/**
 * xNet Cloud — durable rollout checkpoints (0411 G3).
 *
 * `rollWave` used to accumulate `promoted` / `rolledBack` in local `const`
 * arrays. A control-plane restart mid-rollout therefore left the fleet
 * **split-version with no record of which tenants had been upgraded** and no
 * captured `priorVersion` to roll back to. This was the most workflow-shaped
 * thing in the repository, and the one place a durable-execution engine would
 * have earned its keep — so it is worth being precise about what replaces it.
 *
 * A {@link RolloutRun} is a checkpoint written after **each tenant**, holding
 * everything a fresh process needs to resume:
 *
 *  - which tenants are already decided (so they are never re-upgraded), and
 *  - each decided tenant's `priorVersion` (so rollback survives the restart).
 *
 * The decision logic stays pure and the store stays a `DocStore`, matching the
 * pattern the rest of the control plane already uses (ADR-28).
 */

import type { DocStore } from '../stores/durable'

export type TenantOutcome = 'promoted' | 'rolled-back'

/** Per-tenant checkpoint. `priorVersion` is captured BEFORE the upgrade. */
export interface TenantCheckpoint {
  tenantId: string
  priorVersion: string
  outcome: TenantOutcome
}

export interface RolloutRun {
  runId: string
  /** Target image tag this rollout is moving the fleet to. */
  target: string
  /** Which wave is in progress: -1 = canary, 0..n = `plan.waves[i]`. */
  waveIndex: number
  /** Everything decided so far, in order. */
  checkpoints: TenantCheckpoint[]
  status: 'running' | 'aborted' | 'complete'
  abortReason?: string
}

/** A fresh run record, before any tenant has been touched. */
export function startRun(runId: string, target: string): RolloutRun {
  return { runId, target, waveIndex: -1, checkpoints: [], status: 'running' }
}

/** Tenant ids already decided in this run — the resume filter. */
export function decidedTenants(run: RolloutRun): Set<string> {
  return new Set(run.checkpoints.map((c) => c.tenantId))
}

/** Has this tenant already been decided? Then a resumed run must skip it. */
export function isDecided(run: RolloutRun, tenantId: string): boolean {
  return run.checkpoints.some((c) => c.tenantId === tenantId)
}

/** Append a tenant's outcome. Returns a new record (never mutates). */
export function checkpoint(run: RolloutRun, entry: TenantCheckpoint): RolloutRun {
  return { ...run, checkpoints: [...run.checkpoints, entry] }
}

/**
 * The wave result for a set of tenant ids, read back out of the checkpoints.
 * Lets a resumed run report the same shape as an uninterrupted one.
 */
export function waveResultFor(
  run: RolloutRun,
  tenantIds: readonly string[]
): { promoted: string[]; rolledBack: string[] } {
  const inWave = new Set(tenantIds)
  const relevant = run.checkpoints.filter((c) => inWave.has(c.tenantId))
  return {
    promoted: relevant.filter((c) => c.outcome === 'promoted').map((c) => c.tenantId),
    rolledBack: relevant.filter((c) => c.outcome === 'rolled-back').map((c) => c.tenantId)
  }
}

/**
 * The version a tenant should be returned to if the whole rollout is reverted.
 * Reading it from the checkpoint rather than from live state is the point: after
 * a restart the tenant's *current* version is the new one, so only the stored
 * `priorVersion` can undo it.
 */
export function priorVersionOf(run: RolloutRun, tenantId: string): string | null {
  return run.checkpoints.find((c) => c.tenantId === tenantId)?.priorVersion ?? null
}

/** Persistence port for run records (Firestore in production, in-memory in tests). */
export type RolloutRunStore = DocStore<RolloutRun>

/**
 * Load an in-progress run for `runId`, or start a fresh one. A run whose status
 * is no longer `running` is not resumed — it is replaced, so a re-run of a
 * completed rollout id starts clean rather than silently no-opping.
 */
export async function loadOrStart(
  store: RolloutRunStore,
  runId: string,
  target: string
): Promise<RolloutRun> {
  const existing = await store.get(runId)
  if (existing && existing.status === 'running' && existing.target === target) return existing
  return startRun(runId, target)
}
