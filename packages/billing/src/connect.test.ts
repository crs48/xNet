import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MARKETPLACE_FEE_BPS,
  applicationFeeMinor,
  feeBpsToPercent,
  sellerNetMinor
} from './connect'

describe('applicationFeeMinor', () => {
  it('defaults to 10% of the charge', () => {
    expect(DEFAULT_MARKETPLACE_FEE_BPS).toBe(1000)
    expect(applicationFeeMinor(1000, DEFAULT_MARKETPLACE_FEE_BPS)).toBe(100) // $10.00 → $1.00
  })

  it('rounds to the nearest minor unit', () => {
    expect(applicationFeeMinor(999, 1000)).toBe(100) // 99.9 → 100
    expect(applicationFeeMinor(994, 1000)).toBe(99) // 99.4 → 99
  })

  it('handles zero fee and zero amount', () => {
    expect(applicationFeeMinor(5000, 0)).toBe(0)
    expect(applicationFeeMinor(0, 1500)).toBe(0)
  })

  it('rejects invalid inputs', () => {
    expect(() => applicationFeeMinor(9.99, 1000)).toThrow(/non-negative integer/)
    expect(() => applicationFeeMinor(-1, 1000)).toThrow(/non-negative integer/)
    expect(() => applicationFeeMinor(1000, 10001)).toThrow(/0\.\.10000/)
    expect(() => applicationFeeMinor(1000, -5)).toThrow(/0\.\.10000/)
  })
})

describe('feeBpsToPercent / sellerNetMinor', () => {
  it('converts bps to percent', () => {
    expect(feeBpsToPercent(1000)).toBe(10)
    expect(feeBpsToPercent(1500)).toBe(15)
    expect(feeBpsToPercent(250)).toBe(2.5)
  })

  it('computes the seller net after the fee', () => {
    expect(sellerNetMinor(1000, 1000)).toBe(900) // $10 − $1 = $9
    expect(sellerNetMinor(2000, 1500)).toBe(1700) // $20 − $3 = $17
  })
})
