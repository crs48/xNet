import { describe, expect, it } from 'vitest'
import { forecastRollup } from './forecast'

describe('forecastRollup', () => {
  it('rolls deals into cumulative lanes', () => {
    const r = forecastRollup([
      { amount: 1000, forecastCategory: 'pipeline' },
      { amount: 2000, forecastCategory: 'best-case' },
      { amount: 3000, forecastCategory: 'commit' },
      { amount: 4000, isClosed: true, isWon: true },
      { amount: 9999, isClosed: true, isWon: false } // closed-lost → contributes nothing
    ])
    expect(r.pipeline).toBe(6000) // all open: 1000 + 2000 + 3000
    expect(r.commit).toBe(7000) // commit 3000 + closed-won 4000
    expect(r.bestCase).toBe(9000) // best-case 2000 + commit 3000 + closed-won 4000
    expect(r.closed).toBe(4000) // closed-won only
  })

  it('treats a missing category as pipeline', () => {
    const r = forecastRollup([{ amount: 500 }])
    expect(r.pipeline).toBe(500)
    expect(r.commit).toBe(0)
  })
})
