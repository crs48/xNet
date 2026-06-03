/**
 * Deterministic claim extraction and citation coverage scoring.
 */

import type { AbuseQualitySignals } from './types'

// ─── Types ─────────────────────────────────────────────────

export type CitationKind = 'markdown-link' | 'reference-link' | 'footnote-link' | 'bare-url' | 'doi'

export type CitationReference = {
  id: string
  kind: CitationKind
  label: string
  target: string
  domain?: string
  startIndex: number
  endIndex: number
}

export type ExtractedClaim = {
  id: string
  text: string
  startIndex: number
  endIndex: number
  confidence: number
  citationRefs: readonly string[]
  evidenceRefs: readonly string[]
}

export type ClaimCitationCoverageInput = {
  title?: string
  body: string
  published?: boolean
  sourceDID?: string
}

export type ClaimCitationCoverageOptions = {
  minClaimChars?: number
  maxClaims?: number
  citationWindowChars?: number
}

export type ClaimCitationCoverageAssessment = {
  claims: ExtractedClaim[]
  citations: CitationReference[]
  citationCoverage: number
  citedClaimCount: number
  unsupportedClaimCount: number
  claimCount: number
  quality: Partial<AbuseQualitySignals>
  evidenceRefs: string[]
}

// ─── Public API ────────────────────────────────────────────

export function extractCitationReferences(input: ClaimCitationCoverageInput): CitationReference[] {
  const referenceTargets = extractReferenceTargets(input.body)
  const citationCandidates = [
    ...extractMarkdownLinkCitations(input.body),
    ...extractReferenceUsageCitations(input.body, referenceTargets),
    ...extractBareUrlCitations(input.body),
    ...extractDoiCitations(input.body)
  ]

  return dedupeCitations(citationCandidates)
}

export function extractKnowledgeClaims(
  input: ClaimCitationCoverageInput,
  options: ClaimCitationCoverageOptions = {}
): ExtractedClaim[] {
  const citations = extractCitationReferences(input)
  return extractKnowledgeClaimsWithCitations(input, citations, options)
}

export function scoreClaimCitationCoverage(
  input: ClaimCitationCoverageInput,
  options: ClaimCitationCoverageOptions = {}
): ClaimCitationCoverageAssessment {
  const citations = extractCitationReferences(input)
  const claims = extractKnowledgeClaimsWithCitations(input, citations, options)
  const citedClaimCount = claims.filter((claim) => claim.citationRefs.length > 0).length
  const unsupportedClaimCount = Math.max(0, claims.length - citedClaimCount)
  const citationCoverage = claims.length === 0 ? 1 : citedClaimCount / claims.length
  const unsupportedEvidence = claims
    .filter((claim) => claim.citationRefs.length === 0)
    .map((claim) => `claim:${claim.id}:unsupported`)

  return {
    claims,
    citations,
    citationCoverage,
    citedClaimCount,
    unsupportedClaimCount,
    claimCount: claims.length,
    quality: {
      citationCoverage
    },
    evidenceRefs: unsupportedEvidence
  }
}

// ─── Helpers ───────────────────────────────────────────────

const DEFAULT_MIN_CLAIM_CHARS = 28
const DEFAULT_CITATION_WINDOW_CHARS = 80
const DEFAULT_MAX_CLAIMS = 100

const factualVerbPattern =
  /\b(is|are|was|were|has|have|had|will|would|can|could|causes?|caused|increases?|increased|decreases?|decreased|reduces?|reduced|shows?|showed|found|finds|reports?|reported|announced|confirmed|banned|requires?|required|grew|fell|rose|reached|hit)\b/i
const numberOrDatePattern =
  /\b(\d+(?:[.,]\d+)?%?|\d{4}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
const capitalizedPhrasePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/
const citationNeededPattern = /\[(citation needed|source needed|needs source)\]/i

function extractKnowledgeClaimsWithCitations(
  input: ClaimCitationCoverageInput,
  citations: readonly CitationReference[],
  options: ClaimCitationCoverageOptions
): ExtractedClaim[] {
  const minClaimChars = options.minClaimChars ?? DEFAULT_MIN_CLAIM_CHARS
  const maxClaims = options.maxClaims ?? DEFAULT_MAX_CLAIMS
  const citationWindowChars = options.citationWindowChars ?? DEFAULT_CITATION_WINDOW_CHARS
  const bodyWithoutReferenceDefinitions = removeReferenceDefinitions(input.body)

  return splitSentences(bodyWithoutReferenceDefinitions)
    .map((sentence) => scoreSentenceAsClaim(sentence, minClaimChars))
    .filter(
      (claim): claim is Omit<ExtractedClaim, 'id' | 'citationRefs' | 'evidenceRefs'> =>
        claim !== null
    )
    .slice(0, maxClaims)
    .map((claim, index) => {
      const citationRefs = findClaimCitationRefs(claim, citations, citationWindowChars)
      const id = `claim-${index + 1}`
      return {
        ...claim,
        id,
        citationRefs,
        evidenceRefs:
          citationRefs.length > 0
            ? citationRefs.map((citationId) => `citation:${citationId}`)
            : [`claim:${id}:unsupported`]
      }
    })
}

function scoreSentenceAsClaim(
  sentence: SentenceSpan,
  minClaimChars: number
): Omit<ExtractedClaim, 'id' | 'citationRefs' | 'evidenceRefs'> | null {
  const text = normalizeClaimText(sentence.text)
  if (text.length < minClaimChars) return null
  if (isStructuralMarkdownLine(text)) return null

  const featureCount = [
    factualVerbPattern.test(text),
    numberOrDatePattern.test(text),
    capitalizedPhrasePattern.test(text),
    citationNeededPattern.test(text)
  ].filter(Boolean).length

  if (featureCount < 2) return null

  return {
    text,
    startIndex: sentence.startIndex,
    endIndex: sentence.endIndex,
    confidence: clamp(0.35 + featureCount * 0.15, 0, 0.95)
  }
}

function findClaimCitationRefs(
  claim: Pick<ExtractedClaim, 'startIndex' | 'endIndex'>,
  citations: readonly CitationReference[],
  citationWindowChars: number
): readonly string[] {
  return citations
    .filter((citation) => {
      const insideClaim =
        citation.startIndex >= claim.startIndex && citation.endIndex <= claim.endIndex
      const nearbyAfterClaim =
        citation.startIndex > claim.endIndex &&
        citation.startIndex - claim.endIndex <= citationWindowChars
      return insideClaim || nearbyAfterClaim
    })
    .map((citation) => citation.id)
}

type SentenceSpan = {
  text: string
  startIndex: number
  endIndex: number
}

function splitSentences(text: string): SentenceSpan[] {
  const sentences: SentenceSpan[] = []
  let startIndex = 0

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    const isBoundary = char === '.' || char === '!' || char === '?'
    if (!isBoundary || (next !== undefined && !/\s/.test(next))) continue

    sentences.push({
      text: text.slice(startIndex, index + 1),
      startIndex,
      endIndex: index + 1
    })
    startIndex = skipWhitespace(text, index + 1)
    index = startIndex - 1
  }

  if (startIndex < text.length) {
    sentences.push({
      text: text.slice(startIndex),
      startIndex,
      endIndex: text.length
    })
  }

  return sentences.filter((sentence) => sentence.text.trim().length > 0)
}

function extractReferenceTargets(body: string): Map<string, string> {
  return Array.from(body.matchAll(/^\s*\[([^\]]+)\]:\s*(\S+)/gm)).reduce((targets, match) => {
    const label = normalizeReferenceLabel(match[1])
    const target = match[2]?.trim()
    if (label && target) targets.set(label, target)
    return targets
  }, new Map<string, string>())
}

function extractMarkdownLinkCitations(body: string): CitationReference[] {
  return Array.from(body.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|doi:[^)]+)\)/gi)).map(
    (match, index) =>
      createCitation({
        id: `md-${index + 1}`,
        kind: 'markdown-link',
        label: match[1] ?? '',
        target: match[2] ?? '',
        startIndex: match.index ?? 0,
        endIndex: (match.index ?? 0) + match[0].length
      })
  )
}

function extractReferenceUsageCitations(
  body: string,
  referenceTargets: ReadonlyMap<string, string>
): CitationReference[] {
  return Array.from(body.matchAll(/\[([^\]\n]+)\]/g))
    .filter((match) => !isInsideReferenceDefinition(body, match.index ?? 0))
    .filter((match) => !citationNeededPattern.test(match[0]))
    .map((match) => ({
      match,
      label: normalizeReferenceLabel(match[1])
    }))
    .filter(({ label }) => referenceTargets.has(label))
    .map(({ match, label }, index) =>
      createCitation({
        id: `ref-${index + 1}`,
        kind: label.startsWith('^') ? 'footnote-link' : 'reference-link',
        label,
        target: referenceTargets.get(label) ?? '',
        startIndex: match.index ?? 0,
        endIndex: (match.index ?? 0) + match[0].length
      })
    )
}

function extractBareUrlCitations(body: string): CitationReference[] {
  return Array.from(body.matchAll(/\bhttps?:\/\/[^\s)\]]+/gi))
    .filter((match) => !isInsideReferenceDefinition(body, match.index ?? 0))
    .map((match, index) =>
      createCitation({
        id: `url-${index + 1}`,
        kind: 'bare-url',
        label: match[0],
        target: match[0],
        startIndex: match.index ?? 0,
        endIndex: (match.index ?? 0) + match[0].length
      })
    )
}

function extractDoiCitations(body: string): CitationReference[] {
  return Array.from(body.matchAll(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi))
    .filter((match) => !isInsideReferenceDefinition(body, match.index ?? 0))
    .map((match, index) =>
      createCitation({
        id: `doi-${index + 1}`,
        kind: 'doi',
        label: match[0],
        target: `doi:${match[0]}`,
        startIndex: match.index ?? 0,
        endIndex: (match.index ?? 0) + match[0].length
      })
    )
}

function createCitation(input: Omit<CitationReference, 'domain'>): CitationReference {
  return {
    ...input,
    domain: getCitationDomain(input.target)
  }
}

function dedupeCitations(citations: readonly CitationReference[]): CitationReference[] {
  const seen = new Set<string>()
  return [...citations]
    .sort(compareCitationPriority)
    .reduce<CitationReference[]>((deduped, citation) => {
      const overlapsStructuredCitation = deduped.some(
        (existing) =>
          existing.target === citation.target &&
          rangesOverlap(existing, citation) &&
          citationKindPriority(existing.kind) <= citationKindPriority(citation.kind)
      )
      if (overlapsStructuredCitation) return deduped

      const key = `${citation.startIndex}:${citation.endIndex}:${citation.target}`
      if (seen.has(key)) return deduped
      seen.add(key)
      return [...deduped, citation]
    }, [])
    .sort((left, right) => left.startIndex - right.startIndex)
}

function compareCitationPriority(left: CitationReference, right: CitationReference): number {
  return (
    citationKindPriority(left.kind) - citationKindPriority(right.kind) ||
    left.startIndex - right.startIndex
  )
}

function citationKindPriority(kind: CitationKind): number {
  if (kind === 'markdown-link') return 0
  if (kind === 'reference-link') return 1
  if (kind === 'footnote-link') return 1
  if (kind === 'doi') return 2
  return 3
}

function rangesOverlap(
  left: Pick<CitationReference, 'startIndex' | 'endIndex'>,
  right: Pick<CitationReference, 'startIndex' | 'endIndex'>
): boolean {
  return left.startIndex < right.endIndex && right.startIndex < left.endIndex
}

function removeReferenceDefinitions(body: string): string {
  return body.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
}

function isInsideReferenceDefinition(body: string, index: number): boolean {
  const lineStart = body.lastIndexOf('\n', Math.max(0, index - 1)) + 1
  const lineEndIndex = body.indexOf('\n', index)
  const lineEnd = lineEndIndex === -1 ? body.length : lineEndIndex
  return /^\s*\[[^\]]+\]:\s*\S+/.test(body.slice(lineStart, lineEnd))
}

function skipWhitespace(text: string, startIndex: number): number {
  let index = startIndex
  while (index < text.length && /\s/.test(text[index] ?? '')) {
    index += 1
  }
  return index
}

function normalizeClaimText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[#>*\-\d.\s]+/, '')
    .trim()
}

function isStructuralMarkdownLine(text: string): boolean {
  return /^(#{1,6}\s+|[-*]\s*$|```|:::)/.test(text)
}

function normalizeReferenceLabel(label: string | undefined): string {
  return (label ?? '').trim().toLowerCase()
}

function getCitationDomain(target: string): string | undefined {
  if (target.startsWith('doi:')) return 'doi.org'
  try {
    return new URL(target).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
