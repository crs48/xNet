import { describe, expect, it } from 'vitest'
import { PERSONAL_CHART, chartCreateOrder, type ChartAccountSpec } from './chart-of-accounts'

describe('PERSONAL_CHART', () => {
  it('covers all five account classes', () => {
    const classes = new Set(PERSONAL_CHART.map((a) => a.class))
    expect([...classes].sort()).toEqual(['asset', 'equity', 'expense', 'income', 'liability'])
  })

  it('every sub-account references an existing parent code', () => {
    const codes = new Set(PERSONAL_CHART.map((a) => a.code))
    for (const a of PERSONAL_CHART) {
      if (a.parentCode) expect(codes.has(a.parentCode)).toBe(true)
    }
  })
})

describe('chartCreateOrder', () => {
  it('places parents before children', () => {
    const ordered = chartCreateOrder(PERSONAL_CHART)
    const seen = new Set<string>()
    for (const spec of ordered) {
      if (spec.parentCode) expect(seen.has(spec.parentCode)).toBe(true)
      seen.add(spec.code)
    }
    expect(ordered).toHaveLength(PERSONAL_CHART.length)
  })

  it('throws on a missing parent', () => {
    const bad: ChartAccountSpec[] = [{ code: 'x', name: 'X', class: 'asset', parentCode: 'nope' }]
    expect(() => chartCreateOrder(bad)).toThrow(/missing parent/)
  })

  it('throws on a cycle', () => {
    const cyclic: ChartAccountSpec[] = [
      { code: 'a', name: 'A', class: 'asset', parentCode: 'b' },
      { code: 'b', name: 'B', class: 'asset', parentCode: 'a' }
    ]
    expect(() => chartCreateOrder(cyclic)).toThrow(/Cyclic/)
  })
})
