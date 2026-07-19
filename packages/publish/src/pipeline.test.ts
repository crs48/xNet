import { describe, expect, it } from 'vitest'
import {
  frontierEquals,
  hasUnpublishedChanges,
  publishPost,
  takenSlugsFor,
  unpublishPost,
  type PostRecord
} from './pipeline'

const NOW = 1_784_000_000_000

function post(overrides: Partial<PostRecord> = {}): PostRecord {
  return { id: 'p1', title: 'The Owned Audience', ...overrides }
}

describe('publishPost', () => {
  it('assigns a slug from the title on first publish', () => {
    const { patch, isFirstPublish } = publishPost({
      post: post(),
      takenSlugs: [],
      frontier: { p1: { hash: 'h1' } },
      now: NOW
    })
    expect(patch.slug).toBe('the-owned-audience')
    expect(patch.publishedAt).toBe(NOW)
    expect(isFirstPublish).toBe(true)
  })

  it('suffixes a colliding slug', () => {
    const { patch } = publishPost({
      post: post(),
      takenSlugs: ['the-owned-audience'],
      frontier: {},
      now: NOW
    })
    expect(patch.slug).toBe('the-owned-audience-2')
  })

  it('never regenerates an existing slug, even when the title changed', () => {
    const { patch } = publishPost({
      post: post({ slug: 'original-url', title: 'A Completely New Title' }),
      takenSlugs: [],
      frontier: {},
      now: NOW
    })
    // The slug is a promise to inbound links: editing a heading must not break it.
    expect(patch.slug).toBeUndefined()
  })

  it('warns rather than silently fixing an invalid existing slug', () => {
    const { warnings, patch } = publishPost({
      post: post({ slug: 'Not A Slug' }),
      takenSlugs: [],
      frontier: {},
      now: NOW
    })
    expect(patch.slug).toBeUndefined()
    expect(warnings.join(' ')).toContain('not URL-safe')
  })

  it('keeps the original publishedAt when re-publishing', () => {
    const { patch, isFirstPublish } = publishPost({
      post: post({ slug: 's', publishedAt: 1_700_000_000_000 }),
      takenSlugs: [],
      frontier: { p1: { hash: 'h2', yjsSnapshotRef: 'p1@2000' } },
      now: NOW
    })
    expect(patch.publishedAt).toBeUndefined()
    expect(isFirstPublish).toBe(false)
    // Only the pin moves.
    expect(patch.publishedFrontier).toEqual({ p1: { hash: 'h2', yjsSnapshotRef: 'p1@2000' } })
  })

  it('pins a deep copy, so mutating the caller\'s frontier cannot rewrite history', () => {
    const frontier = { p1: { hash: 'h1', yjsSnapshotRef: 'p1@1' } }
    const { patch } = publishPost({ post: post(), takenSlugs: [], frontier, now: NOW })
    frontier.p1.hash = 'mutated'
    frontier.p1.yjsSnapshotRef = 'p1@999'
    expect(patch.publishedFrontier).toEqual({ p1: { hash: 'h1', yjsSnapshotRef: 'p1@1' } })
  })

  it('fills the excerpt only when the author left it empty', () => {
    const generated = publishPost({
      post: post(),
      takenSlugs: [],
      frontier: {},
      now: NOW,
      excerpt: 'Generated summary'
    })
    expect(generated.patch.excerpt).toBe('Generated summary')

    const authored = publishPost({
      post: post({ excerpt: 'Authored summary' }),
      takenSlugs: [],
      frontier: {},
      now: NOW,
      excerpt: 'Generated summary'
    })
    expect(authored.patch.excerpt).toBeUndefined()
  })

  it('warns on an empty frontier', () => {
    const { warnings } = publishPost({ post: post(), takenSlugs: [], frontier: {}, now: NOW })
    expect(warnings.join(' ')).toContain('empty frontier')
  })

  it('is pure — same inputs, same patch', () => {
    const args = { post: post(), takenSlugs: [], frontier: { p1: { hash: 'h1' } }, now: NOW }
    expect(publishPost(args).patch).toEqual(publishPost(args).patch)
  })
})

describe('unpublishPost', () => {
  it('clears the publish signal but keeps the slug', () => {
    const patch = unpublishPost()
    expect(patch.publishedAt).toBeUndefined()
    expect(patch.publishedFrontier).toBeUndefined()
    // Re-publishing later must restore the same URL.
    expect('slug' in patch).toBe(false)
  })
})

describe('frontierEquals / hasUnpublishedChanges', () => {
  it('compares frontiers irrespective of key order', () => {
    expect(
      frontierEquals({ a: { hash: '1' }, b: { hash: '2' } }, { b: { hash: '2' }, a: { hash: '1' } })
    ).toBe(true)
    expect(frontierEquals({ a: { hash: '1' } }, { a: { hash: '2' } })).toBe(false)
    expect(frontierEquals({ a: { hash: '1' } }, { a: { hash: '1' }, b: { hash: '2' } })).toBe(false)
  })

  it('compares entry contents, not object identity', () => {
    // Two frontiers loaded from storage are never the same objects.
    expect(frontierEquals({ a: { hash: '1' } }, { a: { hash: '1' } })).toBe(true)
    expect(
      frontierEquals({ a: { hash: '1', yjsSnapshotRef: 'a@1' } }, { a: { hash: '1' } })
    ).toBe(false)
  })

  it('reports pending edits only for published posts', () => {
    const published = post({ publishedAt: NOW, publishedFrontier: { p1: { hash: 'h1' } } })
    expect(hasUnpublishedChanges(published, { p1: { hash: 'h1' } })).toBe(false)
    expect(hasUnpublishedChanges(published, { p1: { hash: 'h2' } })).toBe(true)
    // A draft has nothing to diverge from.
    expect(hasUnpublishedChanges(post(), { p1: { hash: 'h9' } })).toBe(false)
  })
})

describe('takenSlugsFor', () => {
  it('collects slugs and excludes the post being published', () => {
    const posts = [
      post({ id: 'a', slug: 'one' }),
      post({ id: 'b', slug: 'two' }),
      post({ id: 'c' })
    ]
    expect(takenSlugsFor(posts, 'b')).toEqual(new Set(['one']))
  })
})
