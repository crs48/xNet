/**
 * Matchmaker orchestration (exploration 0174).
 *
 * Pure ranking over a candidate set the caller has gathered (friends-of-friends
 * locally + opt-in hub directory). Combines content similarity, reciprocal
 * scoring, graph proximity and an exploration bonus, scopes by `reach` and (for
 * in-person intents) geohash proximity, de-dupes across sources, MMR-diversifies
 * for serendipity, and attaches the "why you matched" evidence.
 */

import type { ConnectionIntentKind, IntentReach } from './constants'
import { coarsenGeohash, geohashProximity } from './geohash'
import { friendsOfFriends, shortestSocialPath } from './graph'
import {
  cosineSimilarity,
  decodeVector,
  explorationBonus,
  graphProximity,
  mmrRerank,
  reciprocalScore,
  scoreCandidate,
  type Adjacency,
  type MatchWeights
} from './matching'
import { mutualItems } from './psi'

export type CandidateProfile = {
  did: string
  /** Base64 affinity vector (as stored on ConnectableProfile). */
  affinityVector?: string
  /** Interest tag identifiers. */
  interests?: readonly string[]
  /** Coarse geohash cell, if the candidate shares one. */
  geohashCell?: string
  /** Where this candidate came from. */
  reach: IntentReach
  source: 'local' | 'hub'
  /** Optional count of prior observations, for the exploration bonus. */
  observations?: number
}

export type MatchmakerSelf = {
  did: string
  affinityVector?: string
  interests?: readonly string[]
  geohashCell?: string
}

export type MatchmakerInput = {
  me: MatchmakerSelf
  candidates: readonly CandidateProfile[]
  /** Undirected social adjacency (follows + roster + grants). */
  adjacency?: Adjacency
  intent: ConnectionIntentKind
  /** Maximum reach to include (`public` ⊇ `hub` ⊇ `friends-of-friends`). */
  reach?: IntentReach
  inPerson?: boolean
  /** Minimum geohash proximity for in-person intents (default 0.6 ≈ same coarse cell). */
  minProximity?: number
  weights?: MatchWeights
  lambda?: number
}

export type MatchResult = {
  did: string
  score: number
  source: 'local' | 'hub'
  why: {
    sharedInterests: string[]
    graphPath: string[] | null
    proximity: number | null
  }
}

const REACH_RANK: Record<IntentReach, number> = {
  'friends-of-friends': 0,
  hub: 1,
  public: 2
}

function reachAllowed(candidate: IntentReach, max: IntentReach): boolean {
  return REACH_RANK[candidate] <= REACH_RANK[max]
}

type ScoringContext = {
  meDid: string
  myVec: number[]
  myInterests: readonly string[]
  myGeohash?: string
  adjacency?: Adjacency
  maxReach: IntentReach
  inPerson: boolean
  minProximity: number
  weights?: MatchWeights
}

type ScoredEntry = { item: MatchResult; vector: number[] }

/** De-dupe candidates by DID, preferring a local candidate over a hub one. */
function dedupeCandidates(
  candidates: readonly CandidateProfile[],
  meDid: string
): CandidateProfile[] {
  const byDid = new Map<string, CandidateProfile>()
  for (const candidate of candidates) {
    if (candidate.did === meDid) continue
    const existing = byDid.get(candidate.did)
    if (!existing || (existing.source === 'hub' && candidate.source === 'local')) {
      byDid.set(candidate.did, candidate)
    }
  }
  return [...byDid.values()]
}

/** Apply reach + (for in-person intents) geohash proximity gating. */
function gateCandidate(
  candidate: CandidateProfile,
  ctx: ScoringContext
): { ok: boolean; proximity: number | null } {
  if (!reachAllowed(candidate.reach, ctx.maxReach)) return { ok: false, proximity: null }
  if (!ctx.inPerson) return { ok: true, proximity: null }
  if (!candidate.geohashCell || !ctx.myGeohash) return { ok: false, proximity: null }
  const proximity = geohashProximity(
    coarsenGeohash(ctx.myGeohash, 5),
    coarsenGeohash(candidate.geohashCell, 5)
  )
  return { ok: proximity >= ctx.minProximity, proximity }
}

/** Score one gated candidate and build its "why" evidence. */
function scoreOneCandidate(
  candidate: CandidateProfile,
  ctx: ScoringContext,
  proximity: number | null
): ScoredEntry {
  const theirVec = candidate.affinityVector ? decodeVector(candidate.affinityVector) : []
  const content = (cosineSimilarity(ctx.myVec, theirVec) + 1) / 2 // map [-1,1] → [0,1]
  const graph = ctx.adjacency ? graphProximity(ctx.adjacency, ctx.meDid, candidate.did) : 0
  const reciprocal = reciprocalScore(content, content) // symmetric proxy at cold-start
  const exploration = explorationBonus(candidate.observations ?? 0)
  const score = scoreCandidate({ content, reciprocal, graph, exploration }, ctx.weights)
  const sharedInterests = mutualItems(ctx.myInterests, candidate.interests ?? [])
  const graphPath = ctx.adjacency
    ? shortestSocialPath(ctx.adjacency, ctx.meDid, candidate.did)
    : null
  return {
    item: {
      did: candidate.did,
      score,
      source: candidate.source,
      why: { sharedInterests, graphPath, proximity }
    },
    vector: theirVec
  }
}

/** Rank and explain matches for an intent. Pure. */
export function rankMatches(input: MatchmakerInput): MatchResult[] {
  const ctx: ScoringContext = {
    meDid: input.me.did,
    myVec: input.me.affinityVector ? decodeVector(input.me.affinityVector) : [],
    myInterests: input.me.interests ?? [],
    myGeohash: input.me.geohashCell,
    adjacency: input.adjacency,
    maxReach: input.reach ?? 'public',
    inPerson: input.inPerson ?? false,
    minProximity: input.minProximity ?? 0.6,
    weights: input.weights
  }

  const scored = dedupeCandidates(input.candidates, ctx.meDid).flatMap((candidate) => {
    const gate = gateCandidate(candidate, ctx)
    return gate.ok ? [scoreOneCandidate(candidate, ctx, gate.proximity)] : []
  })

  // MMR diversity over candidate affinity vectors (serendipity / weak ties).
  const vectorByDid = new Map(scored.map((entry) => [entry.item.did, entry.vector]))
  const ranked = mmrRerank(
    scored.map((entry) => ({ item: entry.item, score: entry.item.score })),
    (a, b) =>
      (cosineSimilarity(vectorByDid.get(a.did) ?? [], vectorByDid.get(b.did) ?? []) + 1) / 2,
    input.lambda ?? 0.7
  )

  return ranked.map((entry) => entry.item)
}

/**
 * Build the local candidate set from the social graph: everyone exactly two hops
 * out, tagged as `friends-of-friends` reach and `local` source. The caller joins
 * these DIDs to their ConnectableProfiles before ranking.
 */
export function localCandidatesFromGraph(adjacency: Adjacency, me: string): string[] {
  return friendsOfFriends(adjacency, me).map((candidate) => candidate.did)
}
