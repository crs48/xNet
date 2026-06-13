import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadSensitivityPreferences,
  saveSensitivityPreferences,
  useSensitivityPreferences
} from './sensitivity-preferences'

describe('sensitivity preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to adult content disabled with blur-unsolicited on', () => {
    const prefs = loadSensitivityPreferences()
    expect(prefs.adultContentEnabled).toBe(false)
    expect(prefs.ageConfirmed).toBe(false)
    expect(prefs.blurUnsolicitedMedia).toBe(true)
  })

  it('round-trips through localStorage and ignores junk label prefs', () => {
    saveSensitivityPreferences({
      adultContentEnabled: true,
      ageConfirmed: true,
      blurUnsolicitedMedia: false,
      // @ts-expect-error — junk values must be dropped by sanitize
      labels: { porn: 'show', bogus: 'nope', sexual: 'invalid' }
    })
    const prefs = loadSensitivityPreferences()
    expect(prefs.labels.porn).toBe('show')
    expect(prefs.labels.sexual).toBeUndefined()
    expect('bogus' in prefs.labels).toBe(false)
  })

  it('will not enable adult content until age is confirmed', () => {
    const { result } = renderHook(() => useSensitivityPreferences())

    act(() => result.current.setAdultContentEnabled(true))
    expect(result.current.preferences.adultContentEnabled).toBe(false)

    act(() => result.current.confirmAge())
    act(() => result.current.setAdultContentEnabled(true))
    expect(result.current.preferences.adultContentEnabled).toBe(true)
  })

  it('persists a per-label dial change', () => {
    const { result } = renderHook(() => useSensitivityPreferences())
    act(() => result.current.setLabelPreference('sexual', 'hide'))
    expect(loadSensitivityPreferences().labels.sexual).toBe('hide')
  })
})
