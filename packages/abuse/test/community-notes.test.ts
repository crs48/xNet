import { describe, expect, it } from 'vitest'
import {
  groupCommunityNoteRatingsByPerspective,
  isCommunityNoteAgreementVisible,
  scoreCommunityNotePerspectiveDiversity,
  summarizeCommunityNoteAgreement,
  type CommunityNoteRatingInput
} from '../src/community-notes'

describe('community note agreement experiments', () => {
  const rating = (
    helpfulness: CommunityNoteRatingInput['helpfulness'],
    perspective: string,
    confidence = 1
  ): CommunityNoteRatingInput => ({
    helpfulness,
    perspective,
    confidence
  })

  it('marks notes helpful only after diverse helpful agreement', () => {
    const summary = summarizeCommunityNoteAgreement([
      rating('helpful', 'researcher'),
      rating('helpful', 'operator'),
      rating('helpful', 'reader'),
      rating('helpful', 'researcher', 0.9),
      rating('needs-source', 'skeptic', 0.2)
    ])

    expect(summary.status).toBe('helpful')
    expect(summary.reasons).toEqual(['diverse-helpful-agreement'])
    expect(summary.supportingPerspectiveCount).toBe(3)
    expect(summary.diversityScore).toBeGreaterThan(0.9)
    expect(isCommunityNoteAgreementVisible(summary)).toBe(true)
  })

  it('holds homogeneous helpful ratings for more perspective diversity', () => {
    const summary = summarizeCommunityNoteAgreement([
      rating('helpful', 'same-group'),
      rating('helpful', 'same-group'),
      rating('helpful', 'same-group'),
      rating('helpful', 'same-group'),
      rating('helpful', 'same-group')
    ])

    expect(summary.status).toBe('needs-more-diversity')
    expect(summary.reasons).toEqual(['helpful-but-not-diverse'])
    expect(summary.supportingPerspectiveCount).toBe(1)
    expect(summary.diversityScore).toBe(0)
  })

  it('marks strong not-helpful consensus separately from low evidence', () => {
    const summary = summarizeCommunityNoteAgreement([
      rating('not-helpful', 'researcher'),
      rating('irrelevant', 'operator'),
      rating('not-helpful', 'reader'),
      rating('not-helpful', 'skeptic'),
      rating('not-helpful', 'moderator')
    ])

    expect(summary.status).toBe('not-helpful')
    expect(summary.notHelpfulScore).toBe(1)
    expect(summary.reasons).toEqual(['not-helpful-consensus'])
  })

  it('treats simultaneous helpful and not-helpful support as contested', () => {
    const summary = summarizeCommunityNoteAgreement(
      [
        rating('helpful', 'researcher'),
        rating('helpful', 'operator'),
        rating('helpful', 'reader'),
        rating('not-helpful', 'skeptic', 0.6),
        rating('irrelevant', 'moderator', 0.6)
      ],
      { contestedThreshold: 0.2 }
    )

    expect(summary.status).toBe('contested')
    expect(summary.reasons).toEqual(['contested-ratings'])
    expect(summary.helpfulScore).toBeGreaterThan(0.6)
    expect(summary.notHelpfulScore).toBeGreaterThan(0.2)
  })

  it('groups perspective labels consistently', () => {
    const groups = groupCommunityNoteRatingsByPerspective([
      rating('helpful', 'Research Team'),
      rating('helpful', 'research team'),
      { helpfulness: 'helpful', confidence: 1, raterDID: 'did:key:rater' }
    ])

    expect(Array.from(groups.keys()).sort()).toEqual(['did:key:rater', 'research-team'])
    expect(groups.get('research-team')).toHaveLength(2)
  })

  it('scores helpful perspective diversity with normalized entropy', () => {
    expect(
      scoreCommunityNotePerspectiveDiversity([
        rating('helpful', 'a'),
        rating('helpful', 'b'),
        rating('helpful', 'c')
      ])
    ).toBe(1)
  })
})
