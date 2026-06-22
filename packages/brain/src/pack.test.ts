import type { RetrievedItem } from './types'
import { describe, expect, it } from 'vitest'
import { estimateTokens, itemTokens, packToBudget } from './pack'

function item(id: string, score: number, estTokens: number, hops = 0): RetrievedItem {
  return {
    nodeId: id,
    title: id,
    snippet: '',
    score,
    hops,
    source: hops > 0 ? 'graph' : 'hybrid',
    path: [{ nodeId: id }],
    pathLabel: id,
    estTokens
  }
}

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('uses ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })
})

describe('itemTokens', () => {
  it('counts title + snippet + framing overhead', () => {
    expect(itemTokens({ title: 'abcd', snippet: 'abcd' })).toBe(1 + 1 + 8)
  })
})

describe('packToBudget', () => {
  it('keeps everything when under budget', () => {
    const result = packToBudget([item('a', 1, 10), item('b', 0.5, 10)], 100)
    expect(result.kept.map((i) => i.nodeId)).toEqual(['a', 'b'])
    expect(result.dropped).toHaveLength(0)
    expect(result.tokens).toBe(20)
    expect(result.truncated).toBe(false)
  })

  it('drops items that exceed the token budget', () => {
    const result = packToBudget([item('a', 1, 60), item('b', 0.5, 60)], 100)
    expect(result.kept.map((i) => i.nodeId)).toEqual(['a'])
    expect(result.dropped.map((d) => d.nodeId)).toEqual(['b'])
    expect(result.truncated).toBe(true)
  })

  it('always keeps at least one item even if it alone exceeds the budget', () => {
    const result = packToBudget([item('big', 1, 5000)], 100)
    expect(result.kept).toHaveLength(1)
    expect(result.dropped).toHaveLength(0)
  })

  it('labels dropped expanded nodes with their hop distance', () => {
    const result = packToBudget([item('a', 1, 90), item('n', 0.5, 90, 2)], 100)
    expect(result.dropped[0].reason).toContain('2-hop')
  })
})
