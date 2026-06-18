import { describe, expect, it } from 'vitest'
import {
  computeChargeFromCostUsd,
  computeChargeUsd,
  computeProviderCostUsd,
  type TokenPricing
} from './pricing'

const pricing: TokenPricing = {
  inputUsdPerMillion: 3,
  outputUsdPerMillion: 15,
  markup: 1.3
}

describe('computeChargeUsd', () => {
  it('applies provider rates + markup', () => {
    // (1000/1e6*3 + 500/1e6*15) * 1.3 = (0.003 + 0.0075) * 1.3 = 0.01365
    expect(computeChargeUsd(1000, 500, pricing)).toBeCloseTo(0.01365, 8)
  })

  it('never undercharges across many random usages (round-up property)', () => {
    // Charge rounds UP to 8 decimals (1e-8 USD), so it must never fall below the
    // true marked-up cost by more than binary-float epsilon (~1e-18 USD), and must
    // exceed it by less than one rounding unit. The 1e-9 tolerance is billions of
    // times smaller than the smallest billable unit — there is no real undercharge.
    for (let i = 0; i < 2000; i++) {
      const input = (i * 37) % 50_000
      const output = (i * 13) % 20_000
      const charge = computeChargeUsd(input, output, pricing)
      const exact = computeProviderCostUsd(input, output, pricing) * pricing.markup
      expect(charge).toBeGreaterThanOrEqual(exact - 1e-9)
      expect(charge).toBeLessThanOrEqual(exact + 1e-8)
    }
  })

  it('is zero for zero usage', () => {
    expect(computeChargeUsd(0, 0, pricing)).toBe(0)
  })

  it('rejects markup < 1 and negative tokens', () => {
    expect(() => computeChargeUsd(1, 1, { ...pricing, markup: 0.9 })).toThrow(/markup/)
    expect(() => computeChargeUsd(-1, 0, pricing)).toThrow(/token counts/)
  })

  it('charge always exceeds raw provider cost when marked up', () => {
    const provider = computeProviderCostUsd(10_000, 4_000, pricing)
    expect(computeChargeUsd(10_000, 4_000, pricing)).toBeGreaterThan(provider)
  })
})

describe('computeChargeFromCostUsd (exact provider cost → marked-up charge)', () => {
  it('applies the markup to a known provider cost and rounds up', () => {
    expect(computeChargeFromCostUsd(0.01, 1.3)).toBeCloseTo(0.013, 8)
    // sub-cent cost rounds UP to the 1e-8 unit, never below
    expect(computeChargeFromCostUsd(0.000123, 1.3)).toBe(Math.ceil(0.000123 * 1.3 * 1e8) / 1e8)
  })

  it('never undercharges relative to the exact marked-up cost', () => {
    for (let i = 1; i < 1000; i++) {
      const cost = (i * 7.31) / 1e6
      expect(computeChargeFromCostUsd(cost, 1.3)).toBeGreaterThanOrEqual(cost * 1.3 - 1e-12)
    }
  })

  it('is zero for zero cost and rejects bad inputs', () => {
    expect(computeChargeFromCostUsd(0, 1.3)).toBe(0)
    expect(() => computeChargeFromCostUsd(1, 0.9)).toThrow(/markup/)
    expect(() => computeChargeFromCostUsd(-0.01, 1.3)).toThrow(/providerCostUsd/)
  })
})
