import { describe, expect, it } from 'vitest'
import { groupReactions, type ReactionLike } from './reactions'

function emoji(id: string, e: string, reactor: string): ReactionLike {
  return { id, emoji: e, reactor, reactionType: 'emoji' }
}

describe('groupReactions', () => {
  it('groups by emoji with counts and reactor lists', () => {
    const groups = groupReactions(
      [emoji('1', '👍', 'alice'), emoji('2', '👍', 'bob'), emoji('3', '🎉', 'alice')],
      'carol'
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ emoji: '👍', count: 2, mine: false })
    expect(groups[0].reactors).toEqual(['alice', 'bob'])
    expect(groups[1]).toMatchObject({ emoji: '🎉', count: 1 })
  })

  it('flags the viewer reaction and records its id for removal', () => {
    const groups = groupReactions([emoji('r1', '👍', 'me'), emoji('r2', '👍', 'bob')], 'me')
    expect(groups[0].mine).toBe(true)
    expect(groups[0].myReactionId).toBe('r1')
    expect(groups[0].count).toBe(2)
  })

  it('dedupes a reactor who somehow has the same emoji twice', () => {
    const groups = groupReactions([emoji('1', '👍', 'alice'), emoji('2', '👍', 'alice')], 'me')
    expect(groups[0].count).toBe(1)
  })

  it('ignores non-emoji reaction types', () => {
    const groups = groupReactions(
      [{ id: '1', reactor: 'alice', reactionType: 'like' }, emoji('2', '👍', 'bob')],
      'me'
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].emoji).toBe('👍')
  })

  it('preserves first-seen emoji order', () => {
    const groups = groupReactions(
      [emoji('1', '🎉', 'a'), emoji('2', '👍', 'b'), emoji('3', '🎉', 'c')],
      'me'
    )
    expect(groups.map((g) => g.emoji)).toEqual(['🎉', '👍'])
  })
})
