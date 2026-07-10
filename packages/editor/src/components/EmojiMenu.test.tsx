import type { EmojiItem } from '@tiptap/extension-emoji'
import { describe, expect, it } from 'vitest'
import { EMOJI_SUGGESTION_LIMIT, filterEmojiSuggestions } from './EmojiMenu'

function item(name: string, shortcodes: string[] = [], tags: string[] = []): EmojiItem {
  return { name, shortcodes, tags, emoji: '🙂' } as EmojiItem
}

const CATALOG: EmojiItem[] = [
  item('smile', ['smile'], ['happy']),
  item('smiley', ['smiley'], ['happy']),
  item('cat', ['cat'], ['animal']),
  item('smile_cat', ['smile_cat'], ['animal', 'smile']),
  item('rocket', ['rocket'], ['ship', 'launch'])
]

describe('filterEmojiSuggestions', () => {
  it('returns the leading catalog slice for an empty query', () => {
    const results = filterEmojiSuggestions(CATALOG, '')
    expect(results.length).toBeLessThanOrEqual(EMOJI_SUGGESTION_LIMIT)
    expect(results[0]?.name).toBe('smile')
  })

  it('ranks prefix matches before contains matches', () => {
    const results = filterEmojiSuggestions(CATALOG, 'smile')
    expect(results.map((r) => r.name)).toEqual(['smile', 'smiley', 'smile_cat'])
  })

  it('matches tags case-insensitively', () => {
    const results = filterEmojiSuggestions(CATALOG, 'LAUNCH')
    expect(results.map((r) => r.name)).toEqual(['rocket'])
  })

  it('caps results at the suggestion limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => item(`smile_${i}`, [`smile_${i}`]))
    expect(filterEmojiSuggestions(many, 'smile').length).toBe(EMOJI_SUGGESTION_LIMIT)
  })
})
