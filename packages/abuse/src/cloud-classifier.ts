/**
 * Budgeted cloud classifier adapters for optional moderation review.
 */

import type { ContentFingerprint } from './content-fingerprint'
import type { AbuseLabel, AbuseQualitySignals, AbuseSurface } from './types'

// ─── Types ─────────────────────────────────────────────────

export type CloudPrivacyMode = 'disabled' | 'metadata-only' | 'redacted-content' | 'raw-content'

export type CloudClassificationSkipReason =
  | 'cloud-disabled'
  | 'unsupported-surface'
  | 'provider-not-allowed'
  | 'privacy-policy-blocked'
  | 'over-budget'

export type CloudClassifierInput = {
  surface: AbuseSurface
  subjectId?: string
  title?: string
  body: string
  language?: string
  metadata?: Record<string, unknown>
  contentFingerprint?: ContentFingerprint
}

export type CloudClassifierPrivacyPolicy = {
  mode: CloudPrivacyMode
  allowedProviders?: readonly string[]
  allowedSurfaces?: readonly AbuseSurface[]
  sendSubjectId?: boolean
  sendMetadata?: boolean
  sendContentFingerprint?: boolean
  maxInputChars?: number
  redactPatterns?: readonly RegExp[]
  redactionReplacement?: string
  requireExplicitRawContentApproval?: boolean
  rawContentApproved?: boolean
}

export type CloudClassifierBudgetPolicy = {
  remainingMicroUsd: number
  maxPerRequestMicroUsd: number
  minRemainingMicroUsd?: number
}

export type CloudClassifierRequest = {
  provider: string
  model: string
  adapterId: string
  adapterVersion: string
  surface: AbuseSurface
  subjectId?: string
  title?: string
  body?: string
  language?: string
  metadata?: Record<string, unknown>
  contentFingerprint?: ContentFingerprint
  privacyMode: Exclude<CloudPrivacyMode, 'disabled'>
  estimatedCostMicroUsd: number
}

export type CloudClassifierProvenance = {
  provider: 'cloud'
  cloudProvider: string
  adapterId: string
  adapterVersion: string
  model: string
  policyId?: string
  privacyMode: Exclude<CloudPrivacyMode, 'disabled'>
}

export type CloudClassifierSignal = {
  kind: 'label' | 'quality'
  value: string
  confidence: number
  reason?: string
  evidenceRefs: string[]
  provenance: CloudClassifierProvenance
}

export type CloudClassifierProviderSignal = Omit<CloudClassifierSignal, 'provenance'> & {
  evidenceRefs?: readonly string[]
}

export type CloudClassifierProviderResult = {
  labels?: readonly AbuseLabel[]
  quality?: Partial<AbuseQualitySignals>
  signals?: readonly CloudClassifierProviderSignal[]
  chargedCostMicroUsd?: number
  errors?: readonly string[]
}

export type CloudClassificationUsage = {
  estimatedCostMicroUsd: number
  chargedCostMicroUsd: number
  remainingBudgetMicroUsd: number
  privacyMode: CloudPrivacyMode
  sentBodyChars: number
}

export type CloudClassificationResult = {
  labels: AbuseLabel[]
  quality: Partial<AbuseQualitySignals>
  signals: CloudClassifierSignal[]
  provenance: CloudClassifierProvenance
  usage: CloudClassificationUsage
  skipped: CloudClassificationSkipReason | null
  elapsedMs?: number
  errors: string[]
}

export type CloudClassifierAdapter = {
  id: string
  version: string
  provider: string
  model: string
  policyId?: string
  defaultEstimatedCostMicroUsd: number
  supports?: (input: CloudClassifierInput) => boolean
  estimateCostMicroUsd?: (request: Omit<CloudClassifierRequest, 'estimatedCostMicroUsd'>) => number
  classify: (
    request: CloudClassifierRequest
  ) => CloudClassifierProviderResult | Promise<CloudClassifierProviderResult>
}

export type CloudClassificationOptions = {
  now?: number
}

// ─── Public API ────────────────────────────────────────────

export async function classifyWithCloudAdapter(
  input: CloudClassifierInput,
  adapter: CloudClassifierAdapter,
  privacy: CloudClassifierPrivacyPolicy,
  budget: CloudClassifierBudgetPolicy,
  _options: CloudClassificationOptions = {}
): Promise<CloudClassificationResult> {
  const skipped = getCloudClassificationSkipReason(input, adapter, privacy, budget)
  if (skipped) {
    if (skipped !== 'over-budget') {
      return createSkippedCloudClassificationResult(input, adapter, privacy, budget, skipped)
    }

    const requestBase = createCloudClassifierRequestBase(input, adapter, privacy)
    return createSkippedCloudClassificationResult(input, adapter, privacy, budget, skipped, {
      estimatedCostMicroUsd: estimateCloudClassifierCost(adapter, requestBase),
      sentBodyChars: requestBase.body?.length ?? 0
    })
  }

  const requestBase = createCloudClassifierRequestBase(input, adapter, privacy)
  const estimatedCostMicroUsd = estimateCloudClassifierCost(adapter, requestBase)
  const budgetSkipReason = getBudgetSkipReason(estimatedCostMicroUsd, budget)
  if (budgetSkipReason) {
    return createSkippedCloudClassificationResult(
      input,
      adapter,
      privacy,
      budget,
      budgetSkipReason,
      {
        estimatedCostMicroUsd,
        sentBodyChars: requestBase.body?.length ?? 0
      }
    )
  }

  const request: CloudClassifierRequest = {
    ...requestBase,
    estimatedCostMicroUsd
  }
  const startedAt = Date.now()

  try {
    const result = await adapter.classify(request)
    const chargedCostMicroUsd = result.chargedCostMicroUsd ?? estimatedCostMicroUsd
    const provenance = createCloudClassifierProvenance(adapter, request.privacyMode)

    return {
      labels: result.labels ? result.labels.map(copyLabel) : [],
      quality: result.quality ?? {},
      signals: normalizeCloudClassifierSignals(result.signals ?? [], provenance),
      provenance,
      usage: {
        estimatedCostMicroUsd,
        chargedCostMicroUsd,
        remainingBudgetMicroUsd: Math.max(0, budget.remainingMicroUsd - chargedCostMicroUsd),
        privacyMode: request.privacyMode,
        sentBodyChars: request.body?.length ?? 0
      },
      skipped: null,
      elapsedMs: Date.now() - startedAt,
      errors: [...(result.errors ?? [])]
    }
  } catch (error) {
    const provenance = createCloudClassifierProvenance(adapter, request.privacyMode)
    return {
      labels: [],
      quality: {},
      signals: [],
      provenance,
      usage: {
        estimatedCostMicroUsd,
        chargedCostMicroUsd: 0,
        remainingBudgetMicroUsd: budget.remainingMicroUsd,
        privacyMode: request.privacyMode,
        sentBodyChars: request.body?.length ?? 0
      },
      skipped: null,
      elapsedMs: Date.now() - startedAt,
      errors: [error instanceof Error ? error.message : String(error)]
    }
  }
}

export function createCloudClassifierAdapter(
  adapter: CloudClassifierAdapter
): CloudClassifierAdapter {
  return adapter
}

export function createCloudClassifierRequestBase(
  input: CloudClassifierInput,
  adapter: CloudClassifierAdapter,
  privacy: CloudClassifierPrivacyPolicy
): Omit<CloudClassifierRequest, 'estimatedCostMicroUsd'> {
  const privacyMode = assertEnabledPrivacyMode(privacy.mode)
  const body = prepareCloudBody(input.body, privacy)
  const title = input.title ? prepareCloudBody(input.title, privacy) : undefined

  return {
    provider: adapter.provider,
    model: adapter.model,
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    surface: input.surface,
    subjectId: privacy.sendSubjectId ? input.subjectId : undefined,
    title: privacyMode === 'metadata-only' ? undefined : title,
    body: privacyMode === 'metadata-only' ? undefined : body,
    language: input.language,
    metadata: privacy.sendMetadata ? input.metadata : undefined,
    contentFingerprint: privacy.sendContentFingerprint ? input.contentFingerprint : undefined,
    privacyMode
  }
}

export function estimateCloudClassifierCost(
  adapter: CloudClassifierAdapter,
  request: Omit<CloudClassifierRequest, 'estimatedCostMicroUsd'>
): number {
  return Math.max(
    0,
    Math.ceil(adapter.estimateCostMicroUsd?.(request) ?? adapter.defaultEstimatedCostMicroUsd)
  )
}

export function getCloudClassificationSkipReason(
  input: CloudClassifierInput,
  adapter: CloudClassifierAdapter,
  privacy: CloudClassifierPrivacyPolicy,
  budget: CloudClassifierBudgetPolicy
): CloudClassificationSkipReason | null {
  if (privacy.mode === 'disabled') return 'cloud-disabled'
  if (!(adapter.supports?.(input) ?? true)) return 'unsupported-surface'
  if (privacy.allowedSurfaces && !privacy.allowedSurfaces.includes(input.surface)) {
    return 'unsupported-surface'
  }
  if (privacy.allowedProviders && !privacy.allowedProviders.includes(adapter.provider)) {
    return 'provider-not-allowed'
  }
  if (
    privacy.mode === 'raw-content' &&
    privacy.requireExplicitRawContentApproval !== false &&
    !privacy.rawContentApproved
  ) {
    return 'privacy-policy-blocked'
  }

  const requestBase = createCloudClassifierRequestBase(input, adapter, privacy)
  return getBudgetSkipReason(estimateCloudClassifierCost(adapter, requestBase), budget)
}

export function redactCloudClassifierText(
  text: string,
  patterns: readonly RegExp[] = defaultCloudRedactionPatterns,
  replacement = '[redacted]'
): string {
  return patterns.reduce((redacted, pattern) => redacted.replace(pattern, replacement), text)
}

// ─── Helpers ───────────────────────────────────────────────

const defaultCloudRedactionPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
  /\bhttps?:\/\/[^\s]+/gi
] as const

function getBudgetSkipReason(
  estimatedCostMicroUsd: number,
  budget: CloudClassifierBudgetPolicy
): CloudClassificationSkipReason | null {
  const minRemaining = budget.minRemainingMicroUsd ?? 0
  if (estimatedCostMicroUsd > budget.maxPerRequestMicroUsd) return 'over-budget'
  if (budget.remainingMicroUsd - estimatedCostMicroUsd < minRemaining) return 'over-budget'
  return null
}

function createSkippedCloudClassificationResult(
  input: CloudClassifierInput,
  adapter: CloudClassifierAdapter,
  privacy: CloudClassifierPrivacyPolicy,
  budget: CloudClassifierBudgetPolicy,
  skipped: CloudClassificationSkipReason,
  usage?: Partial<Pick<CloudClassificationUsage, 'estimatedCostMicroUsd' | 'sentBodyChars'>>
): CloudClassificationResult {
  const privacyMode = privacy.mode === 'disabled' ? 'metadata-only' : privacy.mode
  return {
    labels: [],
    quality: {},
    signals: [],
    provenance: createCloudClassifierProvenance(adapter, privacyMode),
    usage: {
      estimatedCostMicroUsd: usage?.estimatedCostMicroUsd ?? 0,
      chargedCostMicroUsd: 0,
      remainingBudgetMicroUsd: budget.remainingMicroUsd,
      privacyMode: privacy.mode,
      sentBodyChars:
        usage?.sentBodyChars ?? (privacy.mode === 'raw-content' ? input.body.length : 0)
    },
    skipped,
    errors: []
  }
}

function createCloudClassifierProvenance(
  adapter: CloudClassifierAdapter,
  privacyMode: Exclude<CloudPrivacyMode, 'disabled'>
): CloudClassifierProvenance {
  return {
    provider: 'cloud',
    cloudProvider: adapter.provider,
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    model: adapter.model,
    policyId: adapter.policyId,
    privacyMode
  }
}

function normalizeCloudClassifierSignals(
  signals: readonly CloudClassifierProviderSignal[],
  provenance: CloudClassifierProvenance
): CloudClassifierSignal[] {
  return signals.map((signal) => ({
    kind: signal.kind,
    value: signal.value,
    confidence: signal.confidence,
    reason: signal.reason,
    evidenceRefs: [...(signal.evidenceRefs ?? [])],
    provenance
  }))
}

function prepareCloudBody(body: string, privacy: CloudClassifierPrivacyPolicy): string {
  const bounded = privacy.maxInputChars ? body.slice(0, privacy.maxInputChars) : body
  if (privacy.mode !== 'redacted-content') return bounded
  return redactCloudClassifierText(
    bounded,
    privacy.redactPatterns ?? defaultCloudRedactionPatterns,
    privacy.redactionReplacement
  )
}

function assertEnabledPrivacyMode(mode: CloudPrivacyMode): Exclude<CloudPrivacyMode, 'disabled'> {
  if (mode === 'disabled') return 'metadata-only'
  return mode
}

function copyLabel(label: AbuseLabel): AbuseLabel {
  return {
    ...label,
    evidenceRefs: label.evidenceRefs ? [...label.evidenceRefs] : undefined
  }
}
