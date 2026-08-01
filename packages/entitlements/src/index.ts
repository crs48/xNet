/**
 * @xnetjs/entitlements — public API.
 *
 * The plan/entitlement contract shared by BOTH planes: the FSL xNet Cloud control
 * plane (`@xnetjs/cloud`) and the permissively-licensed, self-hostable hub
 * (`@xnetjs/hub`), which verifies its signed `HUB_PLAN` token with this package.
 *
 * It lives outside `@xnetjs/cloud` on purpose (exploration 0181): the hub must be
 * able to read and verify entitlements without taking a dependency on the
 * server-only cloud package (and its `stripe`/`@aws-sdk` deps) or on the FSL
 * license. The server-only COGS/pricing model that used to live here moved to
 * `@xnetjs/cloud/cost`. See explorations 0174 (open-core) and 0181 (consolidation).
 */

export {
  PLAN_CATALOG,
  PLAN_ORDER,
  resolveEntitlements,
  withStorage,
  isSeatMetered,
  withSeats,
  withConcurrency,
  withAiBudget,
  withAiModels,
  aiModelAllowed,
  CHEAP_AI_MODELS,
  STANDARD_AI_MODELS,
  requiresMigration,
  asPlanId,
  type PlanId,
  type IsolationTier,
  type SlaLevel,
  type PlanEntitlements
} from './plans'

export { sloForSla, sloForPlan, errorBudgetMs, type SloTarget } from './slo'

export {
  DURABILITY_POSTURE,
  ALL_DURABILITY_SCOPES,
  DURABILITY_SCOPE_LABELS,
  durabilityForPlan,
  publishedExceedsObjective,
  isScopeCovered,
  uncoveredScopes,
  publishedAvailabilityLabel,
  publishedAvailabilityFigures,
  rpoLabel,
  rtoLabel,
  makeWholeLabel,
  MAKE_WHOLE_MONTHS,
  objectiveForPlan,
  type DurabilityScope,
  type DurabilityPosture
} from './durability'

export { signEntitlements, verifyEntitlements, entitlementsFromEnv } from './entitlements'
