import { describe, expect, it } from 'vitest'
import {
  applyHashtagPick,
  composerTags,
  hashtagQueryAt,
  shouldSendOnEnter,
  tagOptionsFor
} from './hashtag-composer'

describe('hashtagQueryAt', () => {
  it('finds the active query after a #', () => {
    expect(hashtagQueryAt('see #des', 8)).toEqual({ start: 4, query: 'des' })
  })

  it('matches at the start of the text', () => {
    expect(hashtagQueryAt('#x', 2)).toEqual({ start: 0, query: 'x' })
  })

  it('returns null mid-word and with no trigger', () => {
    expect(hashtagQueryAt('http://a#b', 10)).toBeNull()
    expect(hashtagQueryAt('plain text', 10)).toBeNull()
  })

  it('returns null once a space ends the tag', () => {
    expect(hashtagQueryAt('#done now', 9)).toBeNull()
  })
})

describe('applyHashtagPick', () => {
  it('replaces the query with the picked name and moves the caret', () => {
    const result = applyHashtagPick('see #des soon', 8, 4, 'design')
    expect(result.text).toBe('see #design  soon')
    expect(result.caret).toBe(12)
  })
})

describe('composerTags', () => {
  const picked = new Map([
    ['design', 'tag-1'],
    ['perf', 'tag-2'],
    ['ghost', '']
  ])

  it('keeps only picked names that survive in the text', () => {
    expect(composerTags('shipping #design today', picked)).toEqual(['tag-1'])
  })

  it('dedupes ids and drops unresolved picks', () => {
    expect(composerTags('#design #perf #ghost #design', picked)).toEqual(['tag-1', 'tag-2'])
  })

  it('returns undefined when nothing survives', () => {
    expect(composerTags('no tags here', picked)).toBeUndefined()
  })
})

describe('shouldSendOnEnter', () => {
  it('sends on plain Enter with no pickers open', () => {
    expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false }, 0)).toBe(true)
  })

  it('does not send on Shift+Enter, other keys, or open pickers', () => {
    expect(shouldSendOnEnter({ key: 'Enter', shiftKey: true }, 0)).toBe(false)
    expect(shouldSendOnEnter({ key: 'a', shiftKey: false }, 0)).toBe(false)
    expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false }, 2)).toBe(false)
  })
})

describe('tagOptionsFor', () => {
  const tags = [
    { id: 't1', name: 'design' },
    { id: 't2', name: 'design-system' },
    { id: 't3', name: 'redesign' }
  ]

  it('returns nothing without an active query', () => {
    expect(tagOptionsFor('hello', 5, tags)).toEqual([])
  })

  it('ranks prefix matches before substring matches, then offers create', () => {
    const options = tagOptionsFor('#des', 4, tags)
    expect(options.map((option) => option.id)).toEqual(['t1', 't2', 't3', ''])
    expect(options.at(-1)).toEqual({ id: '', name: 'des', isNew: true })
  })

  it('appends a create entry for unknown usable names', () => {
    const options = tagOptionsFor('#brand', 6, tags)
    expect(options.at(-1)).toEqual({ id: '', name: 'brand', isNew: true })
  })

  it('omits the create entry on an exact match', () => {
    const options = tagOptionsFor('#design', 7, tags)
    expect(options.some((option) => option.isNew)).toBe(false)
    expect(options[0].id).toBe('t1')
  })

  it('lists all tags (capped) for a bare #', () => {
    const options = tagOptionsFor('#', 1, tags)
    expect(options).toHaveLength(3)
    expect(options.some((option) => option.isNew)).toBe(false)
  })
})
