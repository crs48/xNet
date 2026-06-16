import { describe, expect, it } from 'vitest'
import { DAY_MS } from './day'
import {
  averageDealSize,
  averageSalesCycleDays,
  dealAgeDays,
  dealsByStage,
  funnelConversion,
  openCount,
  openPipelineValue,
  pipelineVelocity,
  resolveDeal,
  resolveDeals,
  weightedPipeline,
  winRate,
  wonValue,
  type StageLike
} from './pipeline'

const stages = new Map<string, StageLike>([
  ['prospect', { id: 'prospect', probability: 0.2 }],
  ['negotiation', { id: 'negotiation', probability: 0.6 }],
  ['won', { id: 'won', probability: 1, isClosed: true, isWon: true }],
  ['lost', { id: 'lost', probability: 0, isClosed: true, isWon: false }]
])

describe('resolveDeal', () => {
  it('forces closed-won to probability 1 and closed-lost to 0', () => {
    expect(resolveDeal({ amount: 100, stage: 'won' }, stages.get('won')).probability).toBe(1)
    expect(resolveDeal({ amount: 100, stage: 'lost' }, stages.get('lost')).probability).toBe(0)
  })

  it('uses the deal override, then the stage default, then 0 for open deals', () => {
    expect(resolveDeal({ amount: 100, probability: 0.9 }, stages.get('prospect')).probability).toBe(
      0.9
    )
    expect(resolveDeal({ amount: 100 }, stages.get('prospect')).probability).toBe(0.2)
    expect(resolveDeal({ amount: 100 }, null).probability).toBe(0)
  })
})

describe('pipeline metrics', () => {
  const deals = resolveDeals(
    [
      { amount: 1000, stage: 'prospect' }, // open, p=0.2 → weighted 200
      { amount: 2000, stage: 'negotiation' }, // open, p=0.6 → weighted 1200
      { amount: 5000, stage: 'won', createdAt: 0, wonAt: 30 * DAY_MS },
      { amount: 3000, stage: 'won', createdAt: 0, wonAt: 10 * DAY_MS },
      { amount: 4000, stage: 'lost' }
    ],
    stages
  )

  it('sums open and weighted pipeline', () => {
    expect(openPipelineValue(deals)).toBe(3000)
    expect(weightedPipeline(deals)).toBeCloseTo(1400)
    expect(openCount(deals)).toBe(2)
  })

  it('computes won value, win rate, and average deal size', () => {
    expect(wonValue(deals)).toBe(8000)
    expect(winRate(deals)).toBeCloseTo(2 / 3) // 2 won of 3 closed
    expect(averageDealSize(deals)).toBe(4000)
  })

  it('averages the sales cycle over won deals only', () => {
    expect(averageSalesCycleDays(deals)).toBe(20) // (30 + 10) / 2
  })

  it('computes velocity from its parts', () => {
    // (#open 2 × winRate 2/3 × avgSize 4000) / avgCycle 20
    expect(pipelineVelocity(deals)).toBeCloseTo((2 * (2 / 3) * 4000) / 20)
  })

  it('returns null (not 0) when a rate has no data', () => {
    const openOnly = resolveDeals([{ amount: 100, stage: 'prospect' }], stages)
    expect(winRate(openOnly)).toBeNull()
    expect(averageDealSize(openOnly)).toBeNull()
    expect(averageSalesCycleDays(openOnly)).toBeNull()
    expect(pipelineVelocity(openOnly)).toBeNull()
  })
})

describe('dealsByStage', () => {
  it('groups count, value, and weighted value by stage (closed deals weight 0)', () => {
    const breakdown = dealsByStage(
      [
        { amount: 1000, stage: 'prospect' },
        { amount: 2000, stage: 'prospect' },
        { amount: 5000, stage: 'won' }
      ],
      stages
    )
    const prospect = breakdown.find((b) => b.stageId === 'prospect')
    expect(prospect).toMatchObject({ count: 2, value: 3000 })
    expect(prospect?.weightedValue).toBeCloseTo(600) // 3000 × 0.2
    expect(breakdown.find((b) => b.stageId === 'won')?.weightedValue).toBe(0)
  })
})

describe('funnelConversion', () => {
  it('computes consecutive ratios and guards divide-by-zero', () => {
    expect(funnelConversion([100, 50, 25])).toEqual([0.5, 0.5])
    expect(funnelConversion([0, 5])).toEqual([null])
  })
})

describe('dealAgeDays', () => {
  it('measures created → now and is null without a created time', () => {
    const now = 10 * DAY_MS
    expect(dealAgeDays({ createdAt: 3 * DAY_MS }, now)).toBe(7)
    expect(dealAgeDays({}, now)).toBeNull()
  })
})
