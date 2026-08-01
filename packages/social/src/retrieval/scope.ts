/**
 * What an agent may read from the social graph (exploration 0419).
 *
 * Importing a decade of social archives and then pointing a retriever at the
 * whole thing is not one feature, it is two — and the second one is the
 * dangerous half. Exploration 0379 named the shape of it: better retrieval
 * widens the egress hole, because the same index that answers "what did I save
 * about fermentation" will just as happily answer with a private message.
 *
 * So the scope is an allowlist, not a denylist, and it is expressed over two
 * independent axes that both have to pass:
 *
 * - **Schema** — direct messages and conversations are out. Not because the
 *   text is uninteresting, but because a DM is someone else's words held in
 *   confidence, and no default should put them in a prompt.
 * - **Privacy class** — the importer already labels every record, and the
 *   classes it uses for account security, billing and ad targeting describe
 *   data that has no business being context for anything.
 *
 * Both axes are widenable by explicit opt-in, and nothing here reads a config
 * file or an environment variable: a caller that wants private material has to
 * ask for it in code the user can see.
 *
 * This is deliberately *not* the `RetrievalProfile` node from exploration 0415.
 * That holds four tuning weights — how far to walk, how much to trust the
 * vector side. This holds eligibility. Collapsing them would mean a knob
 * labelled "make search better" could quietly change what search is allowed to
 * see.
 */

import {
  SocialActorSchema,
  SocialCollectionItemSchema,
  SocialCollectionSchema,
  SocialContentSchema,
  SocialConversationSchema,
  SocialEnrichmentSchema,
  SocialInteractionSchema,
  SocialMessageSchema
} from '../schemas'

/**
 * Schemas an agent may retrieve from by default.
 *
 * Content (including transcripts), the collections that give it structure, the
 * actors who made it, the interactions that record what the user did with it,
 * and the enrichment that makes it legible.
 */
export const DEFAULT_SOCIAL_RETRIEVAL_SCHEMA_IDS: readonly string[] = [
  SocialContentSchema._schemaId,
  SocialCollectionSchema._schemaId,
  SocialCollectionItemSchema._schemaId,
  SocialActorSchema._schemaId,
  SocialInteractionSchema._schemaId,
  SocialEnrichmentSchema._schemaId
]

/**
 * Schemas held back unless a caller opts in.
 *
 * Messages and conversations carry other people's words; the import machinery
 * (archives, runs, jobs, raw source records) is bookkeeping that would only
 * dilute a context pack.
 */
export const SENSITIVE_SOCIAL_RETRIEVAL_SCHEMA_IDS: readonly string[] = [
  SocialMessageSchema._schemaId,
  SocialConversationSchema._schemaId
]

/** Privacy classes never eligible by default. */
export const EXCLUDED_SOCIAL_PRIVACY_CLASSES: readonly string[] = [
  'third-party-private',
  'account-security',
  'billing',
  'ads'
]

/**
 * Interaction kinds held back by default.
 *
 * A search history is a list of things the user typed when they thought no one
 * was reading, which makes it the single most revealing bucket in the archive
 * and the one least likely to be wanted as context.
 */
export const SENSITIVE_SOCIAL_INTERACTION_KINDS: readonly string[] = ['search', 'message']

export type SocialRetrievalScope = {
  /** Schema ids eligible for retrieval. */
  schemaIds: readonly string[]
  /** Privacy classes that disqualify a node regardless of schema. */
  excludedPrivacyClasses: readonly string[]
  /** Interaction kinds that disqualify a `SocialInteraction`. */
  excludedInteractionKinds: readonly string[]
  /** True when the scope was widened past the defaults. */
  includesSensitive: boolean
}

export type SocialRetrievalScopeOptions = {
  /**
   * Include direct messages and conversations.
   *
   * Off by default, and the parameter is named for what it costs rather than
   * what it enables.
   */
  includeMessages?: boolean
  /** Include search history and message interactions. */
  includeSearchHistory?: boolean
  /** Privacy classes to admit despite the default exclusion. */
  allowPrivacyClasses?: readonly string[]
}

/**
 * Build a retrieval scope.
 *
 * Called with no arguments this is the conservative default, which is the only
 * scope any automatic caller should use.
 */
export function createSocialRetrievalScope(
  options: SocialRetrievalScopeOptions = {}
): SocialRetrievalScope {
  const allowed = new Set(options.allowPrivacyClasses ?? [])
  const schemaIds = [
    ...DEFAULT_SOCIAL_RETRIEVAL_SCHEMA_IDS,
    ...(options.includeMessages ? SENSITIVE_SOCIAL_RETRIEVAL_SCHEMA_IDS : [])
  ]

  return {
    schemaIds,
    excludedPrivacyClasses: EXCLUDED_SOCIAL_PRIVACY_CLASSES.filter(
      (privacyClass) => !allowed.has(privacyClass)
    ),
    excludedInteractionKinds: options.includeSearchHistory
      ? []
      : SENSITIVE_SOCIAL_INTERACTION_KINDS,
    includesSensitive: Boolean(
      options.includeMessages || options.includeSearchHistory || allowed.size > 0
    )
  }
}

/** The default scope, precomputed for the common case. */
export const SOCIAL_RETRIEVAL_SCOPE: SocialRetrievalScope = createSocialRetrievalScope()

/** The minimum a node must carry for an eligibility decision. */
export type SocialRetrievalCandidate = {
  schemaId: string
  privacyClass?: string
  interactionKind?: string
}

export type SocialRetrievalDecision = {
  eligible: boolean
  /** Why it was excluded; absent when eligible. */
  reason?: 'schema-not-in-scope' | 'privacy-class-excluded' | 'interaction-kind-excluded'
}

/**
 * Decide whether one node may be retrieved, and say why when it may not.
 *
 * The reason is part of the return value rather than a log line because the
 * only honest way to show a user what their agent can see is to be able to
 * explain each exclusion.
 */
export function socialRetrievalDecision(
  candidate: SocialRetrievalCandidate,
  scope: SocialRetrievalScope = SOCIAL_RETRIEVAL_SCOPE
): SocialRetrievalDecision {
  if (!scope.schemaIds.includes(candidate.schemaId)) {
    return { eligible: false, reason: 'schema-not-in-scope' }
  }
  if (
    candidate.privacyClass &&
    scope.excludedPrivacyClasses.includes(candidate.privacyClass)
  ) {
    return { eligible: false, reason: 'privacy-class-excluded' }
  }
  if (
    candidate.interactionKind &&
    scope.excludedInteractionKinds.includes(candidate.interactionKind)
  ) {
    return { eligible: false, reason: 'interaction-kind-excluded' }
  }

  return { eligible: true }
}

/** Convenience predicate over {@link socialRetrievalDecision}. */
export function isSocialNodeRetrievable(
  candidate: SocialRetrievalCandidate,
  scope: SocialRetrievalScope = SOCIAL_RETRIEVAL_SCOPE
): boolean {
  return socialRetrievalDecision(candidate, scope).eligible
}

/**
 * Filter a candidate list, returning what passed and a per-reason tally of
 * what did not.
 *
 * The tally exists so a surface can say "412 items, 9 held back as private"
 * instead of silently returning 403.
 */
export function filterSocialRetrievalCandidates<T extends SocialRetrievalCandidate>(
  candidates: readonly T[],
  scope: SocialRetrievalScope = SOCIAL_RETRIEVAL_SCOPE
): { eligible: T[]; excluded: Record<NonNullable<SocialRetrievalDecision['reason']>, number> } {
  const excluded = {
    'schema-not-in-scope': 0,
    'privacy-class-excluded': 0,
    'interaction-kind-excluded': 0
  }
  const eligible: T[] = []

  for (const candidate of candidates) {
    const decision = socialRetrievalDecision(candidate, scope)
    if (decision.eligible) eligible.push(candidate)
    else if (decision.reason) excluded[decision.reason] += 1
  }

  return { eligible, excluded }
}
