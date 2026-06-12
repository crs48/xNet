import { describe, expect, it } from 'vitest'
import {
  CREATE_HASHTAG_ID,
  filterHashtagSuggestions,
  hashtagFromMenuItem
} from '../extensions/hashtag'
import { extractTagIds, tagsFromDoc } from './hashtags'

const doc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Shipping ' },
        { type: 'hashtag', attrs: { id: 'tag-design', name: 'design' } },
        { type: 'text', text: ' and #not-a-pill plus ' },
        { type: 'hashtag', attrs: { id: 'tag-perf', name: 'perf' } }
      ]
    },
    {
      type: 'paragraph',
      content: [{ type: 'hashtag', attrs: { id: 'tag-design', name: 'design' } }]
    }
  ]
}

describe('extractTagIds', () => {
  it('collects pill ids, deduped, in walk order', () => {
    expect(extractTagIds(doc)).toEqual(['tag-design', 'tag-perf'])
  })

  it('never parses raw #text in prose', () => {
    const textOnly = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '#design #perf' }] }]
    }
    expect(extractTagIds(textOnly)).toEqual([])
  })

  it('ignores pills without an id', () => {
    const broken = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'hashtag', attrs: { name: 'x' } }] }]
    }
    expect(extractTagIds(broken)).toEqual([])
  })

  it('handles null and empty documents', () => {
    expect(extractTagIds(null)).toEqual([])
    expect(extractTagIds({ type: 'doc' })).toEqual([])
  })
})

describe('tagsFromDoc', () => {
  it('returns undefined for untagged documents', () => {
    expect(tagsFromDoc({ type: 'doc' })).toBeUndefined()
  })

  it('returns the id list when pills exist', () => {
    expect(tagsFromDoc(doc)).toEqual(['tag-design', 'tag-perf'])
  })
})

describe('filterHashtagSuggestions', () => {
  const normalize = (raw: string) => raw.trim().toLowerCase()
  const tags = [
    { id: 't1', name: 'design' },
    { id: 't2', name: 'design-system' },
    { id: 't3', name: 'perf' }
  ]

  it('lists existing tags before offering create', () => {
    const items = filterHashtagSuggestions(tags, 'des', normalize)
    expect(items.map((item) => item.id)).toEqual(['t1', 't2', CREATE_HASHTAG_ID])
    expect(items[0].label).toBe('#design')
  })

  it('omits the create entry on an exact match', () => {
    const items = filterHashtagSuggestions(tags, 'perf', normalize)
    expect(items.map((item) => item.id)).toEqual(['t3'])
  })

  it('offers only create for an unknown usable name', () => {
    const items = filterHashtagSuggestions(tags, 'brand-new', normalize)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: CREATE_HASHTAG_ID, label: '#brand-new' })
  })

  it('shows all tags (capped) for an empty query without a create entry', () => {
    const items = filterHashtagSuggestions(tags, '', normalize)
    expect(items.map((item) => item.id)).toEqual(['t1', 't2', 't3'])
  })
})

describe('hashtagFromMenuItem', () => {
  it('strips the display # back off', () => {
    expect(hashtagFromMenuItem({ id: 't1', label: '#design' })).toEqual({
      id: 't1',
      name: 'design'
    })
  })
})
