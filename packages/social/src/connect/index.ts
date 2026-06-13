/**
 * @xnetjs/social — people-matching layer (exploration 0174).
 *
 * One primitive (ConnectableProfile + ConnectionIntent) covers dating, friends,
 * collaborators, hiring, mentorship, and local meetups. Discovery is local-first
 * (friends-of-friends) with an opt-in federated hub directory; every contact is
 * gated behind a double-opt-in wave.
 */

export {
  CONNECT_INTENT_KIND_VALUES,
  CONNECT_NAMESPACE,
  connectionIntentKinds,
  intentReachOptions,
  waveStatuses,
  type ConnectionIntentKind,
  type IntentReach,
  type WaveStatus
} from './constants'

export {
  ConnectableProfileSchema,
  ConnectionIntentSchema,
  ConnectionWaveSchema,
  connectSchemas,
  type ConnectableProfile,
  type ConnectionIntent,
  type ConnectionWave
} from './schemas'

export {
  DEFAULT_MATCH_WEIGHTS,
  adamicAdar,
  buildAdjacency,
  commonNeighbors,
  cosineSimilarity,
  decodeVector,
  encodeVector,
  explorationBonus,
  graphProximity,
  jaccard,
  mmrRerank,
  reciprocalScore,
  scoreCandidate,
  type Adjacency,
  type CandidateSignals,
  type MatchWeights,
  type RankedCandidate
} from './matching'

export {
  friendsOfFriends,
  shortestSocialPath,
  type FriendOfFriend
} from './graph'

export {
  deriveAffinity,
  rankInterestTags,
  synthesizeInterestText,
  type AffinityDraft,
  type AffinityInput,
  type Embedder,
  type InterestTagRank
} from './affinity'

export {
  buildIntroCard,
  isMutualPair,
  waveCommitment,
  type IntroCard,
  type WaveInput,
  type WaveRecord
} from './wave'

export { mutualItems, psiEncode, psiHash, psiIntersect } from './psi'

export {
  localCandidatesFromGraph,
  rankMatches,
  type CandidateProfile,
  type MatchResult,
  type MatchmakerInput,
  type MatchmakerSelf
} from './matchmaker'

export {
  coarsenGeohash,
  decodeGeohash,
  encodeGeohash,
  geohashNeighbors,
  geohashProximity,
  kAnonymityCells,
  sharedPrefixLength,
  type GeohashBounds
} from './geohash'
