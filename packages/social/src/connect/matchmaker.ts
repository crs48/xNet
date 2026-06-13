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

/** Rank and explain matches for an intent. Pure. */
export function rankMatches(input: MatchmakerInput): MatchResult[] {
  const maxReach = input.reach ?? 'public'
  const minProximity = input.minProximity ?? 0.6
  const myVec = input.me.affinityVector ? decodeVector(input.me.affinityVector) : []
  const myInterests = input.me.interests ?? []

  // De-dupe by DID, preferring a local candidate over a hub one.
  const byDid = new Map<string, CandidateProfile>()
  for (const candidate of input.candidates) {
    if (candidate.did === input.me.did) continue
    const existing = byDid.get(candidate.did)
    if (!existing || (existing.source === 'hub' && candidate.source === 'local')) {
      byDid.set(candidate.did, candidate)
    }
  }

  const scored: { item: MatchResult; vector: number[] }[] = []

  for (const candidate of byDid.values()) {
    if (!reachAllowed(candidate.reach, maxReach)) continue

    let proximity: number | null = null
    if (input.inPerson) {
      if (!candidate.geohashCell || !input.me.geohashCell) continue
      proximity = geohashProximity(
        coarsenGeohash(input.me.geohashCell, 5),
        coarsenGeohash(candidate.geohashCell, 5)
      )
      if (proximity < minProximity) continue
    }

    const theirVec = candidate.affinityVector ? decodeVector(candidate.affinityVector) : []
    const content = (cosineSimilarity(myVec, theirVec) + 1) / 2 // map [-1,1] → [0,1]
    const graph = input.adjacency ? graphProximity(input.adjacency, input.me.did, candidate.did) : 0
    const reciprocal = reciprocalScore(content, content) // symmetric proxy at cold-start
    const exploration = explorationBonus(candidate.observations ?? 0)

    const score = scoreCandidate({ content, reciprocal, graph, exploration }, input.weights)
    const sharedInterests = mutualItems(myInterests, candidate.interests ?? [])
    const graphPath = input.adjacency
      ? shortestSocialPath(input.adjacency, input.me.did, candidate.did)
      : null

    scored.push({
      item: {
        did: candidate.did,
        score,
        source: candidate.source,
        why: { sharedInterests, graphPath, proximity }
      },
      vector: theirVec
    })
  }

  // MMR diversity over candidate affinity vectors (serendipity / weak ties).
  const vectorByDid = new Map(scored.map((entry) => [entry.item.did, entry.vector]))
  const ranked = mmrRerank(
    scored.map((entry) => ({ item: entry.item, score: entry.item.score })),
    (a, b) => {
      const va = vectorByDid.get(a.did) ?? []
      const vb = vectorByDid.get(b.did) ?? []
      return (cosineSimilarity(va, vb) + 1) / 2
    },
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
