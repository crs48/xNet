/**
 * @xnetjs/hub — the affinity appview (exploration 0420).
 *
 * Answers exactly one question: **what do you and this named person both
 * have?** It reads the derived atproto index — public bookmark and affinity
 * records the index role already crawls — and intersects two actors' subject
 * sets.
 *
 * ## What it deliberately cannot answer
 *
 * There is no "most-saved", no ranking, no global count, and no leaderboard.
 * That is not an omission to fill in later: a public like corpus with a
 * scoreboard is a recommender, and building one is the failure mode of this
 * whole feature (0378 — interaction without a scoreboard). `affinity.test.ts`
 * asserts the route surface stays this small, so the constraint survives
 * someone's good idea in six months.
 *
 * ## Why the appview may be hosted without becoming rent
 *
 * The records live in each user's own PDS; this index is derived and rebuilds
 * from public inputs. If xNet disappeared, every published edge survives and
 * anyone can run `xnet hub --role index` to rebuild the comparison. That is the
 * Charter §6 vanish and BATNA tests passing structurally rather than by
 * promise. The sleep test is weak — an open-source appview would take this lane
 * to zero — which is exactly why it must never be priced as its own tier.
 */

import type { IndexEntry } from './atproto-index'
import type { AbuseLabel, AbuseVisibility, UserSensitivityPreferences } from '@xnetjs/abuse'
import { resolveContentVisibility } from '@xnetjs/abuse'
import { normalizeExternalReferenceUrl } from '@xnetjs/data'

/** The collections an affinity comparison reads. */
export const BOOKMARK_COLLECTION = 'community.lexicon.bookmarks.bookmark'
export const AFFINITY_COLLECTION = 'fyi.xnet.social.affinity'
export const AFFINITY_COLLECTIONS = [BOOKMARK_COLLECTION, AFFINITY_COLLECTION] as const

/**
 * One subject an actor has an edge to.
 *
 * `platform` and `interactionKind` are present only when the actor published
 * the `fyi.xnet.social.affinity` extension; a bookmark-only publisher yields
 * the subject alone, which is still enough to intersect on.
 */
export interface AffinitySubject {
  subject: string
  platform?: string
  interactionKind?: string
  createdAt?: string
}

/**
 * Extract an actor's subjects from index entries.
 *
 * The same URL published as both a bookmark and an affinity record collapses to
 * one entry, with the richer record winning — otherwise every extension user
 * would appear to have twice the overlap of everyone else, which would quietly
 * turn the comparison into a popularity signal for xNet's own format.
 */
export function subjectsForActor(entries: readonly IndexEntry[], did: string): AffinitySubject[] {
  const bySubject = new Map<string, AffinitySubject>()
  for (const entry of entries) {
    if (entry.did !== did) continue
    if (entry.collection !== BOOKMARK_COLLECTION && entry.collection !== AFFINITY_COLLECTION) {
      continue
    }
    const raw = entry.value.subject
    if (typeof raw !== 'string') continue
    const subject = normalizeExternalReferenceUrl(raw)
    if (!subject) continue

    const enriched = entry.collection === AFFINITY_COLLECTION
    const existing = bySubject.get(subject)
    if (existing && !enriched) continue
    bySubject.set(subject, {
      subject,
      platform: enriched ? asString(entry.value.platform) : existing?.platform,
      interactionKind: enriched ? asString(entry.value.interactionKind) : existing?.interactionKind,
      createdAt: asString(entry.value.createdAt) ?? existing?.createdAt
    })
  }
  return [...bySubject.values()].sort((a, b) => (a.subject < b.subject ? -1 : 1))
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/**
 * The intersection of two subject sets.
 *
 * Both sides are normalised with the same function the publisher used
 * (`@xnetjs/data`'s), which is the only reason the strings can be compared at
 * all — `https://youtube.com/watch?v=x` and `https://www.youtube.com/watch?v=x/`
 * are the same video and different strings.
 */
export function sharedSubjects(a: Iterable<string>, b: Iterable<string>): string[] {
  const left = new Set<string>()
  for (const raw of a) {
    const url = normalizeExternalReferenceUrl(raw)
    if (url) left.add(url)
  }
  const out = new Set<string>()
  for (const raw of b) {
    const url = normalizeExternalReferenceUrl(raw)
    if (url && left.has(url)) out.add(url)
  }
  return [...out].sort()
}

export interface AffinityComparison {
  actors: [string, string]
  /** Subjects both actors have an edge to, sorted. */
  shared: AffinitySubject[]
  /** How many edges each actor published — context for the overlap, per actor. */
  counts: Record<string, number>
}

/**
 * Apply the viewer's sensitivity dial to shared subjects.
 *
 * The subjects here are **links into other people's repos**, so nothing local
 * has been through the usual render gate. Sensitivity is a per-viewer concern
 * (0175) and the dial is theirs, not the platform's — so a `hide` removes the
 * subject and a `warn`/`blur` marks it, rather than the appview deciding for
 * everyone.
 *
 * `labelsFor` is injected because label provenance belongs to whoever runs the
 * appview: a labeler subscription, a local list, or nothing at all. With no
 * labels this is the identity function, which is the honest default — an
 * appview that has never seen a label must not pretend it has vetted anything.
 */
export function applyViewerSensitivity(
  shared: readonly AffinitySubject[],
  labelsFor: (subject: string) => readonly AbuseLabel[],
  preferences?: UserSensitivityPreferences
): Array<AffinitySubject & { sensitivity?: AbuseVisibility }> {
  const out: Array<AffinitySubject & { sensitivity?: AbuseVisibility }> = []
  for (const item of shared) {
    const labels = labelsFor(item.subject)
    if (labels.length === 0) {
      out.push(item)
      continue
    }
    const visibility = resolveContentVisibility({ visibility: 'show' }, labels, preferences)
    if (visibility === 'hide') continue
    out.push(visibility === 'show' ? item : { ...item, sensitivity: visibility })
  }
  return out
}

/**
 * Compare two actors.
 *
 * Note the shape of what comes back: a list of shared things and each actor's
 * own total. No score, no percentage, no rank against anyone else. A caller who
 * wants "how similar are we" can compute it for the pair in front of them; what
 * they cannot get from this endpoint is a table of everybody.
 */
export function compareActors(
  entries: readonly IndexEntry[],
  actorA: string,
  actorB: string
): AffinityComparison {
  const a = subjectsForActor(entries, actorA)
  const b = subjectsForActor(entries, actorB)
  const shared = sharedSubjects(
    a.map((s) => s.subject),
    b.map((s) => s.subject)
  )
  const byUrlA = new Map(a.map((s) => [s.subject, s]))
  const byUrlB = new Map(b.map((s) => [s.subject, s]))
  return {
    actors: [actorA, actorB],
    // Prefer whichever side carried the extension's richer fields.
    shared: shared.map((url) => {
      const left = byUrlA.get(url)
      const right = byUrlB.get(url)
      return left?.platform ? left : right?.platform ? right : (left ?? right)!
    }),
    counts: { [actorA]: a.length, [actorB]: b.length }
  }
}
