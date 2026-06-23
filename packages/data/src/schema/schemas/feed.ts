/**
 * FeedSchema — a subscribed RSS/Atom feed source (exploration 0213).
 *
 * The hobbyist-loved, zero-auth integration: point xNet at a feed URL and a
 * pull connector (`buildRssConnector`) materializes each entry as a
 * {@link FeedItemSchema} node. The `Feed` node is the source of truth for what
 * to poll; its items cascade access from the same Space.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, date, relation, text, url } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const FEED_SCHEMA_IRI = 'xnet://xnet.fyi/Feed@1.0.0'

export const FeedSchema = defineSchema({
  name: 'Feed',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Human-readable feed title (from the feed's <title>, or user-set). */
    title: text({ required: true, maxLength: 500 }),

    /** The RSS/Atom feed URL polled by the connector. */
    feedUrl: url({ required: true }),

    /** The feed's human-facing website, when advertised. */
    siteUrl: url({}),

    /** Short description of the feed. */
    description: text({ maxLength: 2000 }),

    /** The home Space — drives the authorization cascade. */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** When this feed was last successfully polled (Unix ms). */
    lastPolledAt: date({ includeTime: true }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type Feed = InferNode<(typeof FeedSchema)['_properties']>
