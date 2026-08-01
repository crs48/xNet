/**
 * Seeded context packs over the social graph (exploration 0419).
 *
 * `xnet_create_context_pack` already takes a query, a seed list and a budget.
 * What was missing was anything to point it at: an agent asked "what has this
 * person been watching about X" had to invent a query shape, guess which
 * schemas mattered, and hope it did not walk into a DM.
 *
 * These are those questions, written down once — each with the retrieval scope
 * it runs under, so the pack's boundary travels with the pack rather than
 * being re-decided at every call site.
 */

import type { SocialRetrievalScope } from './scope'
import { SocialContentSchema } from '../schemas'
import { createSocialRetrievalScope, SOCIAL_RETRIEVAL_SCOPE } from './scope'

export type SocialContextPackId =
  | 'social.pack.saved-library'
  | 'social.pack.watched-transcripts'

/** A seed resource, matching the `xnet_create_context_pack` seed shape. */
export type SocialContextPackSeed = {
  kind: 'node' | 'saved-view' | 'schema'
  id: string
}

export type SocialContextPackDefinition = {
  id: SocialContextPackId
  title: string
  /** What the pack is for, in the words an agent would use to pick it. */
  description: string
  /** Default query text; callers normally replace or extend this. */
  query: string
  seeds: SocialContextPackSeed[]
  /** Maximum resources to pull. */
  limit: number
  scope: SocialRetrievalScope
}

export type SocialContextPackOptions = {
  /** Search text to use instead of the pack's default. */
  query?: string
  limit?: number
  /** Widen the scope. Off by default for every pack. */
  scope?: SocialRetrievalScope
}

const DEFAULT_PACK_LIMIT = 40

/**
 * The default packs.
 *
 * Two, deliberately. A long menu of near-identical packs is a worse interface
 * than two that clearly differ: one is "things I chose to keep", the other is
 * "things that were said in videos I watched".
 */
export function createDefaultSocialContextPacks(
  options: SocialContextPackOptions = {}
): SocialContextPackDefinition[] {
  const scope = options.scope ?? SOCIAL_RETRIEVAL_SCOPE
  const limit = options.limit ?? DEFAULT_PACK_LIMIT

  return [
    {
      id: 'social.pack.saved-library',
      title: 'Saved library',
      description:
        'Posts, videos and links the user saved, liked or bookmarked across platforms, with the collections they were filed under.',
      query: options.query ?? '',
      seeds: [{ kind: 'schema', id: SocialContentSchema._schemaId }],
      limit,
      scope
    },
    {
      id: 'social.pack.watched-transcripts',
      title: 'Watched transcripts',
      description:
        'Spoken content from videos the user saved or watched, for answering what was actually said rather than what a title claims.',
      query: options.query ?? '',
      seeds: [{ kind: 'schema', id: SocialContentSchema._schemaId }],
      limit,
      scope
    }
  ]
}

/**
 * A pack that may read direct messages.
 *
 * Not in the default list, and it takes an explicit call to build — the point
 * is that widening the boundary is a visible act, not a flag someone flips.
 */
export function createSensitiveSocialContextPack(
  options: SocialContextPackOptions = {}
): SocialContextPackDefinition {
  return {
    id: 'social.pack.saved-library',
    title: 'Saved library, including messages',
    description:
      'The saved library widened to include direct messages and conversations. Only for an explicit, user-initiated request.',
    query: options.query ?? '',
    seeds: [{ kind: 'schema', id: SocialContentSchema._schemaId }],
    limit: options.limit ?? DEFAULT_PACK_LIMIT,
    scope: createSocialRetrievalScope({ includeMessages: true })
  }
}
