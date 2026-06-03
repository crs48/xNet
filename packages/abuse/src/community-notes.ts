/**
 * Community note rating experiments with diversity-aware agreement.
 */

// ─── Types ─────────────────────────────────────────────────

export type CommunityNoteHelpfulness = 'helpful' | 'not-helpful' | 'needs-source' | 'irrelevant'

export type CommunityNoteRatingInput = {
  noteId?: string
  raterDID?: string
  helpfulness: CommunityNoteHelpfulness
  confidence: number
  sourceWeight?: number
  perspective?: string
  createdAt?: number
}

export type CommunityNoteAgreementStatus =
  | 'insufficient'
  | 'helpful'
  | 'not-helpful'
  | 'needs-more-diversity'
  | 'contested'

export type CommunityNoteAgreementOptions = {
  minRatings?: number
  minHelpfulRatings?: number
  minPerspectiveGroups?: number
  minDiversityScore?: number
  helpfulThreshold?: number
  notHelpfulThreshold?: number
  contestedThreshold?: number
}

export type CommunityNotePerspectiveSummary = {
  perspective: string
  ratingCount: number
  helpfulWeight: number
  notHelpfulWeight: number
  needsSourceWeight: number
  irrelevantWeight: number
}

export type CommunityNoteAgreementSummary = {
  status: CommunityNoteAgreementStatus
  ratingCount: number
  effectiveWeight: number
  helpfulScore: number
  notHelpfulScore: number
  needsSourceScore: number
  irrelevantScore: number
  diversityScore: number
  agreementScore: number
  supportingPerspectiveCount: number
  perspectiveCount: number
  perspectives: CommunityNotePerspectiveSummary[]
  reasons: string[]
}

// ─── Public API ────────────────────────────────────────────

export function summarizeCommunityNoteAgreement(
  ratings: readonly CommunityNoteRatingInput[],
  options: CommunityNoteAgreementOptions = {}
): CommunityNoteAgreementSummary {
  const normalized = ratings.map(normalizeRating)
  const perspectives = summarizePerspectives(normalized)
  const effectiveWeight = normalized.reduce((total, rating) => total + rating.weight, 0)
  const helpfulWeight = sumHelpfulness(normalized, 'helpful')
  const notHelpfulWeight =
    sumHelpfulness(normalized, 'not-helpful') + sumHelpfulness(normalized, 'irrelevant')
  const needsSourceWeight = sumHelpfulness(normalized, 'needs-source')
  const irrelevantWeight = sumHelpfulness(normalized, 'irrelevant')
  const helpfulScore = ratio(helpfulWeight, effectiveWeight)
  const notHelpfulScore = ratio(notHelpfulWeight, effectiveWeight)
  const needsSourceScore = ratio(needsSourceWeight, effectiveWeight)
  const irrelevantScore = ratio(irrelevantWeight, effectiveWeight)
  const supportingPerspectives = perspectives.filter(
    (perspective) =>
      perspective.helpfulWeight > 0 &&
      perspective.helpfulWeight >=
        perspective.notHelpfulWeight + perspective.needsSourceWeight + perspective.irrelevantWeight
  )
  const diversityScore = scorePerspectiveDiversity(
    supportingPerspectives.map((perspective) => perspective.helpfulWeight)
  )
  const agreementScore = helpfulScore * diversityScore
  const status = resolveCommunityNoteAgreementStatus({
    ratingCount: normalized.length,
    helpfulRatings: normalized.filter((rating) => rating.helpfulness === 'helpful').length,
    supportingPerspectiveCount: supportingPerspectives.length,
    helpfulScore,
    notHelpfulScore,
    diversityScore,
    options
  })

  return {
    status,
    ratingCount: normalized.length,
    effectiveWeight,
    helpfulScore,
    notHelpfulScore,
    needsSourceScore,
    irrelevantScore,
    diversityScore,
    agreementScore,
    supportingPerspectiveCount: supportingPerspectives.length,
    perspectiveCount: perspectives.length,
    perspectives,
    reasons: createCommunityNoteAgreementReasons(status, {
      ratingCount: normalized.length,
      helpfulRatings: normalized.filter((rating) => rating.helpfulness === 'helpful').length,
      supportingPerspectiveCount: supportingPerspectives.length,
      diversityScore,
      options
    })
  }
}

export function groupCommunityNoteRatingsByPerspective(
  ratings: readonly CommunityNoteRatingInput[]
): Map<string, CommunityNoteRatingInput[]> {
  return ratings.reduce((groups, rating) => {
    const perspective = normalizePerspective(rating)
    const existing = groups.get(perspective) ?? []
    groups.set(perspective, [...existing, rating])
    return groups
  }, new Map<string, CommunityNoteRatingInput[]>())
}

export function scoreCommunityNotePerspectiveDiversity(
  ratings: readonly CommunityNoteRatingInput[]
): number {
  return scorePerspectiveDiversity(
    summarizePerspectives(ratings.map(normalizeRating)).map(
      (perspective) => perspective.helpfulWeight
    )
  )
}

export function isCommunityNoteAgreementVisible(
  summary: Pick<CommunityNoteAgreementSummary, 'status'>
): boolean {
  return summary.status === 'helpful'
}

// ─── Helpers ───────────────────────────────────────────────

const DEFAULT_MIN_RATINGS = 5
const DEFAULT_MIN_HELPFUL_RATINGS = 3
const DEFAULT_MIN_PERSPECTIVE_GROUPS = 2
const DEFAULT_MIN_DIVERSITY_SCORE = 0.45
const DEFAULT_HELPFUL_THRESHOLD = 0.68
const DEFAULT_NOT_HELPFUL_THRESHOLD = 0.62
const DEFAULT_CONTESTED_THRESHOLD = 0.3

type NormalizedCommunityNoteRating = CommunityNoteRatingInput & {
  weight: number
  perspectiveKey: string
}

function normalizeRating(rating: CommunityNoteRatingInput): NormalizedCommunityNoteRating {
  return {
    ...rating,
    confidence: clamp(rating.confidence, 0, 1),
    sourceWeight: clamp(rating.sourceWeight ?? 1, 0.25, 4),
    weight: clamp(rating.confidence, 0, 1) * clamp(rating.sourceWeight ?? 1, 0.25, 4),
    perspectiveKey: normalizePerspective(rating)
  }
}

function summarizePerspectives(
  ratings: readonly NormalizedCommunityNoteRating[]
): CommunityNotePerspectiveSummary[] {
  return Array.from(
    ratings
      .reduce((groups, rating) => {
        const existing = groups.get(rating.perspectiveKey) ?? {
          perspective: rating.perspectiveKey,
          ratingCount: 0,
          helpfulWeight: 0,
          notHelpfulWeight: 0,
          needsSourceWeight: 0,
          irrelevantWeight: 0
        }
        groups.set(rating.perspectiveKey, addRatingToPerspective(existing, rating))
        return groups
      }, new Map<string, CommunityNotePerspectiveSummary>())
      .values()
  ).sort((left, right) => left.perspective.localeCompare(right.perspective))
}

function addRatingToPerspective(
  perspective: CommunityNotePerspectiveSummary,
  rating: NormalizedCommunityNoteRating
): CommunityNotePerspectiveSummary {
  return {
    ...perspective,
    ratingCount: perspective.ratingCount + 1,
    helpfulWeight:
      perspective.helpfulWeight + (rating.helpfulness === 'helpful' ? rating.weight : 0),
    notHelpfulWeight:
      perspective.notHelpfulWeight + (rating.helpfulness === 'not-helpful' ? rating.weight : 0),
    needsSourceWeight:
      perspective.needsSourceWeight + (rating.helpfulness === 'needs-source' ? rating.weight : 0),
    irrelevantWeight:
      perspective.irrelevantWeight + (rating.helpfulness === 'irrelevant' ? rating.weight : 0)
  }
}

function resolveCommunityNoteAgreementStatus(input: {
  ratingCount: number
  helpfulRatings: number
  supportingPerspectiveCount: number
  helpfulScore: number
  notHelpfulScore: number
  diversityScore: number
  options: CommunityNoteAgreementOptions
}): CommunityNoteAgreementStatus {
  const minRatings = input.options.minRatings ?? DEFAULT_MIN_RATINGS
  const minHelpfulRatings = input.options.minHelpfulRatings ?? DEFAULT_MIN_HELPFUL_RATINGS
  const minPerspectiveGroups = input.options.minPerspectiveGroups ?? DEFAULT_MIN_PERSPECTIVE_GROUPS
  const minDiversityScore = input.options.minDiversityScore ?? DEFAULT_MIN_DIVERSITY_SCORE
  const helpfulThreshold = input.options.helpfulThreshold ?? DEFAULT_HELPFUL_THRESHOLD
  const notHelpfulThreshold = input.options.notHelpfulThreshold ?? DEFAULT_NOT_HELPFUL_THRESHOLD
  const contestedThreshold = input.options.contestedThreshold ?? DEFAULT_CONTESTED_THRESHOLD

  if (input.ratingCount < minRatings) return 'insufficient'
  if (input.notHelpfulScore >= notHelpfulThreshold && input.helpfulScore < helpfulThreshold) {
    return 'not-helpful'
  }
  if (input.helpfulScore >= helpfulThreshold && input.notHelpfulScore >= contestedThreshold) {
    return 'contested'
  }
  if (input.helpfulScore < helpfulThreshold || input.helpfulRatings < minHelpfulRatings) {
    return 'insufficient'
  }
  if (
    input.supportingPerspectiveCount < minPerspectiveGroups ||
    input.diversityScore < minDiversityScore
  ) {
    return 'needs-more-diversity'
  }
  return 'helpful'
}

function createCommunityNoteAgreementReasons(
  status: CommunityNoteAgreementStatus,
  input: {
    ratingCount: number
    helpfulRatings: number
    supportingPerspectiveCount: number
    diversityScore: number
    options: CommunityNoteAgreementOptions
  }
): string[] {
  if (status === 'helpful') return ['diverse-helpful-agreement']
  if (status === 'not-helpful') return ['not-helpful-consensus']
  if (status === 'contested') return ['contested-ratings']
  if (status === 'needs-more-diversity') return ['helpful-but-not-diverse']

  return [
    input.ratingCount < (input.options.minRatings ?? DEFAULT_MIN_RATINGS)
      ? 'below-min-ratings'
      : null,
    input.helpfulRatings < (input.options.minHelpfulRatings ?? DEFAULT_MIN_HELPFUL_RATINGS)
      ? 'below-min-helpful-ratings'
      : null,
    input.supportingPerspectiveCount <
    (input.options.minPerspectiveGroups ?? DEFAULT_MIN_PERSPECTIVE_GROUPS)
      ? 'below-min-perspective-groups'
      : null,
    input.diversityScore < (input.options.minDiversityScore ?? DEFAULT_MIN_DIVERSITY_SCORE)
      ? 'below-min-diversity-score'
      : null
  ].filter((reason): reason is string => reason !== null)
}

function scorePerspectiveDiversity(weights: readonly number[]): number {
  const positiveWeights = weights.filter((weight) => weight > 0)
  const total = positiveWeights.reduce((sum, weight) => sum + weight, 0)
  if (positiveWeights.length <= 1 || total <= 0) return 0

  const entropy = positiveWeights.reduce((sum, weight) => {
    const probability = weight / total
    return sum - probability * Math.log2(probability)
  }, 0)
  return clamp(entropy / Math.log2(positiveWeights.length), 0, 1)
}

function sumHelpfulness(
  ratings: readonly NormalizedCommunityNoteRating[],
  helpfulness: CommunityNoteHelpfulness
): number {
  return ratings
    .filter((rating) => rating.helpfulness === helpfulness)
    .reduce((total, rating) => total + rating.weight, 0)
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return numerator / denominator
}

function normalizePerspective(
  rating: Pick<CommunityNoteRatingInput, 'perspective' | 'raterDID'>
): string {
  return (
    rating.perspective?.trim().toLowerCase().replace(/\s+/g, '-') || rating.raterDID || 'unknown'
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
