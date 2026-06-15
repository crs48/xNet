import { describe, expect, it } from 'vitest'
import { currencyExponent, parseAmount, formatAmount, toMajorUnits, toMinorUnits } from './currency'

describe('currency exponents', () => {
  it('defaults to 2, knows zero- and three-decimal currencies', () => {
    expect(currencyExponent('USD')).toBe(2)
    expect(currencyExponent('eur')).toBe(2)
    expect(currencyExponent('JPY')).toBe(0)
    expect(currencyExponent('KWD')).toBe(3)
    expect(currencyExponent('ZZZ')).toBe(2)
  })
})

describe('parseAmount → integer minor units (exact)', () => {
  it('parses plain decimals to cents', () => {
    expect(parseAmount('12.34', 'USD')).toBe(1234)
    expect(parseAmount('0.05', 'USD')).toBe(5)
    expect(parseAmount('100', 'USD')).toBe(10000)
    expect(parseAmount('1234.5', 'USD')).toBe(123450)
  })

  it('is exact where floats are not (0.1 + 0.2 class of bug)', () => {
    // 19.99 * 100 in float is 1998.9999...; string parse is exact.
    expect(parseAmount('19.99', 'USD')).toBe(1999)
    expect(parseAmount('0.29', 'USD')).toBe(29)
  })

  it('handles thousands separators and currency symbols', () => {
    expect(parseAmount('$1,234.56', 'USD')).toBe(123456)
    expect(parseAmount('1,000', 'USD')).toBe(100000)
    expect(parseAmount('€2.500,75', 'EUR')).toBe(250075) // comma decimal
  })

  it('handles negatives and accounting parentheses', () => {
    expect(parseAmount('-40', 'USD')).toBe(-4000)
    expect(parseAmount('(12.34)', 'USD')).toBe(-1234)
    expect(parseAmount('-$1,234.56', 'USD')).toBe(-123456)
  })

  it('respects currency exponent (JPY=0, KWD=3)', () => {
    expect(parseAmount('500', 'JPY')).toBe(500)
    expect(parseAmount('500.7', 'JPY')).toBe(501) // rounds at 0 decimals
    expect(parseAmount('1.234', 'KWD')).toBe(1234)
  })

  it('rounds half-up past the exponent', () => {
    expect(parseAmount('1.005', 'USD')).toBe(101)
    expect(parseAmount('1.004', 'USD')).toBe(100)
  })

  it('returns null for junk', () => {
    expect(parseAmount('', 'USD')).toBeNull()
    expect(parseAmount('abc', 'USD')).toBeNull()
  })
})

describe('formatAmount / conversions', () => {
  it('formats minor units as localized currency', () => {
    expect(formatAmount(123456, 'USD')).toBe('$1,234.56')
    expect(formatAmount(-4000, 'USD')).toBe('-$40.00')
    expect(formatAmount(500, 'JPY')).toBe('¥500')
  })

  it('round-trips through minor units losslessly for representable values', () => {
    for (const s of ['0.00', '12.34', '1000.00', '99.99']) {
      const minor = parseAmount(s, 'USD')!
      expect(toMajorUnits(minor, 'USD')).toBeCloseTo(Number(s), 10)
    }
  })

  it('toMinorUnits rounds major to minor', () => {
    expect(toMinorUnits(12.34, 'USD')).toBe(1234)
    expect(toMinorUnits(500, 'JPY')).toBe(500)
  })
})
