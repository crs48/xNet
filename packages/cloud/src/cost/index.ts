/**
 * @xnetjs/cloud/cost — the COGS / gross-margin model.
 *
 * Server-only business math (exploration 0178), kept out of the hub-facing
 * `@xnetjs/entitlements` contract because the hub never needs to price itself.
 */

export {
  UNIT_COSTS,
  estimateCogs,
  DEFAULT_BILLING_PERIOD,
  PLAN_PRICING,
  type PlanCostInputs,
  type PlanCostBreakdown,
  type PricingScenario
} from './pricing'

export {
  measuredCogs,
  reconcileTenantMargin,
  aggregateMargin,
  type TenantUsageMeasurement,
  type TenantCostBreakdown,
  type TenantMargin,
  type FleetMargin
} from './reconcile'
