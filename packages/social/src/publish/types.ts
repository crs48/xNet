/**
 * @xnetjs/social — the shapes the publish pipeline moves around (0420).
 */

import type { AtmospherePublishState } from '@xnetjs/data'
import type { SocialInteractionKind, SocialPlatform, SocialPrivacyClass } from '../schemas/constants'

/**
 * One resolved interaction, ready to be looked at by the picker and the lens.
 *
 * A `SocialInteraction` node holds a *relation* to its target, not a URL — the
 * URL lives on the linked `SocialContent`. Resolving that join is the caller's
 * job (it owns the store); everything downstream of here works on the resolved
 * shape, which is what keeps this directory free of store dependencies and
 * testable on plain objects.
 */
export interface PublishableEdge {
  /** The `SocialInteraction` node id — deterministic, from `createSocialNodeId`. */
  nodeId: string
  platform: SocialPlatform
  interactionKind: SocialInteractionKind
  privacyClass: SocialPrivacyClass
  /** Resolved from the target `SocialContent` (`canonicalUrl` ?? `platformUrl`). */
  targetUrl?: string
  /** The platform's own id for the target, when it is more stable than the URL. */
  platformContentId?: string
  /** When the interaction happened on the source platform. */
  occurredAt?: string
  /** The user's own tags. Never platform-derived metadata. */
  tags?: readonly string[]
}

/**
 * Why an edge cannot be published. Every exclusion is nameable — a silently
 * dropped row is indistinguishable from one nobody selected, and the picker's
 * whole job is to be honest about what it is not offering.
 */
export type ExclusionReason =
  | 'third-party'
  | 'interaction-kind-never-publishable'
  | 'interaction-kind-not-selected'
  | 'unknown-platform'
  | 'no-url'

export interface ExcludedEdge {
  nodeId: string
  reason: ExclusionReason
}

/**
 * The state of one edge in a publish run.
 *
 * The four terminal-ish states are deliberately distinguishable: per the repo's
 * error rule, "never offered", "not written yet", "the PDS refused" and
 * "withdrawn" are four different facts, and a run that stopped at record 900 of
 * 2,000 is not a completed run.
 *
 * This is the *run* view. The *door* view — which is irreversible and which a
 * UI must never render an "un-publish" for — is `AtmospherePublishState` in
 * `@xnetjs/data`, and {@link toAtmosphereState} is the only mapping between
 * them. Keeping them separate matters: `failed` and `staged` are both
 * `unpublished` at the door, and neither is a state a user can be reassured by.
 */
export type PublishState = 'local' | 'staged' | 'published' | 'failed' | 'withdrawn'

/**
 * Collapse a run state onto the one-way-door state machine.
 *
 * Note what this cannot produce: there is no way back to `unpublished` from
 * `published`, because `AtmospherePublishState` has no such transition. A
 * withdrawn edge stays `withdrawn` forever — deletion asks downstream to stop
 * serving and guarantees nothing.
 */
export function toAtmosphereState(state: PublishState): AtmospherePublishState {
  if (state === 'published') return 'published'
  if (state === 'withdrawn') return 'withdrawn'
  return 'unpublished'
}

/** A record we wrote, and where it landed. The map that makes republish idempotent. */
export interface PublishedEdge {
  nodeId: string
  /** `at://did/collection/rkey` of the bookmark record. */
  uri: string
  cid: string
  /** The affinity record, when the extension was enabled for the run. */
  affinityUri?: string
  publishedAt: string
}
