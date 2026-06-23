/**
 * FeedItemSchema — one entry pulled from an RSS/Atom feed (exploration 0213).
 *
 * Written by `buildRssConnector` through the guarded connector store. Each item
 * is a small signed node (the Comment/ChatMessage pattern) rather than an entry
 * in a CRDT log, so it gets offline delivery, signing, and pagination for free.
 * `guid` is the feed entry's stable id and is used to de-duplicate re-polls.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, date, relation, text, url } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const FEED_ITEM_SCHEMA_IRI = 'xnet://xnet.fyi/FeedItem@1.0.0'

export const FeedItemSchema = defineSchema({
  name: 'FeedItem',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The Feed this entry came from. */
    feed: relation({ target: 'xnet://xnet.fyi/Feed@1.0.0' as const }),

    /** Entry title. */
    title: text({ required: true, maxLength: 1000 }),

    /** Canonical link to the entry. */
    link: url({}),

    /** Stable feed entry id (`<guid>`/`<id>`), used to de-duplicate re-polls. */
    guid: text({ maxLength: 1000 }),

    /** Short summary / description. */
    summary: text({ maxLength: 5000 }),

    /** Full content body in markdown/HTML-stripped text, when available. */
    content: text({}),

    /** Entry author, when advertised. */
    author: text({ maxLength: 500 }),

    /** When the entry was published (Unix ms). */
    publishedAt: date({ includeTime: true }),

    /** The home Space — drives the authorization cascade. */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export type FeedItem = InferNode<(typeof FeedItemSchema)['_properties']>
