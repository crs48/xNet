/**
 * Deterministic content fingerprints for duplicate and near-duplicate checks.
 */

import { hash, hashHex } from '@xnetjs/crypto'

// ─── Types ─────────────────────────────────────────────────

export type ContentFingerprintInput =
  | string
  | {
      title?: string
      body?: string
    }

export type ContentFingerprintOptions = {
  minTokenLength?: number
  shingleSize?: number
  maxShingles?: number
}

export type DuplicateContentOptions = ContentFingerprintOptions & {
  nearDuplicateThreshold?: number
  weakDuplicateThreshold?: number
}

export type ContentFingerprint = {
  kind: 'xnet.content-fingerprint.v1'
  textHash: string
  simHash64: string
  tokenCount: number
  uniqueTokenCount: number
  shingleSize: number
  shingles: string[]
}

export type DuplicateContentAssessment = {
  duplicateScore: number
  matchType: 'none' | 'exact' | 'near' | 'weak'
  exact: boolean
  matchedIndex: number | null
  matchedTextHash: string | null
  shingleJaccard: number
  simHashSimilarity: number
  reasons: string[]
}

// ─── Constants ─────────────────────────────────────────────

const DEFAULT_MIN_TOKEN_LENGTH = 2
const DEFAULT_SHINGLE_SIZE = 5
const DEFAULT_MAX_SHINGLES = 512
const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 0.75
const DEFAULT_WEAK_DUPLICATE_THRESHOLD = 0.55
const SIMHASH_BITS = 64
const encoder = new TextEncoder()

// ─── Public API ────────────────────────────────────────────

export function createContentFingerprint(
  input: ContentFingerprintInput,
  options: ContentFingerprintOptions = {}
): ContentFingerprint {
  const shingleSize = options.shingleSize ?? DEFAULT_SHINGLE_SIZE
  const canonicalText = canonicalizeContentText(input)
  const tokens = tokenizeContent(canonicalText, options)
  const uniqueTokens = new Set(tokens)

  return {
    kind: 'xnet.content-fingerprint.v1',
    textHash: hashHex(encoder.encode(canonicalText), 'blake3'),
    simHash64: createSimHash64(tokens),
    tokenCount: tokens.length,
    uniqueTokenCount: uniqueTokens.size,
    shingleSize,
    shingles: createShingles(tokens, {
      shingleSize,
      maxShingles: options.maxShingles ?? DEFAULT_MAX_SHINGLES
    })
  }
}

export function assessDuplicateContent(
  candidate: ContentFingerprintInput | ContentFingerprint,
  references: readonly (ContentFingerprintInput | ContentFingerprint)[],
  options: DuplicateContentOptions = {}
): DuplicateContentAssessment {
  const candidateFingerprint = toFingerprint(candidate, options)
  const initial = createDuplicateAssessment({
    duplicateScore: 0,
    matchType: 'none',
    matchedIndex: null,
    matchedTextHash: null,
    shingleJaccard: 0,
    simHashSimilarity: 0,
    reasons: []
  })

  if (candidateFingerprint.tokenCount === 0 || references.length === 0) return initial

  return references
    .map((reference, index) =>
      compareContentFingerprints(candidateFingerprint, toFingerprint(reference, options), {
        ...options,
        matchedIndex: index
      })
    )
    .reduce(
      (best, current) => (current.duplicateScore > best.duplicateScore ? current : best),
      initial
    )
}

export function compareContentFingerprints(
  candidate: ContentFingerprint,
  reference: ContentFingerprint,
  options: DuplicateContentOptions & { matchedIndex?: number } = {}
): DuplicateContentAssessment {
  if (candidate.tokenCount === 0 || reference.tokenCount === 0) {
    return createDuplicateAssessment({
      duplicateScore: 0,
      matchType: 'none',
      matchedIndex: options.matchedIndex ?? null,
      matchedTextHash: reference.textHash,
      shingleJaccard: 0,
      simHashSimilarity: 0,
      reasons: []
    })
  }

  const exact = candidate.textHash === reference.textHash
  const shingleJaccard = jaccard(candidate.shingles, reference.shingles)
  const simHashSimilarity = compareSimHash64(candidate.simHash64, reference.simHash64)
  const duplicateScore = exact
    ? 1
    : clamp01(
        Math.max(
          shingleJaccard,
          simHashSimilarity >= 0.92 ? simHashSimilarity : simHashSimilarity * 0.75
        )
      )
  const nearThreshold = options.nearDuplicateThreshold ?? DEFAULT_NEAR_DUPLICATE_THRESHOLD
  const weakThreshold = options.weakDuplicateThreshold ?? DEFAULT_WEAK_DUPLICATE_THRESHOLD
  const matchType = exact
    ? 'exact'
    : duplicateScore >= nearThreshold
      ? 'near'
      : duplicateScore >= weakThreshold
        ? 'weak'
        : 'none'
  const reasons = [
    exact ? 'exact-content-hash' : null,
    !exact && shingleJaccard >= nearThreshold ? 'near-duplicate-shingles' : null,
    !exact && simHashSimilarity >= 0.92 ? 'near-duplicate-simhash' : null,
    !exact && matchType === 'weak' ? 'weak-duplicate-signal' : null
  ].filter((reason): reason is string => reason !== null)

  return createDuplicateAssessment({
    duplicateScore,
    matchType,
    exact,
    matchedIndex: options.matchedIndex ?? null,
    matchedTextHash: reference.textHash,
    shingleJaccard,
    simHashSimilarity,
    reasons
  })
}

export function canonicalizeContentText(input: ContentFingerprintInput): string {
  const text =
    typeof input === 'string' ? input : [input.title, input.body].filter(Boolean).join('\n\n')

  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' url ')
    .replace(/['']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenizeContent(
  canonicalText: string,
  options: ContentFingerprintOptions = {}
): string[] {
  const minTokenLength = options.minTokenLength ?? DEFAULT_MIN_TOKEN_LENGTH
  if (!canonicalText) return []
  return canonicalText.split(' ').filter((token) => token.length >= minTokenLength)
}

export function compareSimHash64(left: string, right: string): number {
  const leftValue = BigInt(`0x${left}`)
  const rightValue = BigInt(`0x${right}`)
  let diff = leftValue ^ rightValue
  let distance = 0

  while (diff > 0n) {
    distance += Number(diff & 1n)
    diff >>= 1n
  }

  return 1 - distance / SIMHASH_BITS
}

// ─── Helpers ───────────────────────────────────────────────

function createShingles(
  tokens: readonly string[],
  options: { shingleSize: number; maxShingles: number }
): string[] {
  if (tokens.length === 0) return []
  const width = Math.max(1, Math.min(options.shingleSize, tokens.length))
  const shingles: string[] = []

  for (let i = 0; i <= tokens.length - width; i++) {
    shingles.push(hashHex(encoder.encode(tokens.slice(i, i + width).join(' ')), 'blake3'))
  }

  return Array.from(new Set(shingles)).slice(0, options.maxShingles)
}

function createSimHash64(tokens: readonly string[]): string {
  if (tokens.length === 0) return '0000000000000000'
  const weights = Array.from({ length: SIMHASH_BITS }, () => 0)

  for (const token of tokens) {
    const value = hashToken64(token)
    for (let bit = 0; bit < SIMHASH_BITS; bit++) {
      const mask = 1n << BigInt(bit)
      weights[bit] += (value & mask) === 0n ? -1 : 1
    }
  }

  let result = 0n
  for (let bit = 0; bit < SIMHASH_BITS; bit++) {
    if (weights[bit] >= 0) {
      result |= 1n << BigInt(bit)
    }
  }

  return result.toString(16).padStart(16, '0')
}

function hashToken64(token: string): bigint {
  const digest = hash(encoder.encode(token), 'blake3')
  return digest.slice(0, 8).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n)
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const intersection = Array.from(leftSet).filter((value) => rightSet.has(value)).length
  const union = new Set([...leftSet, ...rightSet]).size
  return union === 0 ? 0 : intersection / union
}

function toFingerprint(
  value: ContentFingerprintInput | ContentFingerprint,
  options: ContentFingerprintOptions
): ContentFingerprint {
  return isContentFingerprint(value) ? value : createContentFingerprint(value, options)
}

function isContentFingerprint(
  value: ContentFingerprintInput | ContentFingerprint
): value is ContentFingerprint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'xnet.content-fingerprint.v1'
  )
}

function createDuplicateAssessment(
  input: Partial<DuplicateContentAssessment> &
    Pick<DuplicateContentAssessment, 'duplicateScore' | 'matchType'>
): DuplicateContentAssessment {
  return {
    duplicateScore: input.duplicateScore,
    matchType: input.matchType,
    exact: input.exact ?? input.matchType === 'exact',
    matchedIndex: input.matchedIndex ?? null,
    matchedTextHash: input.matchedTextHash ?? null,
    shingleJaccard: input.shingleJaccard ?? 0,
    simHashSimilarity: input.simHashSimilarity ?? 0,
    reasons: input.reasons ? [...input.reasons] : []
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
