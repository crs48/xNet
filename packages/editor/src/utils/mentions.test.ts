import { describe, expect, it } from 'vitest'
import { buildPersonMentionSuggestions, extractMentionDids, mentionsFromDoc } from './mentions'

const alice = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const bob = 'did:key:z6MkfDbvZkqwzPLs7BA1eMnaGyfXcb4ZUmaqYwhEbBPp7pTV'

describe('extractMentionDids', () => {
  it('collects DIDs from taskMention pills, deduped', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hey ' },
            { type: 'taskMention', attrs: { id: alice, label: 'Alice' } },
            { type: 'text', text: ' and again ' },
            { type: 'taskMention', attrs: { id: alice, label: 'Alice' } },
            { type: 'personMention', attrs: { id: bob, label: 'Bob' } }
          ]
        }
      ]
    }
    expect(extractMentionDids(doc)).toEqual([alice, bob])
  })

  it('ignores non-DID mention ids and plain @text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'taskMention', attrs: { id: 'task-123', label: 'Task' } },
            { type: 'text', text: '@alice not a pill' }
          ]
        }
      ]
    }
    expect(extractMentionDids(doc)).toEqual([])
  })

  it('handles nested structures and empty docs', () => {
    expect(extractMentionDids(null)).toEqual([])
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'mention', attrs: { id: bob } }]
            }
          ]
        }
      ]
    }
    expect(extractMentionDids(doc)).toEqual([bob])
  })
})

describe('mentionsFromDoc', () => {
  it('returns undefined for unmentioning docs', () => {
    expect(mentionsFromDoc({ type: 'doc', content: [] })).toBeUndefined()
  })

  it('returns the structured field shape', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'taskMention', attrs: { id: alice } }] }]
    }
    expect(mentionsFromDoc(doc)).toEqual({ dids: [alice] })
  })
})

describe('buildPersonMentionSuggestions', () => {
  it('merges profiles with presence, profiles winning on metadata', () => {
    const profiles = [{ did: alice, name: 'Alice P.', avatar: 'a.png' }]
    const presence = [
      { did: alice, name: 'alice-live' },
      { did: bob, name: 'Bob', color: '#fff' }
    ]
    const suggestions = buildPersonMentionSuggestions(profiles, presence, bob)
    expect(suggestions).toHaveLength(2)
    const aliceSuggestion = suggestions.find((s) => s.id === alice)
    expect(aliceSuggestion?.label).toBe('Alice P.')
    expect(aliceSuggestion?.avatarUrl).toBe('a.png')
    const bobSuggestion = suggestions.find((s) => s.id === bob)
    expect(bobSuggestion?.subtitle).toBe('You')
  })

  it('falls back to a truncated DID label', () => {
    const suggestions = buildPersonMentionSuggestions([], [{ did: alice }], null)
    expect(suggestions[0]?.label).toContain('...')
  })

  it('carries the @handle through for picker filtering (0172)', () => {
    const profiles = [{ did: alice, name: 'Alice Lovelace', handle: 'ada' }]
    const suggestions = buildPersonMentionSuggestions(profiles, [], alice)
    expect(suggestions[0]).toMatchObject({ id: alice, label: 'Alice Lovelace', handle: 'ada' })
  })
})
