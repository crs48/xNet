/**
 * Local classifier adapter interfaces for moderation and quality signals.
 */

import type { ContentFingerprint } from './content-fingerprint'
import type { AbuseLabel, AbuseQualitySignals, AbuseSurface } from './types'
import { canonicalizeContentText } from './content-fingerprint'

// ─── Types ─────────────────────────────────────────────────

export type LocalClassifierInput = {
  surface: AbuseSurface
  subjectId?: string
  title?: string
  body: string
  language?: string
  metadata?: Record<string, unknown>
  contentFingerprint?: ContentFingerprint
}

export type LocalClassifierOptions = {
  now?: number
  maxInputChars?: number
  minConfidence?: number
}

export type LocalClassifierProvenance = {
  provider: 'local'
  adapterId: string
  adapterVersion: string
  model?: string
  policyId?: string
}

export type LocalClassifierSignal = {
  kind: 'label' | 'quality'
  value: string
  confidence: number
  reason?: string
  evidenceRefs: string[]
  provenance: LocalClassifierProvenance
}

export type LocalClassificationResult = {
  labels: AbuseLabel[]
  quality: Partial<AbuseQualitySignals>
  signals: LocalClassifierSignal[]
  provenance: LocalClassifierProvenance
  elapsedMs?: number
  errors: string[]
}

export type LocalClassifierAdapter = {
  id: string
  version: string
  model?: string
  supports?: (input: LocalClassifierInput) => boolean
  classify: (
    input: LocalClassifierInput,
    options?: LocalClassifierOptions
  ) => LocalClassificationResult | Promise<LocalClassificationResult>
}

export type KeywordClassifierRule = {
  label: string
  keywords: string[]
  confidence: number
  sourceWeight?: number
  expiresInMs?: number
}

export type KeywordLocalClassifierOptions = {
  id?: string
  version?: string
  model?: string
  sourceDid?: string
  rules: KeywordClassifierRule[]
}

// ─── Public API ────────────────────────────────────────────

export async function classifyWithLocalAdapters(
  input: LocalClassifierInput,
  adapters: readonly LocalClassifierAdapter[],
  options: LocalClassifierOptions = {}
): Promise<LocalClassificationResult> {
  const boundedInput = boundClassifierInput(input, options.maxInputChars)
  const supported = adapters.filter((adapter) => adapter.supports?.(boundedInput) ?? true)
  const results = await Promise.all(
    supported.map(async (adapter) => {
      const startedAt = Date.now()
      try {
        const result = await adapter.classify(boundedInput, options)
        return {
          ...result,
          elapsedMs: result.elapsedMs ?? Date.now() - startedAt
        }
      } catch (error) {
        return createLocalClassificationResult({
          provenance: {
            provider: 'local',
            adapterId: adapter.id,
            adapterVersion: adapter.version,
            model: adapter.model
          },
          errors: [error instanceof Error ? error.message : String(error)]
        })
      }
    })
  )

  return mergeLocalClassificationResults(results, options)
}

export function createKeywordLocalClassifier(
  options: KeywordLocalClassifierOptions
): LocalClassifierAdapter {
  const adapterId = options.id ?? 'local.keyword'
  const adapterVersion = options.version ?? '1'
  const provenance: LocalClassifierProvenance = {
    provider: 'local',
    adapterId,
    adapterVersion,
    model: options.model
  }

  return {
    id: adapterId,
    version: adapterVersion,
    model: options.model,
    classify(input, classifierOptions = {}) {
      const now = classifierOptions.now ?? Date.now()
      const text = canonicalizeContentText({ title: input.title, body: input.body })
      const labels = options.rules
        .map((rule) => matchKeywordRule(rule, text, options.sourceDid, now))
        .filter((label): label is AbuseLabel => label !== null)
        .filter((label) => label.confidence >= (classifierOptions.minConfidence ?? 0))
      const signals = labels.map((label) => ({
        kind: 'label' as const,
        value: label.value,
        confidence: label.confidence,
        evidenceRefs: [...(label.evidenceRefs ?? [])],
        provenance
      }))

      return createLocalClassificationResult({
        labels,
        signals,
        provenance
      })
    }
  }
}

export function mergeLocalClassificationResults(
  results: readonly LocalClassificationResult[],
  options: LocalClassifierOptions = {}
): LocalClassificationResult {
  const minConfidence = options.minConfidence ?? 0
  const labels = mergeLabels(
    results.flatMap((result) => result.labels).filter((label) => label.confidence >= minConfidence)
  )
  const signals = results.flatMap((result) => result.signals)
  const errors = results.flatMap((result) => result.errors)
  const elapsedMs = results.reduce((total, result) => total + (result.elapsedMs ?? 0), 0)

  return createLocalClassificationResult({
    labels,
    quality: mergeQualitySignals(results.map((result) => result.quality)),
    signals,
    provenance: {
      provider: 'local',
      adapterId: 'local.aggregate',
      adapterVersion: '1'
    },
    elapsedMs,
    errors
  })
}

export function createLocalClassificationResult(input: {
  labels?: AbuseLabel[]
  quality?: Partial<AbuseQualitySignals>
  signals?: LocalClassifierSignal[]
  provenance: LocalClassifierProvenance
  elapsedMs?: number
  errors?: string[]
}): LocalClassificationResult {
  return {
    labels: input.labels ?? [],
    quality: input.quality ?? {},
    signals: input.signals ?? [],
    provenance: input.provenance,
    elapsedMs: input.elapsedMs,
    errors: input.errors ?? []
  }
}

// ─── Helpers ───────────────────────────────────────────────

function boundClassifierInput(
  input: LocalClassifierInput,
  maxInputChars: number | undefined
): LocalClassifierInput {
  if (!maxInputChars || input.body.length <= maxInputChars) return input
  return {
    ...input,
    body: input.body.slice(0, maxInputChars)
  }
}

function matchKeywordRule(
  rule: KeywordClassifierRule,
  canonicalText: string,
  sourceDid: string | undefined,
  now: number
): AbuseLabel | null {
  const matched = rule.keywords
    .map((keyword) => canonicalizeContentText(keyword))
    .find((keyword) => keyword.length > 0 && canonicalText.includes(keyword))

  if (!matched) return null

  return {
    value: rule.label,
    confidence: rule.confidence,
    sourceDID: sourceDid,
    sourceWeight: rule.sourceWeight ?? 1,
    expiresAt: rule.expiresInMs ? now + rule.expiresInMs : undefined,
    evidenceRefs: [`keyword:${matched}`]
  }
}

function mergeLabels(labels: readonly AbuseLabel[]): AbuseLabel[] {
  const merged = new Map<string, AbuseLabel>()
  for (const label of labels) {
    const key = `${label.value}:${label.sourceDID ?? 'local'}`
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

function mergeQualitySignals(
  qualities: readonly Partial<AbuseQualitySignals>[]
): Partial<AbuseQualitySignals> {
  return qualities.reduce<Partial<AbuseQualitySignals>>(
    (merged, quality) => ({
      duplicateScore: maxDefined(merged.duplicateScore, quality.duplicateScore),
      slopScore: maxDefined(merged.slopScore, quality.slopScore),
      citationCoverage: minDefined(merged.citationCoverage, quality.citationCoverage),
      provenanceScore: minDefined(merged.provenanceScore, quality.provenanceScore)
    }),
    {}
  )
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
