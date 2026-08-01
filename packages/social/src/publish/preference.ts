/**
 * @xnetjs/social — the AI-use declaration published alongside an affinity set
 * (0420 WP2).
 *
 * `community.lexicon.preference.ai` is the most-adopted community lexicon
 * relevant here — measured at 2,047 DIDs on 2026-08-01, more than six times the
 * bookmarks lexicon itself. Emitting one is part of the publish ceremony, not a
 * setting buried elsewhere: a published affinity set with no declaration is a
 * training corpus by default.
 *
 * It is a declaration, not an enforcement — the standing of a `robots.txt`. It
 * is still worth writing for the same reason `robots.txt` is: it converts
 * "they never said" into "they said and you ignored it", which is the
 * difference between an accident and a decision.
 */

import { BOOKMARK_NSID, AFFINITY_NSID, PREFERENCE_AI_NSID } from './constants'

/**
 * Tri-state, exactly as the lexicon defines it: `true` allow, `false` deny,
 * **absent** means undeclared and inherits from a wider scope. `undefined` is
 * therefore meaningful and must not be normalised to `false`.
 */
export interface AiUsePreferences {
  training?: boolean
  inference?: boolean
  syntheticContent?: boolean
  embedding?: boolean
}

/**
 * What the ceremony proposes when nobody has said otherwise.
 *
 * Denying `training` and `syntheticContent` while leaving `inference` and
 * `embedding` allowed is the shape that matches why someone publishes an
 * affinity set at all: they want a friend's app to be able to find the overlap
 * (inference, embedding), not to become model weights (training, synthesis).
 * The user can change any of the four; the ceremony shows all four.
 */
export const DEFAULT_AI_PREFERENCES: AiUsePreferences = {
  training: false,
  syntheticContent: false,
  inference: true,
  embedding: true
}

export interface AiPreferenceRecord {
  $type: typeof PREFERENCE_AI_NSID
  scope: { $type: string; collection?: string }
  preferences: AiUsePreferences
  createdAt: string
}

/** The collections a publish run creates, and therefore the ones to scope. */
export const PUBLISHED_COLLECTIONS = [BOOKMARK_NSID, AFFINITY_NSID] as const

/**
 * Overlay a partial preference set on a base, ignoring keys explicitly set to
 * `undefined`.
 *
 * A plain object spread would let `{training: undefined}` overwrite a `false`,
 * turning a deny into an undeclared — which a downstream consumer is free to
 * read as permission. Callers building a partial object from optional form
 * state hit that constantly, so the safe direction is enforced here rather than
 * left to every call site.
 */
export function mergePreferences(
  base: AiUsePreferences,
  overlay?: AiUsePreferences
): AiUsePreferences {
  const out: AiUsePreferences = { ...base }
  for (const [key, value] of Object.entries(overlay ?? {})) {
    if (value !== undefined) out[key as keyof AiUsePreferences] = value as boolean
  }
  return out
}

/**
 * Build one `collectionScope` declaration per published collection.
 *
 * Collection scope rather than global is deliberate. A global declaration would
 * speak for every record in the repo, including ones other apps wrote, which is
 * not this ceremony's business — the user is publishing an affinity set, not
 * setting policy for their whole account.
 */
export function buildAiPreferenceRecords(input: {
  preferences?: AiUsePreferences
  collections?: readonly string[]
  createdAt: string
}): Array<{ rkey: string; record: AiPreferenceRecord }> {
  const preferences = mergePreferences(DEFAULT_AI_PREFERENCES, input.preferences)
  const collections = input.collections ?? PUBLISHED_COLLECTIONS
  return collections.map((collection) => ({
    // rkey = the collection it speaks for, so re-running the ceremony updates
    // the declaration in place instead of stacking contradictory ones.
    rkey: collection,
    record: {
      $type: PREFERENCE_AI_NSID,
      scope: { $type: `${PREFERENCE_AI_NSID}#collectionScope`, collection },
      preferences,
      createdAt: input.createdAt
    }
  }))
}
