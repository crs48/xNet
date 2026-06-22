import { describe, expect, it } from 'vitest'
import {
  consolidateMemory,
  memoryRankScore,
  rankMemories,
  textSimilarity,
  tokenize,
  type MemoryRecord
} from './memory'

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops stopwords', () => {
    expect(tokenize('The Acme Corp, is GREAT!')).toEqual(['acme', 'corp', 'great'])
  })
})

describe('textSimilarity', () => {
  it('is 1 for identical content and 0 for disjoint content', () => {
    expect(textSimilarity('acme corp deal', 'acme corp deal')).toBe(1)
    expect(textSimilarity('apples oranges', 'rockets planets')).toBe(0)
  })

  it('is 1 when both reduce to no tokens, 0 when only one does', () => {
    expect(textSimilarity('the a is', 'of to and')).toBe(1)
    expect(textSimilarity('acme', 'the a is')).toBe(0)
  })

  it('is between 0 and 1 for partial overlap', () => {
    const sim = textSimilarity('acme corp deal', 'acme corp pipeline')
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThan(1)
  })
})

const record = (id: string, text: string, salience = 0.5, lastUsedAt = 0): MemoryRecord => ({
  id,
  text,
  salience,
  lastUsedAt
})

describe('consolidateMemory', () => {
  it('ADDs a novel fact', () => {
    const op = consolidateMemory({ text: 'User prefers dark mode' }, [])
    expect(op).toMatchObject({ op: 'ADD', text: 'User prefers dark mode', salience: 0.5 })
  })

  it('NOOPs on an empty candidate', () => {
    expect(consolidateMemory({ text: '   ' }, [])).toMatchObject({ op: 'NOOP' })
  })

  it('NOOPs on a near-exact restatement', () => {
    const existing = [record('m1', 'User prefers dark mode')]
    expect(consolidateMemory({ text: 'User prefers dark mode' }, existing)).toMatchObject({
      op: 'NOOP'
    })
  })

  it('UPDATEs when the candidate is a richer restatement (same terms, more text)', () => {
    // Same content tokens (added words are stopwords) keeps similarity high, but
    // the longer text wins as the canonical phrasing.
    const existing = [record('m1', 'dark mode')]
    const op = consolidateMemory({ text: 'dark mode, the dark mode, is dark mode' }, existing)
    expect(op).toMatchObject({ op: 'UPDATE', id: 'm1' })
  })

  it('UPDATEs the closest memory on the same topic', () => {
    const existing = [record('m1', 'User lives in Berlin Germany', 0.5)]
    const op = consolidateMemory({ text: 'User lives in Berlin now' }, existing)
    expect(op).toMatchObject({ op: 'UPDATE', id: 'm1' })
    if (op.op === 'UPDATE') expect(op.salience).toBeGreaterThan(0.5)
  })

  it('DELETEs a matching memory when asked to forget', () => {
    const existing = [record('m1', 'User prefers dark mode')]
    expect(consolidateMemory({ text: 'prefers dark mode', forget: true }, existing)).toMatchObject({
      op: 'DELETE',
      id: 'm1'
    })
  })

  it('NOOPs a forget with nothing to match', () => {
    expect(consolidateMemory({ text: 'unrelated', forget: true }, [])).toMatchObject({
      op: 'NOOP'
    })
  })
})

describe('memory ranking', () => {
  it('decays salience by recency', () => {
    const now = 1_000_000_000_000
    const fresh = record('a', 'x', 0.8, now)
    const old = record('b', 'x', 0.8, now - 30 * 24 * 60 * 60 * 1000)
    expect(memoryRankScore(fresh, { now })).toBeGreaterThan(memoryRankScore(old, { now }))
    expect(memoryRankScore(old, { now })).toBeCloseTo(0.4, 5) // one half-life
  })

  it('ranks fresh, salient memories first', () => {
    const now = 1_000_000_000_000
    const ranked = rankMemories(
      [record('old', 'x', 0.9, now - 60 * 24 * 60 * 60 * 1000), record('new', 'y', 0.5, now)],
      { now }
    )
    expect(ranked[0].id).toBe('new')
  })
})
