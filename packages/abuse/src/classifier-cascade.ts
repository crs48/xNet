/**
 * Local-first moderation classifier cascade.
 */

import type {
  CloudClassificationOptions,
  CloudClassificationResult,
  CloudClassificationSkipReason,
  CloudClassifierAdapter,
  CloudClassifierBudgetPolicy,
  CloudClassifierPrivacyPolicy
} from './cloud-classifier'
import type {
  LocalClassificationResult,
  LocalClassifierAdapter,
  LocalClassifierInput,
  LocalClassifierOptions
} from './local-classifier'
import type { AbuseLabel, AbuseQualitySignals, AbuseSurface } from './types'
import { classifyWithCloudAdapter } from './cloud-classifier'
import { classifyWithLocalAdapters } from './local-classifier'

// ─── Types ─────────────────────────────────────────────────

export type CloudReviewSkipReason =
  | CloudClassificationSkipReason
  | 'cloud-not-configured'
  | 'low-risk-local-signals'

export type CloudReviewCallReason = 'local-label-risk' | 'local-quality-risk' | 'no-local-signals'

export type CloudReviewCallPolicy = {
  enabled?: boolean
  allowedSurfaces?: readonly AbuseSurface[]
  minLocalLabelConfidence?: number
  minLocalQualityRisk?: number
  forceWhenNoLocalSignals?: boolean
}

export type ModerationCascadeCloudConfig = {
  adapter: CloudClassifierAdapter
  privacy: CloudClassifierPrivacyPolicy
  budget: CloudClassifierBudgetPolicy
  callPolicy?: CloudReviewCallPolicy
  options?: CloudClassificationOptions
}

export type ModerationCascadeOptions = {
  localAdapters?: readonly LocalClassifierAdapter[]
  localOptions?: LocalClassifierOptions
  cloud?: ModerationCascadeCloudConfig
}

export type CloudReviewRouteDecision =
  | {
      callCloud: true
      reasons: readonly CloudReviewCallReason[]
      skipped: null
    }
  | {
      callCloud: false
      reasons: readonly CloudReviewCallReason[]
      skipped: CloudReviewSkipReason
    }

export type ModerationCascadeResult = {
  labels: AbuseLabel[]
  quality: Partial<AbuseQualitySignals>
  local: LocalClassificationResult
  cloud?: CloudClassificationResult
  cloudCalled: boolean
  cloudReasons: readonly CloudReviewCallReason[]
  cloudSkippedReason: CloudReviewSkipReason | null
  errors: readonly string[]
}

// ─── Public API ────────────────────────────────────────────

export async function classifyWithModerationCascade(
  input: LocalClassifierInput,
  options: ModerationCascadeOptions = {}
): Promise<ModerationCascadeResult> {
  const local = await classifyWithLocalAdapters(
    input,
    options.localAdapters ?? [],
    options.localOptions
  )
  const route = decideCloudReviewRoute(input, local, options.cloud?.callPolicy)

  if (!options.cloud) {
    return createCascadeResult(local, undefined, {
      callCloud: false,
      reasons: route.reasons,
      skipped: 'cloud-not-configured'
    })
  }

  if (!route.callCloud) {
    return createCascadeResult(local, undefined, route)
  }

  const cloud = await classifyWithCloudAdapter(
    input,
    options.cloud.adapter,
    options.cloud.privacy,
    options.cloud.budget,
    options.cloud.options
  )

  return createCascadeResult(local, cloud, route)
}

export function decideCloudReviewRoute(
  input: LocalClassifierInput,
  local: LocalClassificationResult,
  policy: CloudReviewCallPolicy = {}
): CloudReviewRouteDecision {
  if (policy.enabled === false) {
    return { callCloud: false, reasons: [], skipped: 'cloud-disabled' }
  }

  if (policy.allowedSurfaces && !policy.allowedSurfaces.includes(input.surface)) {
    return { callCloud: false, reasons: [], skipped: 'unsupported-surface' }
  }

  const labelRisk = maxLocalLabelConfidence(local)
  const qualityRisk = localQualityRisk(local.quality)
  const minLabelRisk = policy.minLocalLabelConfidence ?? 0.85
  const minQualityRisk = policy.minLocalQualityRisk ?? 0.65
  const reasons = [
    labelRisk >= minLabelRisk ? 'local-label-risk' : null,
    qualityRisk >= minQualityRisk ? 'local-quality-risk' : null,
    policy.forceWhenNoLocalSignals === true && hasNoLocalSignals(local) ? 'no-local-signals' : null
  ].filter((reason): reason is CloudReviewCallReason => reason !== null)

  if (reasons.length > 0) {
    return { callCloud: true, reasons, skipped: null }
  }

  return { callCloud: false, reasons: [], skipped: 'low-risk-local-signals' }
}

// ─── Helpers ───────────────────────────────────────────────

function createCascadeResult(
  local: LocalClassificationResult,
  cloud: CloudClassificationResult | undefined,
  route: CloudReviewRouteDecision
): ModerationCascadeResult {
  return {
    labels: mergeLabels([...(local.labels ?? []), ...(cloud?.labels ?? [])]),
    quality: mergeQuality(local.quality, cloud?.quality ?? {}),
    local,
    cloud,
    cloudCalled: cloud !== undefined,
    cloudReasons: route.reasons,
    cloudSkippedReason: cloud?.skipped ?? route.skipped,
    errors: [...local.errors, ...(cloud?.errors ?? [])]
  }
}

function maxLocalLabelConfidence(local: LocalClassificationResult): number {
  return local.labels.reduce((confidence, label) => Math.max(confidence, label.confidence), 0)
}

function localQualityRisk(quality: Partial<AbuseQualitySignals>): number {
  return Math.max(
    quality.duplicateScore ?? 0,
    quality.slopScore ?? 0,
    quality.citationCoverage === undefined ? 0 : 1 - quality.citationCoverage,
    quality.provenanceScore === undefined ? 0 : 1 - quality.provenanceScore
  )
}

function hasNoLocalSignals(local: LocalClassificationResult): boolean {
  return (
    local.labels.length === 0 &&
    local.signals.length === 0 &&
    Object.keys(local.quality).length === 0
  )
}

function mergeLabels(labels: readonly AbuseLabel[]): AbuseLabel[] {
  const merged = new Map<string, AbuseLabel>()
  for (const label of labels) {
    const key = `${label.value}:${label.sourceDID ?? label.evidenceRefs?.join('|') ?? 'unknown'}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...label, evidenceRefs: [...(label.evidenceRefs ?? [])] })
      continue
    }

    merged.set(key, {
      ...existing,
      confidence: Math.max(existing.confidence, label.confidence),
      sourceWeight: Math.max(existing.sourceWeight, label.sourceWeight),
      expiresAt: minDefined(existing.expiresAt, label.expiresAt),
      evidenceRefs: Array.from(
        new Set([...(existing.evidenceRefs ?? []), ...(label.evidenceRefs ?? [])])
      )
    })
  }

  return Array.from(merged.values())
}

function mergeQuality(
  local: Partial<AbuseQualitySignals>,
  cloud: Partial<AbuseQualitySignals>
): Partial<AbuseQualitySignals> {
  return {
    duplicateScore: maxDefined(local.duplicateScore, cloud.duplicateScore),
    slopScore: maxDefined(local.slopScore, cloud.slopScore),
    citationCoverage: minDefined(local.citationCoverage, cloud.citationCoverage),
    provenanceScore: minDefined(local.provenanceScore, cloud.provenanceScore)
  }
}

function maxDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}

function minDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.min(left, right)
}
