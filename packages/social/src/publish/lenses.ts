/**
 * @xnetjs/social — record lenses for publishing affinity edges (0420 WP1).
 *
 * Both lenses are `projection` mode (0380): the node is the truth and the
 * record is a deliberately lossy card. Round-tripping is not expected to
 * restore the node, and `lossless: false` says so rather than leaving a reader
 * to discover it.
 *
 * What they do NOT project is the point. `targetTitle` exists on the node and
 * is never written: the title, description and thumbnail of a video are the
 * platform's and the creator's, not the user's. The user's own contribution —
 * the act of saving, when, and their own tags — is all that goes out. This is
 * also why the `$enriched` blob seen in the wild on real bookmark records is
 * the wrong pattern to copy, quite apart from `$`-prefixed keys being reserved
 * by the atproto data model.
 */

import type { SocialPlatform } from '../schemas/constants'
import type { NodeProperties, RecordLens } from '@xnetjs/data'
import { normalizeExternalReferenceUrl } from '@xnetjs/data'
import { AFFINITY_NSID, BOOKMARK_NSID, PLATFORM_DOMAINS, PLATFORM_ID_REFS } from './constants'

/**
 * Normalise a subject URL.
 *
 * Deliberately `@xnetjs/data`'s normaliser rather than the importers' looser
 * `normalizeUrl`: the affinity appview intersects on this exact string, so the
 * publisher and the reader MUST run the same function. Two normalisers that
 * agree today drift tomorrow, and the symptom is an overlap that silently
 * misses matches.
 */
export function normalizeSubject(input: string): string | null {
  return normalizeExternalReferenceUrl(input)
}

/** The xNet schema IRI these lenses read. */
export const SOCIAL_INTERACTION_IRI = 'xnet://xnet.fyi/social/SocialInteraction@1.0.0'

const str = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * The record's `createdAt`: when the interaction happened, falling back to when
 * the platform published the target, and only then to the import time.
 *
 * Deliberately no `new Date()` fallback. A record stamped "now" claims the user
 * saved something at publish time, which is false, and the falsehood is
 * permanent once written.
 */
export function edgeCreatedAt(node: NodeProperties): string | undefined {
  return str(node.observedAt) ?? str(node.publishedAt) ?? str(node.importedAt)
}

/**
 * Tags carried on the bookmark record.
 *
 * The bookmark lexicon has no field for the platform or the kind of
 * interaction, so they ride as namespaced tags. A bookmark-only reader sees
 * `xnet:youtube.com` and `xnet:like` and can at least group by them; a reader
 * that understands `fyi.xnet.social.affinity` gets them as real fields.
 */
export function edgeTags(node: NodeProperties): string[] {
  const platform = str(node.platform) as SocialPlatform | undefined
  const domain = platform ? PLATFORM_DOMAINS[platform] : undefined
  const kind = str(node.interactionKind)
  const tags = [...ownTags(node)]
  if (domain) tags.push(`xnet:${domain}`)
  if (kind) tags.push(`xnet:${kind}`)
  return [...new Set(tags)]
}

/** The user's own tags on a node, with our derived ones excluded. */
function ownTags(node: NodeProperties): string[] {
  if (!Array.isArray(node.tags)) return []
  return (node.tags as unknown[]).filter(
    (t): t is string => typeof t === 'string' && !t.startsWith(XNET_TAG_PREFIX)
  )
}

/**
 * The namespace our derived tags live under.
 *
 * `backward` strips these and `forward` re-derives them, which is what makes
 * `tags` survive a round trip. Without the split, reading a record and writing
 * it back would either drop the user's own tags or accumulate a duplicate
 * `xnet:` tag on every cycle.
 *
 * The cost is that a literal `xnet:`-prefixed tag written by some other app is
 * not preserved. That is the correct trade: this is our reverse-DNS-ish
 * namespace, and treating it as ours is what lets the two directions agree.
 */
const XNET_TAG_PREFIX = 'xnet:'

/** Tags a record carries, minus our derived ones — what belongs back on the node. */
export function recoveredTags(record: { tags?: unknown }): string[] {
  if (!Array.isArray(record.tags)) return []
  return (record.tags as unknown[]).filter(
    (t): t is string => typeof t === 'string' && !t.startsWith(XNET_TAG_PREFIX)
  )
}

/**
 * `SocialInteraction` → `community.lexicon.bookmarks.bookmark`.
 *
 * The node bag passed in is the interaction's properties PLUS a resolved
 * `targetUrl`, because the URL lives on the linked `SocialContent` and joining
 * is the caller's job (see `PublishableEdge`).
 */
export const interactionToBookmark: RecordLens = {
  lexicon: BOOKMARK_NSID,
  source: SOCIAL_INTERACTION_IRI,
  mode: 'projection',
  lossless: false,
  modelled: ['subject', 'createdAt', 'tags'],
  forward: (node) => ({
    subject: normalizeSubject(str(node.targetUrl) ?? '') ?? '',
    createdAt: edgeCreatedAt(node) ?? '',
    tags: edgeTags(node)
  }),
  backward: (record, priorNode) => ({
    ...priorNode,
    targetUrl: str(record.subject),
    observedAt: str(record.createdAt),
    tags: recoveredTags(record)
  })
}

/**
 * `SocialInteraction` → `fyi.xnet.social.affinity`, the extension record.
 *
 * Registered separately from `interactionToBookmark` rather than through the
 * shared registry, because `RecordLensRegistry` enforces one lexicon per source
 * schema — two cards for one node would race each other on republish with no
 * ordering to resolve the race. Here the two records are written by one
 * pipeline in a fixed order (bookmark first, affinity pointing at it), so the
 * race the registry guards against cannot happen.
 */
export const interactionToAffinity: RecordLens = {
  lexicon: AFFINITY_NSID,
  source: SOCIAL_INTERACTION_IRI,
  mode: 'projection',
  lossless: false,
  modelled: [
    'subject',
    'subjectRef',
    'platform',
    'interactionKind',
    'createdAt',
    'tags',
    'bookmark'
  ],
  forward: (node) => {
    const platform = str(node.platform) as SocialPlatform | undefined
    const record: Record<string, unknown> = {
      subject: normalizeSubject(str(node.targetUrl) ?? '') ?? '',
      platform: (platform && PLATFORM_DOMAINS[platform]) ?? '',
      interactionKind: str(node.interactionKind) ?? 'unknown',
      createdAt: edgeCreatedAt(node) ?? '',
      tags: Array.isArray(node.tags)
        ? (node.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : []
    }
    const ref = platform ? PLATFORM_ID_REFS[platform] : undefined
    const platformContentId = str(node.platformContentId)
    if (ref && platformContentId) record.subjectRef = { ref, value: platformContentId }
    const bookmark = str(node.bookmarkUri)
    if (bookmark) record.bookmark = bookmark
    return record
  },
  backward: (record, priorNode) => ({
    ...priorNode,
    targetUrl: str(record.subject),
    interactionKind: str(record.interactionKind),
    observedAt: str(record.createdAt),
    tags: recoveredTags(record)
  })
}
