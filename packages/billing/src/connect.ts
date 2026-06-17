/**
 * @xnetjs/billing — marketplace fee math (exploration 0196).
 *
 * The platform marketplace fee is expressed in basis points (bps): 1000 bps =
 * 10%. `applicationFeeMinor` turns a price + fee rate into the integer minor-unit
 * `application_fee_amount` a one-time Connect charge carries. Subscriptions use
 * `application_fee_percent` directly (see `feeBpsToPercent`).
 */

/** Default marketplace fee: 10% (1000 bps). Below Apple/Steam (30%); the user's stated band. */
export const DEFAULT_MARKETPLACE_FEE_BPS = 1000

/** Compute the platform fee in minor units for a one-time charge. Rounds to the nearest unit. */
export function applicationFeeMinor(amountMinor: number, feeBps: number): number {
  assertMinor(amountMinor)
  assertBps(feeBps)
  return Math.round((amountMinor * feeBps) / 10000)
}

/** Convert basis points to the percent value Stripe's `application_fee_percent` wants. */
export function feeBpsToPercent(feeBps: number): number {
  assertBps(feeBps)
  return feeBps / 100
}

/** The seller's net (minor units) after the platform fee, for previews/receipts. */
export function sellerNetMinor(amountMinor: number, feeBps: number): number {
  return amountMinor - applicationFeeMinor(amountMinor, feeBps)
}

function assertMinor(amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error('amountMinor must be a non-negative integer (minor units)')
  }
}

function assertBps(feeBps: number): void {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new Error('feeBps must be an integer in 0..10000')
  }
}
