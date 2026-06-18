import { describe, expect, it } from 'vitest'
import { buildCompanyMetrics, computeBreakEven, type BuildMetricsInput } from './rollup'

const base: BuildMetricsInput = {
  updated: '2026-06-17',
  cohortFloor: 5,
  weekly: [
    {
      week: '2026-05-25',
      customers: 3,
      newCustomers: 3,
      churnedCustomers: 0,
      mrrUsd: 30,
      infraUsd: 5
    },
    {
      week: '2026-06-01',
      customers: 8,
      newCustomers: 5,
      churnedCustomers: 0,
      mrrUsd: 90,
      infraUsd: 12
    },
    {
      week: '2026-06-08',
      customers: 12,
      newCustomers: 4,
      churnedCustomers: 0,
      mrrUsd: 150,
      infraUsd: 18
    }
  ],
  opex: [
    { week: '2026-06-01', payrollUsd: 20, saasUsd: 5, otherUsd: 0 },
    { week: '2026-06-08', payrollUsd: 20, saasUsd: 5, otherUsd: 0 }
  ]
}

describe('buildCompanyMetrics', () => {
  it('suppresses weeks below the cohort floor (k-anonymity)', () => {
    const m = buildCompanyMetrics(base)
    expect(m.weeks.map((w) => w.week)).toEqual(['2026-06-01', '2026-06-08']) // the 3-customer week dropped
    expect(m.weeks.every((w) => w.customers >= base.cohortFloor)).toBe(true)
  })

  it('joins opex onto each published week and rounds money', () => {
    const m = buildCompanyMetrics(base)
    const wk = m.weeks.find((w) => w.week === '2026-06-08')!
    expect(wk.costs).toEqual({ infraUsd: 18, payrollUsd: 20, saasUsd: 5, otherUsd: 0 })
    expect(wk.mrrUsd).toBe(150)
  })

  it('defaults opex to zero for a week with no opex row', () => {
    const m = buildCompanyMetrics({
      ...base,
      weekly: [
        {
          week: '2026-06-15',
          customers: 20,
          newCustomers: 8,
          churnedCustomers: 0,
          mrrUsd: 300,
          infraUsd: 25
        }
      ],
      opex: []
    })
    expect(m.weeks[0]?.costs).toEqual({ infraUsd: 25, payrollUsd: 0, saasUsd: 0, otherUsd: 0 })
  })

  it('never emits a week below the floor even if it has the most revenue', () => {
    const m = buildCompanyMetrics({
      ...base,
      weekly: [
        {
          week: '2026-07-01',
          customers: 1,
          newCustomers: 1,
          churnedCustomers: 0,
          mrrUsd: 9999,
          infraUsd: 1
        }
      ]
    })
    expect(m.weeks).toHaveLength(0) // a single enterprise customer is re-identifiable → suppressed
  })
})

describe('computeBreakEven', () => {
  it('flags the first week cumulative revenue covers cumulative cost', () => {
    // Heavy early costs, growing revenue → crosses to positive eventually.
    const weeks = [
      {
        week: 'w1',
        customers: 5,
        newCustomers: 5,
        churnedCustomers: 0,
        mrrUsd: 4.345,
        costs: { infraUsd: 0, payrollUsd: 100, saasUsd: 0, otherUsd: 0 }
      },
      {
        week: 'w2',
        customers: 50,
        newCustomers: 45,
        churnedCustomers: 0,
        mrrUsd: 4345,
        costs: { infraUsd: 0, payrollUsd: 100, saasUsd: 0, otherUsd: 0 }
      }
    ]
    const be = computeBreakEven(weeks)
    expect(be.reached).toBe(true)
    expect(be.targetWeek).toBe('w2')
  })

  it('reports not-reached when costs always exceed revenue', () => {
    const weeks = [
      {
        week: 'w1',
        customers: 5,
        newCustomers: 5,
        churnedCustomers: 0,
        mrrUsd: 4.345,
        costs: { infraUsd: 0, payrollUsd: 1000, saasUsd: 0, otherUsd: 0 }
      }
    ]
    expect(computeBreakEven(weeks).reached).toBe(false)
  })
})
