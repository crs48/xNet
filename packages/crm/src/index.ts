/**
 * @xnetjs/crm — pure, dependency-free logic for the native CRM (exploration
 * 0187). No UI and no data-layer coupling: every function takes plain objects
 * so it unit-tests trivially and runs anywhere (web, CLI, server, agent).
 *
 * The typed domain model (Contact, Organization, Pipeline, Stage, Deal,
 * Activity, Product, …) lives in `@xnetjs/data`; this package is the math and
 * the portability/dedup/erasure helpers that operate on it.
 */

export { DAY_MS, canonicalDay, addDays, daysBetween } from './day'

export {
  type CadenceContact,
  computeNextTouch,
  effectiveNextTouch,
  daysUntilTouch,
  isOverdue,
  dueForFollowUp
} from './cadence'

export {
  type StageLike,
  type DealLike,
  type ResolvedDeal,
  type StageBreakdown,
  resolveDeal,
  resolveDeals,
  openPipelineValue,
  weightedPipeline,
  wonValue,
  openCount,
  winRate,
  averageDealSize,
  averageSalesCycleDays,
  pipelineVelocity,
  dealsByStage,
  funnelConversion,
  dealAgeDays
} from './pipeline'

export {
  type ForecastCategory,
  type ForecastDealLike,
  type ForecastRollup,
  forecastRollup
} from './forecast'

export {
  type DedupContact,
  type MatchResult,
  type DuplicateCandidate,
  normalizeEmail,
  emailDomain,
  normalizePhone,
  jaro,
  jaroWinkler,
  nameSimilarity,
  blockingKey,
  matchScore,
  findDuplicateCandidates
} from './dedup'

export { type VCardContact, toVCard, toVCards, parseVCard } from './vcard'

export { type LineItemLike, type PriceLookup, lineItemTotal, dealLineItemTotal } from './catalog'

export { type ContactErasurePatch, anonymizeContactPatch, isErased } from './erasure'
