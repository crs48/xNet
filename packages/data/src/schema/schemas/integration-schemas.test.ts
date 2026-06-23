/**
 * Integration schema pack tests (exploration 0213) — Feed / FeedItem /
 * ExternalItem. Exercises create + validate so the schemas are covered and the
 * authorization cascade is declared.
 */

import { describe, expect, it } from 'vitest'
import { ExternalItemSchema, EXTERNAL_ITEM_SCHEMA_IRI } from './external-item'
import { FeedItemSchema, FEED_ITEM_SCHEMA_IRI } from './feed-item'
import { FeedSchema, FEED_SCHEMA_IRI } from './feed'

const AUTHOR = 'did:key:zAuthor'

describe('Feed schema', () => {
  it('creates a valid feed node', () => {
    const node = FeedSchema.create(
      { title: 'XKCD', feedUrl: 'https://xkcd.com/atom.xml' },
      { createdBy: AUTHOR }
    )
    expect(FeedSchema.validate(node).valid).toBe(true)
    expect(FeedSchema._schemaId).toBe(FEED_SCHEMA_IRI)
  })

  it('requires a feed URL', () => {
    const node = FeedSchema.create({ title: 'No URL' } as never, { createdBy: AUTHOR })
    expect(FeedSchema.validate(node).valid).toBe(false)
  })
})

describe('FeedItem schema', () => {
  it('creates a valid feed item', () => {
    const node = FeedItemSchema.create(
      { title: 'A new comic', link: 'https://xkcd.com/2/', guid: 'xkcd-2' },
      { createdBy: AUTHOR }
    )
    expect(FeedItemSchema.validate(node).valid).toBe(true)
    expect(FeedItemSchema._schemaId).toBe(FEED_ITEM_SCHEMA_IRI)
  })
})

describe('ExternalItem schema', () => {
  it('creates a valid external item from a known source', () => {
    const node = ExternalItemSchema.create(
      {
        source: 'github',
        kind: 'issue',
        externalId: 'octo/repo#42',
        title: 'Bug: it broke',
        url: 'https://github.com/octo/repo/issues/42',
        status: 'open'
      },
      { createdBy: AUTHOR }
    )
    expect(ExternalItemSchema.validate(node).valid).toBe(true)
    expect(ExternalItemSchema._schemaId).toBe(EXTERNAL_ITEM_SCHEMA_IRI)
  })

  it('accepts the webhook-provider sources (stripe/sentry/pagerduty)', () => {
    for (const source of ['stripe', 'sentry', 'pagerduty'] as const) {
      const node = ExternalItemSchema.create(
        { source, kind: 'event', externalId: `${source}-1`, title: 'evt' },
        { createdBy: AUTHOR }
      )
      expect(ExternalItemSchema.validate(node).valid, source).toBe(true)
    }
  })

  it('rejects an unknown source', () => {
    const node = ExternalItemSchema.create(
      { source: 'pidgeon', kind: 'note', externalId: 'x', title: 'y' } as never,
      { createdBy: AUTHOR }
    )
    expect(ExternalItemSchema.validate(node).valid).toBe(false)
  })
})
