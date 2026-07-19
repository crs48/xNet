/**
 * PostSchema — a discussion topic inside a Space (exploration 0359).
 *
 * This is the *forum-shaped* discussion primitive, deliberately distinct from
 * `Channel` + `ChatMessage` (which are Slack-shaped: a stream you scroll).
 * A Post is a topic with a title and a body that people reply to over days,
 * not a message that scrolls away in an hour.
 *
 * **Threading reuses `Comment`, it does not mint a parallel reply type.**
 * `Comment` is already the Universal Social Primitive — schema-agnostic
 * `target`, flat threading, mentions, reactions and link previews all work on
 * it, and `isCommentSchema` in the hub's share-access allowlist already lets a
 * `commenter` reply without write access to the topic itself. A "thread" is
 * therefore a Post plus the Comments targeting it — a derived view, not a
 * stored node.
 *
 * Authorization is `spaceContributorAuthorization()`: anyone in the Space may
 * post, only the author (or a space admin/owner) may edit. That is the
 * community policy — the `creator` role is deliberately absent from `create`,
 * because letting the creator of a node grant themselves creation rights would
 * make the admission gate vacuous.
 *
 * Ordering is chronological and structural only — `pinned` then `createdAt`.
 * There is no score, rank or engagement signal on this schema by design
 * (Charter §3; `charter-calm-feeds.test.ts` asserts it).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { checkbox, created, createdBy, relation, select, text } from '../properties'
import { spaceContributorAuthorization } from './space-authorization'

export const POST_SCHEMA_IRI = 'xnet://xnet.fyi/Post@1.0.0'

export const PostSchema = defineSchema({
  name: 'Post',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Topic title — what the discussion is about. */
    title: text({ required: true, maxLength: 300 }),

    /** Canonical SECURITY home. A Post without a Space is a personal draft. */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /**
     * Optional grouping within a community — "Announcements", "Wins",
     * "Questions". A plain label rather than a relation: communities rename
     * and merge these constantly, and a Tag relation would make the common
     * case (one host, five categories) a two-node write.
     */
    category: text({ maxLength: 80 }),

    /**
     * Pinned topics sort above the rest. This is the ONE ordering lever, and
     * it is an explicit editorial act by a space admin — not an engagement
     * score, and not computed from any behavioural signal.
     */
    pinned: checkbox({ default: false }),

    /** Locked topics accept no new replies; existing ones stay readable. */
    locked: checkbox({ default: false }),

    /** Per-node visibility; `inherit` defers to the Space (exploration 0179). */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'inherit'
    }),

    createdAt: created(),
    createdBy: createdBy()
  },
  // Rich body, same editor surface as Page (BlockNote over a Y.Doc).
  document: 'yjs',
  authorization: spaceContributorAuthorization()
})

export type Post = InferNode<(typeof PostSchema)['_properties']>

/**
 * Chronological ordering for a community feed: pinned first, then newest.
 *
 * Structural and time fields only — no score, no rank, no recency-decay
 * curve. Kept here (rather than inline at call sites) so there is one place
 * to audit against Charter §3.
 */
export const comparePostsForFeed = (
  a: Pick<Post, 'pinned' | 'createdAt'>,
  b: Pick<Post, 'pinned' | 'createdAt'>
): number => {
  // Coerce explicitly: an absent `pinned` must sort identically to `false`,
  // not as a third state.
  const aPinned = a.pinned === true
  const bPinned = b.pinned === true
  if (aPinned !== bPinned) return aPinned ? -1 : 1
  return (b.createdAt ?? 0) - (a.createdAt ?? 0)
}
