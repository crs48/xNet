/**
 * Search moderation scoring from labels and quality signals.
 */

import { clamp } from '@xnetjs/core'

export type SearchModerationLabel = {
  value: string
  confidence: number
  sourceWeight?: number
  expiresAt?: number
}

export type SearchQualitySignal = {
  signal: string
  score: number
  confidence: number
  expiresAt?: number
}

export type SearchModerationSignals = {
  labels?: readonly SearchModerationLabel[]
  qualitySignals?: readonly SearchQualitySignal[]
}

export type SearchModerationPolicy = {
  hiddenLabels?: readonly string[]
  demotedLabels?: readonly string[]
  hideConfidenceThreshold?: number
  demoteConfidenceThreshold?: number
  includeHidden?: boolean
  /**
   * Sensitivity label values the viewer has chosen to hide from search (derived
   * from their content dial, exploration 0175/0177). Unlike abuse labels, these
   * are a per-viewer preference, so the caller passes them per query. A result
   * carrying a present (weighted) sensitivity label in this set is excluded.
   */
  sensitivityHiddenLabels?: readonly string[]
  /** Minimum weighted confidence for a sensitivity label to count as present. */
  sensitivityPresenceFloor?: number
  now?: number
}

export type SearchModerationSummary = {
  includeInSearch: boolean
  scoreMultiplier: number
  reasons: string[]
  activeLabels: SearchModerationLabel[]
  activeQualitySignals: SearchQualitySignal[]
}

const DEFAULT_HIDDEN_LABELS = ['spam', 'scam', 'malware', 'impersonation', 'harassment'] as const

const DEFAULT_DEMOTED_LABELS = ['slop', 'inaccurate', 'unsupported', 'stale', 'synthetic'] as const

const RISK_QUALITY_SIGNALS = new Set(['duplicate', 'slop', 'claim-mismatch'])
const SUPPORT_QUALITY_SIGNALS = new Set(['citation-coverage', 'provenance', 'freshness'])

export function summarizeSearchModeration(
  signals: SearchModerationSignals | undefined,
  policy: SearchModerationPolicy = {}
): SearchModerationSummary {
  const now = policy.now ?? Date.now()
  const labels = (signals?.labels ?? []).filter((label) => isActive(label, now))
  const qualitySignals = (signals?.qualitySignals ?? []).filter((signal) => isActive(signal, now))
  const safeConfidence = maxLabelConfidence(labels, 'safe')
  const hiddenLabels = new Set(policy.hiddenLabels ?? DEFAULT_HIDDEN_LABELS)
  const demotedLabels = new Set(policy.demotedLabels ?? DEFAULT_DEMOTED_LABELS)
  const hideThreshold = policy.hideConfidenceThreshold ?? 0.85
  const demoteThreshold = policy.demoteConfidenceThreshold ?? 0.65

  const hiddenReasons = labels
    .filter((label) => hiddenLabels.has(label.value))
    .filter((label) => label.confidence >= hideThreshold && label.confidence > safeConfidence)
    .map((label) => `label:${label.value}`)

  // Per-viewer sensitivity hiding: a present sensitivity label (weighted
  // confidence over the floor, not negated by a `safe` label) hides the result.
  const sensitivityHidden = new Set(policy.sensitivityHiddenLabels ?? [])
  const sensitivityFloor = policy.sensitivityPresenceFloor ?? 0.15
  const sensitivityReasons =
    sensitivityHidden.size === 0
      ? []
      : labels
          .filter((label) => sensitivityHidden.has(label.value))
          .filter(
            (label) =>
              label.confidence * Math.max(0, label.sourceWeight ?? 1) >= sensitivityFloor &&
              label.confidence > safeConfidence
          )
          .map((label) => `sensitivity:${label.value}`)

  const labelPenalty = labels
    .filter((label) => demotedLabels.has(label.value))
    .filter((label) => label.confidence >= demoteThreshold && label.confidence > safeConfidence)
    .reduce((penalty, label) => {
      const sourceWeight = Math.max(0.25, Math.min(label.sourceWeight ?? 1, 4))
      return penalty + Math.min(0.35, label.confidence * sourceWeight * 0.12)
    }, 0)

  const qualityPenalty = qualitySignals.reduce((penalty, signal) => {
    if (RISK_QUALITY_SIGNALS.has(signal.signal)) {
      return penalty + signal.score * signal.confidence * 0.45
    }

    if (SUPPORT_QUALITY_SIGNALS.has(signal.signal)) {
      return penalty + (1 - signal.score) * signal.confidence * 0.35
    }

    return penalty
  }, 0)

  const scoreMultiplier = clamp(1 - labelPenalty - qualityPenalty, 0.15, 1)
  const qualityReasons = qualitySignals
    .filter((signal) => signal.confidence >= 0.5)
    .filter((signal) => {
      if (RISK_QUALITY_SIGNALS.has(signal.signal)) return signal.score >= 0.5
      if (SUPPORT_QUALITY_SIGNALS.has(signal.signal)) return signal.score <= 0.5
      return false
    })
    .map((signal) => `quality:${signal.signal}`)

  const allHiddenReasons = [...hiddenReasons, ...sensitivityReasons]

  return {
    includeInSearch: allHiddenReasons.length === 0 || (policy.includeHidden ?? false),
    scoreMultiplier,
    reasons: [...allHiddenReasons, ...qualityReasons],
    activeLabels: labels,
    activeQualitySignals: qualitySignals
  }
}

function isActive(item: { expiresAt?: number }, now: number): boolean {
  return item.expiresAt === undefined || item.expiresAt > now
}

function maxLabelConfidence(labels: readonly SearchModerationLabel[], value: string): number {
  return labels
    .filter((label) => label.value === value)
    .reduce((confidence, label) => Math.max(confidence, label.confidence), 0)
}
