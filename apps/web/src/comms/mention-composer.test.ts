import { describe, expect, it } from 'vitest'
import {
  applyMentionPick,
  composerMentions,
  filterMentionables,
  mentionQueryAt,
  pickerOptionsFor
} from './mention-composer'

describe('mentionQueryAt', () => {
  it('detects an @ at the start and mid-text after whitespace', () => {
    expect(mentionQueryAt('@al', 3)).toEqual({ start: 0, query: 'al' })
    expect(mentionQueryAt('hey @bo', 7)).toEqual({ start: 4, query: 'bo' })
    expect(mentionQueryAt('hey @', 5)).toEqual({ start: 4, query: '' })
  })

  it('ignores emails and mid-word @', () => {
    expect(mentionQueryAt('mail me a@b', 11)).toBeNull()
  })

  it('only looks before the caret', () => {
    const text = '@alice hello'
    expect(mentionQueryAt(text, text.length)).toBeNull()
    expect(mentionQueryAt(text, 3)).toEqual({ start: 0, query: 'al' })
  })
})

describe('applyMentionPick', () => {
  it('replaces the query with the label and trailing space', () => {
    const result = applyMentionPick('hey @bo there', 7, 4, 'Bob')
    expect(result.text).toBe('hey @Bob  there')
    expect(result.caret).toBe(9)
  })
})

describe('composerMentions', () => {
  const picked = new Map([
    ['Alice', 'did:key:zAlice'],
    ['Bob', 'did:key:zBob']
  ])

  it('keeps only mentions whose label text survived', () => {
    expect(composerMentions('hi @Alice and @Bob', picked)).toEqual({
      dids: ['did:key:zAlice', 'did:key:zBob']
    })
    expect(composerMentions('hi @Alice only', picked)).toEqual({ dids: ['did:key:zAlice'] })
    expect(composerMentions('nobody here', picked)).toBeUndefined()
  })

  it('dedupes DIDs when two labels map to one user', () => {
    const aliased = new Map([
      ['Alice', 'did:key:zAlice'],
      ['AliceW', 'did:key:zAlice']
    ])
    expect(composerMentions('@Alice @AliceW', aliased)).toEqual({ dids: ['did:key:zAlice'] })
  })
})

describe('pickerOptionsFor', () => {
  const people = [{ label: 'Alice' }, { label: 'Bob' }]

  it('returns matches only while composing a mention', () => {
    expect(pickerOptionsFor('hey @al', 7, people).map((p) => p.label)).toEqual(['Alice'])
    expect(pickerOptionsFor('hey al', 6, people)).toEqual([])
  })
})

describe('filterMentionables', () => {
  const people = [{ label: 'Alice' }, { label: 'Bob' }, { label: 'Carol' }, { label: 'alfred' }]

  it('prefers prefix matches, then substring, capped', () => {
    expect(filterMentionables(people, 'al').map((p) => p.label)).toEqual(['Alice', 'alfred'])
    expect(filterMentionables(people, 'o').map((p) => p.label)).toEqual(['Bob', 'Carol'])
  })

  it('returns the head of the list for empty queries', () => {
    expect(filterMentionables(people, '')).toHaveLength(4)
  })

  it('matches the @handle as well as the display label (0172)', () => {
    const withHandles = [
      { label: 'Alice Lovelace', handle: 'ada' },
      { label: 'Bob Smith', handle: 'bobby' }
    ]
    // 'ada' matches no display label, but matches Alice's handle
    expect(filterMentionables(withHandles, 'ada').map((p) => p.label)).toEqual(['Alice Lovelace'])
    // substring on handle
    expect(filterMentionables(withHandles, 'obb').map((p) => p.label)).toEqual(['Bob Smith'])
  })
})
