/**
 * @xnetjs/billing — currency minor-unit scaling.
 *
 * Money in this package is always integer **minor units**, but the number of
 * minor units per major unit is currency-specific: most currencies have 2
 * decimals (USD cents), some have 0 (JPY, KRW — the major unit *is* the minor
 * unit), and a few have 3 (BHD, KWD). Converting a decimal amount to minor units
 * therefore can't hardcode `* 100`. This mirrors Stripe's zero-/three-decimal
 * currency handling so the canonical stored amount is correct on every rail.
 */

/** ISO-4217 currencies with no minor unit (1 major unit = 1 minor unit). */
const ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF'
])

/** Currencies with 3 decimal places. */
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND'])

/** Decimal places for `currency` (defaults to 2 for unknown / standard currencies). */
export function minorUnitExponent(currency: string): number {
  const code = currency.toUpperCase()
  if (ZERO_DECIMAL.has(code)) return 0
  if (THREE_DECIMAL.has(code)) return 3
  return 2
}

/** Convert a major-unit decimal `amount` to integer minor units for `currency`. */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** minorUnitExponent(currency))
}
