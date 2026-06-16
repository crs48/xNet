/**
 * Currency arithmetic in integer minor units (exploration 0187).
 *
 * Money is stored and computed as **integer minor units** (cents) so totals are
 * exact — IEEE-754 floats drift and must never own a balance. Parsing and
 * formatting are the only places we cross between minor units and human strings;
 * parsing is done with string surgery (not `parseFloat`) to stay exact.
 */

/**
 * ISO-4217 minor-unit exponents that differ from the default of 2.
 * (The vast majority of currencies use 2; only the exceptions are listed.)
 */
const EXPONENTS: Record<string, number> = {
  // zero-decimal
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  HUF: 0,
  TWD: 0,
  UGX: 0,
  XAF: 0,
  XOF: 0,
  RWF: 0,
  // three-decimal
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
  IQD: 3,
  JOD: 3,
  LYD: 3
}

/** Number of minor-unit digits for a currency (default 2). */
export function currencyExponent(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2
}

/** 10 ** exponent — the number of minor units in one major unit. */
export function minorUnitsPerMajor(currency: string): number {
  return 10 ** currencyExponent(currency)
}

/**
 * Parse a human amount string into signed integer minor units, exactly.
 *
 * Accepts forms like "12.34", "1,234.56", "-40", "$12.34", "(12.34)"
 * (accounting negatives), "1.234,56" (comma decimal). Returns null if the
 * string has no parseable number. Fractional digits beyond the currency's
 * exponent are rounded half-up; fewer are zero-padded.
 */
export function parseAmount(input: string, currency: string): number | null {
  if (typeof input !== 'string') return null
  let s = input.trim()
  if (s === '') return null

  // Accounting parentheses denote a negative.
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }

  // Strip currency symbols / letters / spaces, keep digits and separators.
  s = s.replace(/[^\d.,]/g, '')
  if (s === '') return null

  // Disambiguate decimal vs grouping separators, symbol-aware:
  //  - both present  → the LAST symbol is the decimal point, the other groups
  //  - comma only    → grouping when it repeats or has exactly 3 trailing digits
  //                    ("1,000" = one thousand); otherwise a decimal comma
  //  - dot only       → a decimal point (US convention) unless it repeats
  //                    (European "1.000.000" grouping)
  const dotCount = (s.match(/\./g) || []).length
  const commaCount = (s.match(/,/g) || []).length
  let intPart = ''
  let fracPart = ''

  const splitAt = (pos: number) => {
    intPart = s.slice(0, pos).replace(/[.,]/g, '')
    fracPart = s.slice(pos + 1).replace(/[.,]/g, '')
  }
  const asInteger = () => {
    intPart = s.replace(/[.,]/g, '')
    fracPart = ''
  }

  if (dotCount > 0 && commaCount > 0) {
    splitAt(Math.max(s.lastIndexOf('.'), s.lastIndexOf(',')))
  } else if (commaCount > 0) {
    const trailing = s.length - s.lastIndexOf(',') - 1
    if (commaCount > 1 || trailing === 3) asInteger()
    else splitAt(s.lastIndexOf(','))
  } else if (dotCount > 0) {
    if (dotCount > 1) asInteger()
    else splitAt(s.lastIndexOf('.'))
  } else {
    asInteger()
  }

  if (intPart === '' && fracPart === '') return null
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null

  const exp = currencyExponent(currency)
  // Round half-up on the digit just past the exponent, then pad/truncate.
  let frac = fracPart
  if (frac.length > exp) {
    const keep = frac.slice(0, exp)
    const nextDigit = frac.charCodeAt(exp) - 48
    let minor = BigInt(intPart || '0') * BigInt(10 ** exp) + BigInt(keep || '0')
    if (nextDigit >= 5) minor += 1n
    const result = Number(minor)
    return negative ? -result : result
  } else {
    frac = frac.padEnd(exp, '0')
  }
  const minor = Number(BigInt(intPart || '0') * BigInt(10 ** exp) + BigInt(frac || '0'))
  return negative ? -minor : minor
}

/**
 * Format signed integer minor units as a localized currency string.
 * Display-only — the division to major units may be inexact, but the stored
 * value stays an exact integer.
 */
export function formatAmount(
  minorUnits: number,
  currency: string,
  locale = 'en-US',
  options: Intl.NumberFormatOptions = {}
): string {
  const exp = currencyExponent(currency)
  const major = minorUnits / 10 ** exp
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...options
    }).format(major)
  } catch {
    // Unknown currency code → fall back to a plain fixed-decimal rendering.
    return `${major.toFixed(exp)} ${currency}`
  }
}

/** Convert minor units to a major-unit number (display/charting only). */
export function toMajorUnits(minorUnits: number, currency: string): number {
  return minorUnits / 10 ** currencyExponent(currency)
}

/** Convert a major-unit number to integer minor units (rounds half-up). */
export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyExponent(currency))
}
