/**
 * @xnetjs/cloud-billing — public API.
 *
 * Usage metering + Stripe billing for the managed fleet (explorations 0175/0176):
 * pure pricing math, an idempotent ledger, and a Stripe meter/webhook adapter with
 * an in-memory fake for keyless testing.
 */

export { computeChargeUsd, computeProviderCostUsd, type TokenPricing } from './pricing'

export { MemoryUsageLedger, type UsageLedger, type UsageEntry } from './ledger'

export {
  FakeStripeBilling,
  StripeBillingAdapter,
  verifyWebhook,
  type StripeBilling,
  type MeterEvent
} from './billing'
