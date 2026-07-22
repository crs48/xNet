/**
 * Atmosphere publish state — the one-way door in the type system (0365/0389).
 *
 * Projecting a node's card onto a PDS is irreversible in a way local publishing
 * is not. A static site can un-publish a page — drop it from the sitemap and it
 * is gone. The atmosphere cannot: a record put into a public repo is on the
 * firehose, and deletion is specified with *should* and *may*, never *must*
 * (sync v1.1 even removed the tombstone). So the honest control is **Withdraw**
 * (ask downstream to stop serving), never "make private" (a promise the
 * substrate cannot keep — a Charter §4 consent problem, not a missing feature).
 *
 * This module encodes that asymmetry so a UI cannot render the dishonest
 * affordance by accident:
 *
 *  - the state machine has **no transition back to `unpublished`** from any
 *    state that was ever public;
 *  - `canEnterAtmosphere` refuses to admit gated content in the first place —
 *    gated and public are two rails, and content crosses from private to public
 *    exactly once, deliberately, never the other way.
 */

/**
 * Where a node stands with respect to the public atmosphere. Distinct from a
 * node's `visibility` (private/unlisted/public) and from the local
 * `publishedAt` sitemap signal — this is specifically about the PDS card.
 */
export type AtmospherePublishState =
  /** Never projected. The only state from which a node is still fully private. */
  | 'unpublished'
  /** A card is live in the repo and on the firehose. */
  | 'published'
  /** The record was deleted; downstream SHOULD stop serving, no guarantee. */
  | 'withdrawn'

/** The actions a user can take. Note there is no "make private". */
export type AtmospherePublishAction = 'publish' | 'withdraw' | 'republish'

/**
 * Legal transitions. The shape is the whole point: `published` and `withdrawn`
 * never lead back to `unpublished`. Republishing a withdrawn card reuses its
 * identity (`putRecord`, not a fresh create) so inbound links survive.
 */
const TRANSITIONS: Record<
  AtmospherePublishState,
  Partial<Record<AtmospherePublishAction, AtmospherePublishState>>
> = {
  unpublished: { publish: 'published' },
  published: { withdraw: 'withdrawn' },
  withdrawn: { republish: 'published' }
}

export interface TransitionResult {
  ok: boolean
  state: AtmospherePublishState
  reason?: string
}

/**
 * Apply an action to a publish state.
 *
 * Illegal transitions return `ok: false` with the state unchanged — notably,
 * NO action ever yields `unpublished` from `published`/`withdrawn`, so a caller
 * cannot walk a public node back to private through this function.
 */
export function applyAtmosphereAction(
  state: AtmospherePublishState,
  action: AtmospherePublishAction
): TransitionResult {
  const next = TRANSITIONS[state][action]
  if (!next) {
    return {
      ok: false,
      state,
      reason: `Cannot ${action} a node that is ${state}`
    }
  }
  return { ok: true, state: next }
}

/** The actions offered from a given state — what a UI may render, and no more. */
export function availableAtmosphereActions(
  state: AtmospherePublishState
): AtmospherePublishAction[] {
  return Object.keys(TRANSITIONS[state]) as AtmospherePublishAction[]
}

/**
 * Node visibility values (mirrors the `visibility` select on publishable
 * schemas). `inherit` defers to the Space and is treated conservatively here.
 */
export type NodeVisibilityValue = 'inherit' | 'private' | 'unlisted' | 'public'

/**
 * Whether a node with this visibility may EVER be projected to the public
 * atmosphere. Only genuinely public content qualifies.
 *
 * - `private` — never; it is gated, and gated content lives on the other rail.
 * - `inherit` — refused: we cannot prove it resolves to public without the
 *   Space, and the safe default for a one-way public door is "no". A caller
 *   that has resolved the effective visibility passes that concrete value
 *   instead.
 * - `unlisted` / `public` — admissible.
 *
 * This is the gate that keeps gated content from ever becoming a public record
 * (0365): the two rails never cross except here, and only in the safe
 * direction.
 */
export function canEnterAtmosphere(visibility: NodeVisibilityValue): boolean {
  return visibility === 'public' || visibility === 'unlisted'
}

/**
 * Guard a publish/republish attempt against a node's visibility.
 *
 * Returns a refusal for gated content rather than letting a card be minted —
 * "make it public first" is a deliberate, separate act the user must take.
 */
export function assertCanPublish(visibility: NodeVisibilityValue): TransitionResult | null {
  if (!canEnterAtmosphere(visibility)) {
    return {
      ok: false,
      state: 'unpublished',
      reason:
        `A ${visibility} node cannot be published to the atmosphere. Make it public ` +
        `first — publishing is a one-way door and gated content must never become a public record.`
    }
  }
  return null
}
