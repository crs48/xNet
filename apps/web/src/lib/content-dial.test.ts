import { DEFAULT_SENSITIVITY_PREFERENCES } from '@xnetjs/abuse'
import { describe, expect, it } from 'vitest'
import { applyContentDialPreset } from './content-dial'

describe('content dial presets', () => {
  it('family hides every sensitive category', () => {
    const prefs = applyContentDialPreset('family')
    expect(prefs.adultContentEnabled).toBe(false)
    expect(prefs.labels).toMatchObject({ sexual: 'hide', nudity: 'hide', porn: 'hide' })
  })

  it('standard blurs (not hides) suggestive content', () => {
    const prefs = applyContentDialPreset('standard')
    expect(prefs.labels.sexual).toBe('blur')
    expect(prefs.labels.porn).toBe('hide')
  })

  it('adult only enables adult content when age is confirmed', () => {
    expect(
      applyContentDialPreset('adult', { ...DEFAULT_SENSITIVITY_PREFERENCES, ageConfirmed: false })
        .adultContentEnabled
    ).toBe(false)
    expect(
      applyContentDialPreset('adult', { ...DEFAULT_SENSITIVITY_PREFERENCES, ageConfirmed: true })
        .adultContentEnabled
    ).toBe(true)
  })

  it('custom leaves preferences untouched', () => {
    const current = { ...DEFAULT_SENSITIVITY_PREFERENCES, labels: { porn: 'show' as const } }
    expect(applyContentDialPreset('custom', current)).toBe(current)
  })
})
