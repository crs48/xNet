import type { UserSensitivityPreferences } from '../src/sensitivity'
import type { AbuseLabel } from '../src/types'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SENSITIVITY_PREFERENCES,
  assessSensitivity,
  buildSensitivityLabel,
  decideSensitivityVisibility,
  resolveContentVisibility,
  sensitivityOverride,
  strictestVisibility
} from '../src/sensitivity'

const adultViewer: UserSensitivityPreferences = {
  adultContentEnabled: true,
  ageConfirmed: true,
  labels: {}
}

describe('sensitivity labels', () => {
  it('weights a self-label above an ml label above a labeler label', () => {
    const self = buildSensitivityLabel({ value: 'porn', source: 'self', confidence: 1 })
    const ml = buildSensitivityLabel({ value: 'porn', source: 'ml', confidence: 1 })
    const labeler = buildSensitivityLabel({ value: 'porn', source: 'labeler', confidence: 1 })
    expect(self.sourceWeight).toBeGreaterThan(ml.sourceWeight)
    expect(ml.sourceWeight).toBeGreaterThan(labeler.sourceWeight)
  })

  it('treats a single self-label as present but a lone weak labeler signal as absent', () => {
    const present = assessSensitivity([
      buildSensitivityLabel({ value: 'sexual', source: 'self', confidence: 1 })
    ])
    expect(present.values).toEqual(['sexual'])

    const absent = assessSensitivity([
      buildSensitivityLabel({ value: 'sexual', source: 'labeler', confidence: 0.5 })
    ])
    expect(absent.values).toEqual([])
  })

  it('ignores expired labels and labels negated by a safe appeal', () => {
    const now = 1_000
    const expired = assessSensitivity(
      [buildSensitivityLabel({ value: 'porn', source: 'self', confidence: 1, expiresAt: 500 })],
      { now }
    )
    expect(expired.values).toEqual([])

    const labels: AbuseLabel[] = [
      buildSensitivityLabel({ value: 'porn', source: 'self', confidence: 1, id: 'lbl-1' }),
      { value: 'safe', sourceWeight: 1, confidence: 1, negates: 'lbl-1' }
    ]
    expect(assessSensitivity(labels, { now }).values).toEqual([])
  })
})

describe('decideSensitivityVisibility', () => {
  it('shows unlabeled content', () => {
    expect(decideSensitivityVisibility([], adultViewer)).toBe('show')
  })

  it('hides all adult labels when adult content is disabled (default)', () => {
    const labels = [buildSensitivityLabel({ value: 'sexual', source: 'self', confidence: 1 })]
    expect(decideSensitivityVisibility(labels, DEFAULT_SENSITIVITY_PREFERENCES)).toBe('hide')
  })

  it('applies the per-label dial when adult content is enabled', () => {
    const labels = [buildSensitivityLabel({ value: 'sexual', source: 'self', confidence: 1 })]
    // vocabulary default for `sexual` is `warn`
    expect(decideSensitivityVisibility(labels, adultViewer)).toBe('warn')
    // user can tighten to hide
    expect(
      decideSensitivityVisibility(labels, { ...adultViewer, labels: { sexual: 'hide' } })
    ).toBe('hide')
    // ...or loosen to show
    expect(
      decideSensitivityVisibility(labels, { ...adultViewer, labels: { sexual: 'show' } })
    ).toBe('show')
  })

  it('takes the strictest visibility across multiple present labels', () => {
    const labels = [
      buildSensitivityLabel({ value: 'sexual', source: 'self', confidence: 1 }), // warn
      buildSensitivityLabel({ value: 'porn', source: 'self', confidence: 1 }) // hide
    ]
    expect(decideSensitivityVisibility(labels, adultViewer)).toBe('hide')
  })

  it('blurs unsolicited media from a non-mutual sender (dating default 0174)', () => {
    expect(decideSensitivityVisibility([], adultViewer, { unsolicitedMedia: true })).toBe('blur')
    // an explicit user opt-out turns the dating default off
    expect(
      decideSensitivityVisibility(
        [],
        { ...adultViewer, blurUnsolicitedMedia: false },
        {
          unsolicitedMedia: true
        }
      )
    ).toBe('show')
  })
})

describe('resolveContentVisibility', () => {
  it('keeps a platform hide even when the viewer would show', () => {
    expect(
      resolveContentVisibility({ visibility: 'hide' }, [], { ...adultViewer, labels: {} })
    ).toBe('hide')
  })

  it('tightens a platform show to the viewer sensitivity preference', () => {
    const labels = [buildSensitivityLabel({ value: 'porn', source: 'self', confidence: 1 })]
    expect(resolveContentVisibility({ visibility: 'show' }, labels, adultViewer)).toBe('hide')
  })
})

describe('sensitivityOverride', () => {
  it('returns undefined when nothing should be filtered', () => {
    expect(sensitivityOverride([], adultViewer)).toBeUndefined()
  })

  it('emits a user-scoped override when filtering applies', () => {
    const labels = [buildSensitivityLabel({ value: 'porn', source: 'self', confidence: 1 })]
    expect(sensitivityOverride(labels, adultViewer)).toEqual({
      scope: 'user',
      visibility: 'hide',
      reason: 'sensitivity-preference'
    })
  })
})

describe('strictestVisibility', () => {
  it('orders hide > blur > warn > show', () => {
    expect(strictestVisibility('show', 'warn')).toBe('warn')
    expect(strictestVisibility('blur', 'warn')).toBe('blur')
    expect(strictestVisibility('blur', 'hide')).toBe('hide')
  })
})
