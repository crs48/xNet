/**
 * Adapter: drive the pure rollout engine against a real ControlPlane + health
 * store. `upgrade` wraps `upgradeTenant` (immutable tags), `priorVersion` captures
 * the tenant's current tag for rollback, and `measure` reads the post-bake
 * availability SLI from recorded health samples (exploration 0193).
 */

import type { ControlPlane } from '../control-plane'
import type { RolloutEngineDeps } from './engine'
import { tenantSli, type HealthSampleStore } from '../observability/health'

export function controlPlaneRolloutDeps(
  cp: ControlPlane,
  health: HealthSampleStore,
  nowMs: () => number = Date.now
): RolloutEngineDeps {
  return {
    async upgrade(tenantId, target) {
      await cp.upgradeTenant(tenantId, target)
    },
    async priorVersion(tenantId) {
      return (await cp.getTenant(tenantId))?.targetVersion ?? ''
    },
    async measure(tenantId) {
      const t = await cp.getTenant(tenantId)
      if (!t) return 0
      return tenantSli(health, { tenantId: t.tenantId, plan: t.plan, hubUrl: t.hubUrl }, nowMs())
        .availability
    }
  }
}
