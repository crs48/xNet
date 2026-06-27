/**
 * Charter §Calm regression: default feeds stay chronological. Every default
 * social feed orders by a time (or structural title) field and NEVER by an
 * engagement signal — there is no "ranked for engagement" feed to drift into.
 */

import { describe, expect, it } from 'vitest'
import { createDefaultSocialFeedViews } from './defaults'

/** Fields a calm, chronological feed may order by. */
const CHRONOLOGICAL_FIELDS = new Set([
  'publishedAt',
  'observedAt',
  'importedAt',
  'createdAt',
  'updatedAt',
  'title' // collections sort by name; still not an engagement signal
])

/** Engagement signals a feed must never sort by. */
const ENGAGEMENT_FIELDS = [
  'likeCount',
  'likes',
  'viewCount',
  'views',
  'score',
  'rank',
  'ranking',
  'popularity',
  'engagement',
  'trending',
  'hotness'
]

/**
 * Walk a descriptor and collect the `field` of every `orderBy` entry. The AST
 * stores orderBy as an array of `{ field, direction }`, so chronological intent
 * lives in the field names.
 */
function collectOrderByFields(descriptor: unknown): string[] {
  const fields: string[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'orderBy' && Array.isArray(child)) {
        for (const entry of child) {
          const field = (entry as { field?: unknown })?.field
          if (typeof field === 'string') fields.push(field)
        }
      }
      visit(child)
    }
  }
  visit(descriptor)
  return fields
}

describe('Charter §Calm — feeds are chronological', () => {
  const views = createDefaultSocialFeedViews()

  it('defines feeds (sanity)', () => {
    expect(views.length).toBeGreaterThan(0)
  })

  for (const view of createDefaultSocialFeedViews()) {
    it(`${view.id} orders only by time/structural fields`, () => {
      const fields = collectOrderByFields(view.descriptor)
      expect(fields.length).toBeGreaterThan(0) // deterministic order, not "whatever"
      for (const field of fields) {
        expect(CHRONOLOGICAL_FIELDS.has(field)).toBe(true)
        expect(ENGAGEMENT_FIELDS).not.toContain(field)
      }
    })
  }
})
