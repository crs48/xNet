/**
 * @xnetjs/cloud-plans — public API.
 *
 * The plan/entitlement contract shared by the xNet Cloud control plane and
 * provisioned hubs. See exploration 0174 (open-core control plane) and 0175
 * (deployment + capacity-as-entitlement-flips).
 */

export {
  PLAN_CATALOG,
  PLAN_ORDER,
  resolveEntitlements,
  withStorage,
  withSeats,
  withConcurrency,
  requiresMigration,
  asPlanId,
  type PlanId,
  type IsolationTier,
  type SlaLevel,
  type PlanEntitlements
} from './plans'

export { signEntitlements, verifyEntitlements, entitlementsFromEnv } from './entitlements'
