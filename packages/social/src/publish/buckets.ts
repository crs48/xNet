/**
 * @xnetjs/social — the publication picker (0420 WP2).
 *
 * "Publish my social graph" is not a question a person can answer. "Publish 214
 * YouTube likes from 2026, excluding 31 marked sensitive" is. This module turns
 * the first into the second, and — more importantly — decides what is never
 * offered at all.
 *
 * The exclusions here are the safety layer of the whole feature. They are
 * structural, not defaults: `selectableInteractionKinds()` cannot return
 * `follow` or `message` no matter what a caller passes, because a checkbox
 * defaulted to off is one mis-click from a mistake that cannot be taken back.
 */

import type { ExcludedEdge, ExclusionReason, PublishableEdge } from './types'
import type { SocialInteractionKind, SocialPlatform } from '../schemas/constants'
import { normalizeExternalReferenceUrl } from '@xnetjs/data'
import {
  NEVER_PUBLISHABLE_INTERACTION_KINDS,
  NEVER_PUBLISHABLE_PRIVACY_CLASSES,
  PLATFORM_DOMAINS,
  PUBLISHABLE_INTERACTION_KINDS
} from './constants'

const NEVER_KINDS = new Set<string>(NEVER_PUBLISHABLE_INTERACTION_KINDS)
const NEVER_CLASSES = new Set<string>(NEVER_PUBLISHABLE_PRIVACY_CLASSES)

/**
 * The interaction kinds a picker may show. Not "the defaults" — the whole set.
 * Nothing outside this list can reach a publish run through any code path.
 */
export function selectableInteractionKinds(): readonly SocialInteractionKind[] {
  return PUBLISHABLE_INTERACTION_KINDS.filter((kind) => !NEVER_KINDS.has(kind))
}

/** Platforms whose origin we can name honestly in a record. */
export function selectablePlatforms(): readonly SocialPlatform[] {
  return Object.keys(PLATFORM_DOMAINS).sort() as SocialPlatform[]
}

/** What the user asked to publish. Absent selections mean "everything selectable". */
export interface BucketSelection {
  platforms?: readonly SocialPlatform[]
  interactionKinds?: readonly SocialInteractionKind[]
  /** Inclusive ISO date bounds on `occurredAt`. */
  from?: string
  to?: string
}

export interface BucketResult {
  /** Edges that will be published, in stable order. */
  included: PublishableEdge[]
  /** Edges that will not, each with a nameable reason. */
  excluded: ExcludedEdge[]
  /** Exclusions by reason — the count the ceremony shows the user. */
  excludedByReason: Record<ExclusionReason, number>
}

/**
 * Why this edge cannot be published, or `null` if it can.
 *
 * Order matters: the hard structural exclusions are checked before the user's
 * own selection, so an edge that is never publishable reports *that* rather
 * than "you didn't tick this box" — the user should never learn that ticking a
 * box would have included their DMs.
 */
export function exclusionFor(
  edge: PublishableEdge,
  selection: BucketSelection = {}
): ExclusionReason | null {
  if (NEVER_CLASSES.has(edge.privacyClass)) return 'third-party'
  if (NEVER_KINDS.has(edge.interactionKind)) return 'interaction-kind-never-publishable'
  if (!PUBLISHABLE_INTERACTION_KINDS.includes(edge.interactionKind)) {
    return 'interaction-kind-never-publishable'
  }
  if (!PLATFORM_DOMAINS[edge.platform]) return 'unknown-platform'
  // Normalisation is the same check the lens will run; failing it here means
  // the edge would have produced a record with an empty subject.
  if (!edge.targetUrl || normalizeExternalReferenceUrl(edge.targetUrl) === null) return 'no-url'

  if (selection.platforms && !selection.platforms.includes(edge.platform)) {
    return 'interaction-kind-not-selected'
  }
  if (selection.interactionKinds && !selection.interactionKinds.includes(edge.interactionKind)) {
    return 'interaction-kind-not-selected'
  }
  if (selection.from && (edge.occurredAt ?? '') < selection.from) {
    return 'interaction-kind-not-selected'
  }
  if (selection.to && (edge.occurredAt ?? '') > selection.to) {
    return 'interaction-kind-not-selected'
  }
  return null
}

const EMPTY_COUNTS = (): Record<ExclusionReason, number> => ({
  'third-party': 0,
  'duplicate-subject': 0,
  'interaction-kind-never-publishable': 0,
  'interaction-kind-not-selected': 0,
  'unknown-platform': 0,
  'no-url': 0
})

/**
 * Split a candidate set into what will be published and what will not.
 *
 * Included edges are sorted by `nodeId` so a run is reproducible and a preview
 * shown to the user matches the order the queue will walk.
 */
export function selectBucket(
  edges: readonly PublishableEdge[],
  selection: BucketSelection = {}
): BucketResult {
  const included: PublishableEdge[] = []
  const excluded: ExcludedEdge[] = []
  const excludedByReason = EMPTY_COUNTS()

  for (const edge of edges) {
    const reason = exclusionFor(edge, selection)
    if (reason) {
      excluded.push({ nodeId: edge.nodeId, reason })
      excludedByReason[reason]++
    } else {
      included.push(edge)
    }
  }

  included.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0))
  return {
    included: dedupeBySubject(included, excluded, excludedByReason),
    excluded,
    excludedByReason
  }
}

/**
 * Collapse edges that normalise to the same subject URL.
 *
 * One video reached from a playlist AND from liked-videos is two interactions
 * with two node ids and one record's worth of meaning. Without this the run
 * writes it twice, and — worse — `reconcile()` maps a subject back to exactly
 * one node id, so the duplicate looks unpublished forever and is re-created on
 * every subsequent run.
 *
 * The earliest interaction wins (the list is already sorted, so this is
 * deterministic), and the collapsed ones are reported as excluded rather than
 * vanishing: the preview's counts must add up.
 */
function dedupeBySubject(
  included: readonly PublishableEdge[],
  excluded: ExcludedEdge[],
  counts: Record<ExclusionReason, number>
): PublishableEdge[] {
  const seen = new Set<string>()
  const out: PublishableEdge[] = []
  for (const edge of included) {
    const subject = normalizeExternalReferenceUrl(edge.targetUrl ?? '')
    if (!subject) continue
    if (seen.has(subject)) {
      excluded.push({ nodeId: edge.nodeId, reason: 'duplicate-subject' })
      counts['duplicate-subject']++
      continue
    }
    seen.add(subject)
    out.push(edge)
  }
  return out
}
