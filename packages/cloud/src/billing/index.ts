/**
 * @xnetjs/cloud/billing — public API.
 *
 * Usage metering + Stripe billing for the managed fleet (explorations 0175/0176):
 * pure pricing math, an idempotent ledger, and a Stripe meter/webhook adapter with
 * an in-memory fake for keyless testing.
 */

export {
  computeChargeUsd,
  computeChargeFromCostUsd,
  computeProviderCostUsd,
  type TokenPricing
} from './pricing'

export { MemoryUsageLedger, inScope, type UsageLedger, type UsageEntry } from './ledger'

export {
  windowStartMs,
  keyResetFor,
  isBudgetWindow,
  DEFAULT_BUDGET_WINDOW,
  type BudgetWindow
} from './window'

export {
  aiBudgetStatus,
  crossedThresholds,
  DEFAULT_BUDGET_THRESHOLDS,
  NEAR_CAP_FRACTION,
  type BudgetState,
  type BudgetStatus
} from './budget'

export {
  FakeStripeBilling,
  StripeBillingAdapter,
  verifyWebhook,
  type StripeBilling,
  type MeterEvent
} from './billing'
