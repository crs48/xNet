import { describe, expect, it } from 'vitest'
import {
  extractCitationReferences,
  extractKnowledgeClaims,
  scoreClaimCitationCoverage
} from '../src/citation-coverage'

describe('claim citation coverage', () => {
  it('scores cited and unsupported factual claims', () => {
    const assessment = scoreClaimCitationCoverage({
      title: 'Energy brief',
      body: [
        'Solar capacity grew 12% in 2025 according to the IEA [report](https://iea.org/report).',
        'The city banned gas heaters in 2024.'
      ].join(' ')
    })

    expect(assessment.claimCount).toBe(2)
    expect(assessment.citedClaimCount).toBe(1)
    expect(assessment.unsupportedClaimCount).toBe(1)
    expect(assessment.citationCoverage).toBe(0.5)
    expect(assessment.quality).toEqual({ citationCoverage: 0.5 })
    expect(assessment.reviewEvidenceRefs).toEqual(['claim:claim-2:unsupported'])
    expect(assessment.treatment).toBe('review-evidence')
    expect(assessment.claims[0]?.citationRefs).toEqual(['md-1'])
    expect(assessment.claims[1]?.evidenceRefs).toEqual(['claim:claim-2:unsupported'])
    expect(assessment.citations[0]).toMatchObject({
      kind: 'markdown-link',
      target: 'https://iea.org/report',
      domain: 'iea.org'
    })
  })

  it('counts reference-style citations where the usage appears in the claim sentence', () => {
    const assessment = scoreClaimCitationCoverage({
      body: [
        'Ocean heat reached a record high in 2023 [noaa].',
        '',
        '[noaa]: https://www.noaa.gov/ocean-heat'
      ].join('\n')
    })

    expect(assessment.claims).toHaveLength(1)
    expect(assessment.citationCoverage).toBe(1)
    expect(assessment.citations).toHaveLength(1)
    expect(assessment.citations[0]).toMatchObject({
      id: 'ref-1',
      kind: 'reference-link',
      label: 'noaa',
      target: 'https://www.noaa.gov/ocean-heat',
      domain: 'noaa.gov'
    })
  })

  it('does not treat citation-needed markers as supporting citations', () => {
    const assessment = scoreClaimCitationCoverage({
      body: 'The archive shows migration increased 18% in 2024 [citation needed].'
    })

    expect(assessment.claims).toHaveLength(1)
    expect(assessment.citations).toHaveLength(0)
    expect(assessment.citationCoverage).toBe(0)
    expect(assessment.evidenceRefs).toEqual(['claim:claim-1:unsupported'])
  })

  it('returns full coverage for pages without factual claims', () => {
    const assessment = scoreClaimCitationCoverage({
      body: 'Welcome to the project notes.'
    })

    expect(assessment.claims).toEqual([])
    expect(assessment.citations).toEqual([])
    expect(assessment.citationCoverage).toBe(1)
    expect(assessment.quality).toEqual({ citationCoverage: 1 })
  })

  it('extracts bare URL and DOI citations', () => {
    const citations = extractCitationReferences({
      body: 'See https://example.com/a and doi 10.1000/xyz123 for source material.'
    })

    expect(citations.map((citation) => citation.kind)).toEqual(['bare-url', 'doi'])
    expect(citations.map((citation) => citation.domain)).toEqual(['example.com', 'doi.org'])
  })

  it('caps deterministic claim extraction for large pages', () => {
    const body = Array.from(
      { length: 8 },
      (_, index) => `The test city reported ${index + 1}% growth in 2025.`
    ).join(' ')

    const claims = extractKnowledgeClaims({ body }, { maxClaims: 3 })

    expect(claims).toHaveLength(3)
    expect(claims.map((claim) => claim.id)).toEqual(['claim-1', 'claim-2', 'claim-3'])
  })
})
