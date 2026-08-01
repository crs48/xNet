/**
 * TikTok feeds and the cross-platform activity timeline (exploration 0419).
 */

import { describe, expect, it } from 'vitest'
import { createDefaultSocialFeedViews } from './defaults'

function viewById(id: string) {
  return createDefaultSocialFeedViews().find((view) => view.id === id)
}

/** Collect every `{ field, value }` equality/inequality leaf in a descriptor. */
function collectPredicates(
  descriptor: unknown
): Array<{ op: string; field: string; value: unknown }> {
  const found: Array<{ op: string; field: string; value: unknown }> = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return

    const record = value as Record<string, unknown>
    if (typeof record.op === 'string' && typeof record.field === 'string') {
      found.push({ op: record.op, field: record.field, value: record.value })
    }
    Object.values(record).forEach(visit)
  }
  visit(descriptor)
  return found
}

describe('TikTok feed views', () => {
  it('seeds a videos feed and a collections feed', () => {
    const videos = viewById('social.feed.tiktok-videos')
    const collections = viewById('social.feed.tiktok-collections')

    expect(videos?.platform).toBe('tiktok')
    expect(collections?.platform).toBe('tiktok')
  })

  it('scopes the videos feed to TikTok video content', () => {
    const predicates = collectPredicates(viewById('social.feed.tiktok-videos')?.descriptor)

    expect(predicates).toContainEqual({ op: 'eq', field: 'platform', value: 'tiktok' })
    expect(predicates).toContainEqual({ op: 'eq', field: 'contentKind', value: 'video' })
  })

  it('opens both TikTok feeds in the thumbnail grid', () => {
    for (const id of ['social.feed.tiktok-videos', 'social.feed.tiktok-collections']) {
      expect(viewById(id)?.descriptor.presentation).toEqual({
        mode: 'feed',
        feedLayout: 'grid',
        feedDensity: 'cozy'
      })
    }
  })
})

describe('activity timeline', () => {
  const timeline = viewById('social.feed.activity-timeline')

  it('opens on the time axis rather than as a grid of blank cards', () => {
    expect(timeline?.descriptor.presentation?.mode).toBe('timeline')
  })

  it('spans every platform', () => {
    const predicates = collectPredicates(timeline?.descriptor)
    expect(predicates.some((predicate) => predicate.field === 'platform')).toBe(false)
    expect(timeline?.platform).toBe('all')
  })

  it('excludes search history and message interactions', () => {
    const predicates = collectPredicates(timeline?.descriptor)

    expect(predicates).toContainEqual({ op: 'neq', field: 'interactionKind', value: 'search' })
    expect(predicates).toContainEqual({ op: 'neq', field: 'interactionKind', value: 'message' })
  })
})
