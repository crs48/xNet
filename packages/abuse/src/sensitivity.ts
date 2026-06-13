/**
 * @xnetjs/abuse — NSFW / sensitive-content labeling and per-viewer filtering
 * (exploration 0175).
 *
 * Sensitivity is a PER-VIEWER concern, not a platform-hide concern: explicit
 * content is not hidden from everyone by default, it is each viewer's dial.
 * This module is therefore deliberately separate from `decideAbuse` (which
 * gates platform-level abuse like spam/malware). The render gate combines the
 * two by taking the STRICTER of the platform decision and the viewer's
 * sensitivity preference — see `resolveContentVisibility`.
 *
 * Label vocabulary is aligned to the ATProto/Bluesky moderation lexicon so a
 * label emitted by any interoperating labeler maps onto the same dial.
 */

import type { AbuseDecision, AbuseDecisionOverride, AbuseLabel, AbuseVisibility } from './types'

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const sensitivityLabels = [
  { id: 'sexual', name: 'Sexually suggestive', defaultVisibility: 'warn' },
  { id: 'nudity', name: 'Non-sexual nudity', defaultVisibility: 'show' },
  { id: 'porn', name: 'Explicit / pornographic', defaultVisibility: 'hide' },
  { id: 'graphic-media', name: 'Graphic / violent', defaultVisibility: 'warn' }
] as const

export type SensitivityLabelValue = (typeof sensitivityLabels)[number]['id']

export const SENSITIVITY_LABEL_VALUES: readonly SensitivityLabelValue[] = sensitivityLabels.map(
  (label) => label.id
)

const SENSITIVITY_LABEL_SET = new Set<string>(SENSITIVITY_LABEL_VALUES)

export function isSensitivityLabelValue(value: string): value is SensitivityLabelValue {
  return SENSITIVITY_LABEL_SET.has(value)
}

/**
 * Provenance of a sensitivity signal → weight. Research (0175): the author's
 * own declaration is the cheapest, highest-precision signal; community reports
 * are gameable; an untrusted labeler counts for little until trusted.
 */
export type SensitivitySource = 'self' | 'ml' | 'report' | 'labeler'

export const SENSITIVITY_SOURCE_WEIGHT: Readonly<Record<SensitivitySource, number>> = {
  self: 0.5,
  ml: 0.3,
  report: 0.15,
  labeler: 0.05
}

/** Minimum combined weighted confidence for a sensitivity value to count as present. */
export const SENSITIVITY_PRESENCE_FLOOR = 0.15

// ─── Preferences (the user's dial) ───────────────────────────────────────────

/** A per-label choice. `show` is "no filtering" for that label. */
export type SensitivityPreference = AbuseVisibility

export type UserSensitivityPreferences = {
  /**
   * Master adult-content switch. When off (the default), any present
   * `sexual`/`nudity`/`porn` label is hidden regardless of per-label settings —
   * matching Bluesky's age-gated model.
   */
  adultContentEnabled: boolean
  /** Whether the viewer has confirmed they are an adult. Required to enable adult content. */
  ageConfirmed: boolean
  /** Per-label visibility dial. Missing entries fall back to the vocabulary default. */
  labels: Partial<Record<SensitivityLabelValue, SensitivityPreference>>
  /**
   * Dating default (exploration 0174): blur unlabeled media from a non-mutual
   * sender even when no sensitivity label is present.
   */
  blurUnsolicitedMedia?: boolean
}

export const DEFAULT_SENSITIVITY_PREFERENCES: UserSensitivityPreferences = {
  adultContentEnabled: false,
  ageConfirmed: false,
  labels: {},
  blurUnsolicitedMedia: true
}

// ─── Label construction ──────────────────────────────────────────────────────

export type BuildSensitivityLabelInput = {
  value: SensitivityLabelValue
  source: SensitivitySource
  confidence: number
  sourceDID?: string
  id?: string
  expiresAt?: number
  evidenceRefs?: readonly string[]
}

/** Build an `AbuseLabel` for a sensitivity signal with the source-appropriate weight. */
export function buildSensitivityLabel(input: BuildSensitivityLabelInput): AbuseLabel {
  return {
    id: input.id,
    value: input.value,
    sourceDID: input.sourceDID,
    sourceWeight: SENSITIVITY_SOURCE_WEIGHT[input.source],
    confidence: clamp01(input.confidence),
    expiresAt: input.expiresAt,
    evidenceRefs: input.evidenceRefs
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export type SensitivityAssessment = {
  /** Sensitivity values judged present, with their combined weighted confidence. */
  present: ReadonlyMap<SensitivityLabelValue, number>
  /** Convenience: present values as an array. */
  values: readonly SensitivityLabelValue[]
}

/** Drop expired labels and any label negated by an active `negates` reference. */
function activeSensitivityLabels(labels: readonly AbuseLabel[], now: number): readonly AbuseLabel[] {
  const active = labels.filter(
    (label) =>
      isSensitivityLabelValue(label.value) &&
      (label.expiresAt === undefined || label.expiresAt > now)
  )
  const negated = new Set(
    labels.flatMap((label) => (label.negates !== undefined ? [label.negates] : []))
  )
  return active.filter((label) => label.id === undefined || !negated.has(label.id))
}

/**
 * Combine the sensitivity labels on a piece of content into the set of values
 * that count as present. A value is present when the sum of
 * `confidence × sourceWeight` across its active labels clears the presence floor.
 */
export function assessSensitivity(
  labels: readonly AbuseLabel[],
  options: { now?: number; presenceFloor?: number } = {}
): SensitivityAssessment {
  const now = options.now ?? Date.now()
  const floor = options.presenceFloor ?? SENSITIVITY_PRESENCE_FLOOR
  const scores = new Map<SensitivityLabelValue, number>()

  for (const label of activeSensitivityLabels(labels, now)) {
    const value = label.value as SensitivityLabelValue
    scores.set(value, (scores.get(value) ?? 0) + label.confidence * label.sourceWeight)
  }

  const present = new Map<SensitivityLabelValue, number>()
  for (const [value, score] of scores) {
    if (score >= floor) {
      present.set(value, score)
    }
  }

  return { present, values: [...present.keys()] }
}

// ─── Visibility resolution (the dial) ────────────────────────────────────────

const VISIBILITY_RANK: Readonly<Record<AbuseVisibility, number>> = {
  show: 0,
  warn: 1,
  blur: 2,
  hide: 3
}

/** Return whichever visibility is stricter (hide > blur > warn > show). */
export function strictestVisibility(a: AbuseVisibility, b: AbuseVisibility): AbuseVisibility {
  return VISIBILITY_RANK[a] >= VISIBILITY_RANK[b] ? a : b
}

const ADULT_LABELS = new Set<SensitivityLabelValue>(['sexual', 'nudity', 'porn'])

function defaultVisibilityFor(value: SensitivityLabelValue): AbuseVisibility {
  return sensitivityLabels.find((label) => label.id === value)!.defaultVisibility
}

export type SensitivityVisibilityOptions = {
  now?: number
  presenceFloor?: number
  /** Dating signal: the content carries media from a non-mutual sender. */
  unsolicitedMedia?: boolean
}

/**
 * Resolve how a single piece of content should appear FOR THIS VIEWER given its
 * sensitivity labels and the viewer's preferences. Pure; no platform-abuse
 * logic (combine with `decideAbuse` via `resolveContentVisibility`).
 */
export function decideSensitivityVisibility(
  labels: readonly AbuseLabel[],
  preferences: UserSensitivityPreferences = DEFAULT_SENSITIVITY_PREFERENCES,
  options: SensitivityVisibilityOptions = {}
): AbuseVisibility {
  const assessment = assessSensitivity(labels, options)
  const adultEnabled = preferences.adultContentEnabled && preferences.ageConfirmed

  let visibility: AbuseVisibility = 'show'

  for (const value of assessment.values) {
    if (!adultEnabled && ADULT_LABELS.has(value)) {
      // Adult content disabled → hide all adult labels outright.
      visibility = strictestVisibility(visibility, 'hide')
      continue
    }
    const pref = preferences.labels[value] ?? defaultVisibilityFor(value)
    visibility = strictestVisibility(visibility, pref)
  }

  if (
    visibility === 'show' &&
    options.unsolicitedMedia === true &&
    (preferences.blurUnsolicitedMedia ?? true)
  ) {
    return 'blur'
  }

  return visibility
}

/**
 * Express the viewer's sensitivity dial as an `AbuseDecisionOverride` so callers
 * can feed it through the existing `decideAbuse` pipeline. Only ever tightens
 * visibility (scope `'user'`), never loosens a platform decision.
 */
export function sensitivityOverride(
  labels: readonly AbuseLabel[],
  preferences: UserSensitivityPreferences = DEFAULT_SENSITIVITY_PREFERENCES,
  options: SensitivityVisibilityOptions = {}
): AbuseDecisionOverride | undefined {
  const visibility = decideSensitivityVisibility(labels, preferences, options)
  if (visibility === 'show') {
    return undefined
  }
  return { scope: 'user', visibility, reason: 'sensitivity-preference' }
}

/**
 * The render-gate primitive: combine a platform `decideAbuse` decision with the
 * viewer's sensitivity dial, returning the stricter visibility. A platform
 * `hide` always wins; otherwise the viewer's NSFW preference can only tighten.
 */
export function resolveContentVisibility(
  decision: Pick<AbuseDecision, 'visibility'>,
  labels: readonly AbuseLabel[],
  preferences: UserSensitivityPreferences = DEFAULT_SENSITIVITY_PREFERENCES,
  options: SensitivityVisibilityOptions = {}
): AbuseVisibility {
  const sensitivity = decideSensitivityVisibility(labels, preferences, options)
  return strictestVisibility(decision.visibility, sensitivity)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
