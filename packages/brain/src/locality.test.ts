import { describe, expect, it } from 'vitest'
import {
  planLocality,
  resolveQuerySource,
  scoreWorkingSet,
  type WorkingSetSignal
} from './locality'

const NOW = 1_000_000_000_000
const DAY = 24 * 60 * 60 * 1000

describe('scoreWorkingSet', () => {
  it('scores a recently-accessed, frequently-used node above a stale one', () => {
    const signals: WorkingSetSignal[] = [
      { nodeId: 'hot', lastAccessMs: NOW, accessCount: 20 },
      { nodeId: 'cold', lastAccessMs: NOW - 60 * DAY, accessCount: 1 }
    ]
    const scores = scoreWorkingSet(signals, { now: NOW })
    expect(scores.get('hot')!).toBeGreaterThan(scores.get('cold')!)
  })

  it('gives never-accessed nodes zero recency', () => {
    const scores = scoreWorkingSet([{ nodeId: 'n' }], { now: NOW })
    expect(scores.get('n')).toBe(0)
  })

  it('boosts pinned nodes', () => {
    const scores = scoreWorkingSet(
      [
        { nodeId: 'pinned', pinned: true },
        { nodeId: 'plain', accessCount: 1 }
      ],
      { now: NOW }
    )
    expect(scores.get('pinned')!).toBeGreaterThan(scores.get('plain')!)
  })

  it('clamps centrality into [0, 1]', () => {
    const scores = scoreWorkingSet([{ nodeId: 'n', centrality: 5 }], {
      now: NOW,
      weights: { recency: 0, frequency: 0, pinned: 0, centrality: 1 }
    })
    expect(scores.get('n')).toBe(1)
  })

  it('decays recency by one half-life', () => {
    const scores = scoreWorkingSet([{ nodeId: 'n', lastAccessMs: NOW - 7 * DAY }], {
      now: NOW,
      weights: { recency: 1, frequency: 0, pinned: 0, centrality: 0 }
    })
    expect(scores.get('n')!).toBeCloseTo(0.5, 5)
  })
})

describe('planLocality', () => {
  it('keeps the highest-scored nodes local within budget', () => {
    const scores = new Map([
      ['a', 0.9],
      ['b', 0.6],
      ['c', 0.3]
    ])
    const plan = planLocality(scores, { maxLocal: 2 })
    expect([...plan.local].sort()).toEqual(['a', 'b'])
    expect([...plan.remote]).toEqual(['c'])
  })

  it('sends below-threshold nodes remote regardless of budget', () => {
    const scores = new Map([
      ['a', 0.9],
      ['b', 0.05]
    ])
    const plan = planLocality(scores, { maxLocal: 10, minScore: 0.1 })
    expect([...plan.local]).toEqual(['a'])
    expect([...plan.remote]).toEqual(['b'])
  })
})

describe('resolveQuerySource', () => {
  it('always reads local when offline', () => {
    expect(resolveQuerySource({ preference: 'auto', localRowCount: 0, online: false })).toBe(
      'local'
    )
    expect(resolveQuerySource({ preference: 'hub', localRowCount: 0, online: false })).toBe('local')
  })

  it('honors explicit preferences', () => {
    expect(resolveQuerySource({ preference: 'local', localRowCount: 0, online: true })).toBe(
      'local'
    )
    expect(resolveQuerySource({ preference: 'hub', localRowCount: 5, online: true })).toBe('hub')
    expect(resolveQuerySource({ preference: 'federated', localRowCount: 5, online: true })).toBe(
      'federated'
    )
  })

  it('auto: hybrid when some local rows exist, hub when none', () => {
    expect(resolveQuerySource({ preference: 'auto', localRowCount: 3, online: true })).toBe(
      'hybrid'
    )
    expect(resolveQuerySource({ preference: 'auto', localRowCount: 0, online: true })).toBe('hub')
  })

  it('auto: reads local-only once the cache is rich (row floor)', () => {
    expect(
      resolveQuerySource({
        preference: 'auto',
        localRowCount: 100,
        localRowFloor: 50,
        online: true
      })
    ).toBe('local')
  })
})
