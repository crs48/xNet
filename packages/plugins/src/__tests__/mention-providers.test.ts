/**
 * Tests for the extensible mention/typeahead providers (0194 Phase 4).
 */

import { describe, it, expect } from 'vitest'
import {
  resolveMentionProviders,
  type MentionProviderContribution,
  type MentionSuggestion
} from '../mention-providers'

function provider(
  id: string,
  trigger: string,
  suggestions: MentionSuggestion[],
  extra: Partial<MentionProviderContribution> = {}
): MentionProviderContribution {
  return { id, trigger, getSuggestions: () => suggestions, ...extra }
}

const contact: MentionSuggestion = { id: 'c1', label: 'Ada' }
const issue: MentionSuggestion = { id: 'i1', label: '#42 bug' }

describe('resolveMentionProviders', () => {
  it('only runs providers for the requested trigger', async () => {
    const result = await resolveMentionProviders(
      [provider('crm', '@', [contact]), provider('gh', '#', [issue])],
      '@',
      ''
    )
    expect(result).toEqual([contact])
  })

  it('merges providers in priority order (lower first) and dedups by id', async () => {
    const result = await resolveMentionProviders(
      [
        provider('b', '@', [{ id: 'x', label: 'from-b' }], { priority: 200 }),
        provider('a', '@', [{ id: 'x', label: 'from-a' }, contact], { priority: 10 })
      ],
      '@',
      ''
    )
    // 'a' runs first → its 'x' wins the dedup; 'b' adds nothing new.
    expect(result.map((s) => s.label)).toEqual(['from-a', 'Ada'])
  })

  it('a throwing provider contributes nothing but does not break the menu', async () => {
    const boom: MentionProviderContribution = {
      id: 'boom',
      trigger: '@',
      getSuggestions: () => {
        throw new Error('provider crashed')
      }
    }
    const result = await resolveMentionProviders([boom, provider('ok', '@', [contact])], '@', '')
    expect(result).toEqual([contact])
  })

  it('times out a slow provider so it never blocks the menu', async () => {
    const slow: MentionProviderContribution = {
      id: 'slow',
      trigger: '@',
      getSuggestions: () => new Promise(() => {}) // never resolves
    }
    const result = await resolveMentionProviders([slow, provider('ok', '@', [contact])], '@', '', {
      timeoutMs: 5
    })
    expect(result).toEqual([contact])
  })

  it('respects the result limit', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, label: `s${i}` }))
    const result = await resolveMentionProviders([provider('p', '@', many)], '@', '', { limit: 3 })
    expect(result).toHaveLength(3)
  })

  it('awaits async providers', async () => {
    const asyncProvider: MentionProviderContribution = {
      id: 'async',
      trigger: '[[',
      getSuggestions: async () => [contact]
    }
    expect(await resolveMentionProviders([asyncProvider], '[[', '')).toEqual([contact])
  })
})
