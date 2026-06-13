import { describe, expect, it } from 'vitest'
import {
  buildSensitivityLabel,
  decideSensitivityVisibility,
  explainSensitivityVisibility,
  type UserSensitivityPreferences
} from './sensitivity'

const ADULT_ON: UserSensitivityPreferences = {
  adultContentEnabled: true,
  ageConfirmed: true,
  labels: { porn: 'warn', sexual: 'show' },
  blurUnsolicitedMedia: true
}

function label(value: 'sexual' | 'nudity' | 'porn' | 'graphic-media', confidence = 1) {
  return buildSensitivityLabel({ value, source: 'self', confidence })
}

describe('explainSensitivityVisibility', () => {
  it('returns a no-reason show for clean content', () => {
    const exp = explainSensitivityVisibility([])
    expect(exp.visibility).toBe('show')
    expect(exp.reasons).toHaveLength(0)
  })

  it('attributes a hide to adult-content-disabled (default prefs)', () => {
    const exp = explainSensitivityVisibility([label('porn')])
    expect(exp.visibility).toBe('hide')
    expect(exp.reasons).toEqual([{ label: 'porn', effect: 'hide', cause: 'adult-disabled' }])
  })

  it('attributes a warn to the viewer dial when adult content is enabled', () => {
    const exp = explainSensitivityVisibility([label('porn')], ADULT_ON)
    expect(exp.visibility).toBe('warn')
    expect(exp.reasons).toEqual([{ label: 'porn', effect: 'warn', cause: 'dial' }])
  })

  it('records a present-but-shown label too (transparency)', () => {
    const exp = explainSensitivityVisibility([label('sexual')], ADULT_ON)
    expect(exp.visibility).toBe('show')
    expect(exp.reasons).toEqual([{ label: 'sexual', effect: 'show', cause: 'dial' }])
  })

  it('explains the unsolicited-media blur rule', () => {
    const exp = explainSensitivityVisibility([], ADULT_ON, { unsolicitedMedia: true })
    expect(exp.visibility).toBe('blur')
    expect(exp.reasons).toEqual([{ effect: 'blur', cause: 'unsolicited-media' }])
  })

  it('its visibility always matches decideSensitivityVisibility', () => {
    const cases: { labels: ReturnType<typeof label>[]; opts?: { unsolicitedMedia?: boolean } }[] = [
      { labels: [] },
      { labels: [label('porn')] },
      { labels: [label('graphic-media')] },
      { labels: [label('sexual'), label('porn')] },
      { labels: [], opts: { unsolicitedMedia: true } }
    ]
    for (const { labels, opts } of cases) {
      expect(explainSensitivityVisibility(labels, ADULT_ON, opts).visibility).toBe(
        decideSensitivityVisibility(labels, ADULT_ON, opts)
      )
    }
  })
})
