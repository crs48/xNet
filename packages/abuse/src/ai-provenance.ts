/**
 * Model/provider provenance helpers for AI-generated moderation signals.
 */

// ─── Types ─────────────────────────────────────────────────

export type AISignalSourceType = 'local-ai' | 'cloud-ai'

export type AISignalProvenanceInput = {
  sourceType?: string
  modelProvider?: string
  modelName?: string
  modelVersion?: string
  adapterId?: string
  adapterVersion?: string
  policyId?: string
}

export type AISignalProvenance = {
  sourceType: AISignalSourceType
  modelProvider: string
  modelName: string
  modelVersion?: string
  adapterId?: string
  adapterVersion?: string
  policyId?: string
}

export type AISignalProvenanceValidation = {
  required: boolean
  valid: boolean
  errors: string[]
  provenance: AISignalProvenance | null
}

// ─── Public API ────────────────────────────────────────────

export function isAISignalSourceType(
  sourceType: string | undefined
): sourceType is AISignalSourceType {
  return sourceType === 'local-ai' || sourceType === 'cloud-ai'
}

export function validateAISignalProvenance(
  input: AISignalProvenanceInput
): AISignalProvenanceValidation {
  if (!isAISignalSourceType(input.sourceType)) {
    return {
      required: false,
      valid: true,
      errors: [],
      provenance: null
    }
  }

  const modelProvider = normalizeRequired(input.modelProvider)
  const modelName = normalizeRequired(input.modelName)
  const errors = [
    modelProvider ? null : 'missing-model-provider',
    modelName ? null : 'missing-model-name'
  ].filter((error): error is string => error !== null)

  return {
    required: true,
    valid: errors.length === 0,
    errors,
    provenance:
      errors.length === 0
        ? {
            sourceType: input.sourceType,
            modelProvider: modelProvider ?? '',
            modelName: modelName ?? '',
            modelVersion: normalizeOptional(input.modelVersion),
            adapterId: normalizeOptional(input.adapterId),
            adapterVersion: normalizeOptional(input.adapterVersion),
            policyId: normalizeOptional(input.policyId)
          }
        : null
  }
}

export function createAISignalProvenanceEvidenceRef(input: AISignalProvenanceInput): string | null {
  const validation = validateAISignalProvenance(input)
  if (!validation.provenance) return null

  const version = validation.provenance.modelVersion ?? 'unversioned'
  return [
    'ai-provenance',
    validation.provenance.sourceType,
    validation.provenance.modelProvider,
    validation.provenance.modelName,
    version
  ]
    .map(normalizeEvidenceRefPart)
    .join(':')
}

// ─── Helpers ───────────────────────────────────────────────

function normalizeRequired(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : undefined
}

function normalizeEvidenceRefPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
}
