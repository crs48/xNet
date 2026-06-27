/**
 * Charter §Calm receipt: the wind-down nudge is off by default and only a
 * genuine "you've been here a while" condition shows it — never a streak.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDDOWN_PREFERENCES,
  loadWinddownPreferences,
  saveWinddownPreferences,
  shouldShowWinddown,
  winddownThresholdMs
} from './winddown'

describe('shouldShowWinddown', () => {
  const base = { enabled: true, thresholdMs: 60_000, dismissedThisSession: false }

  it('is off by default — disabled never shows', () => {
    expect(DEFAULT_WINDDOWN_PREFERENCES.enabled).toBe(false)
    expect(shouldShowWinddown({ ...base, enabled: false, sessionElapsedMs: 999_999 })).toBe(false)
  })

  it('shows only after the session passes the threshold', () => {
    expect(shouldShowWinddown({ ...base, sessionElapsedMs: 59_999 })).toBe(false)
    expect(shouldShowWinddown({ ...base, sessionElapsedMs: 60_000 })).toBe(true)
  })

  it('stays hidden once dismissed this session (no nagging)', () => {
    expect(
      shouldShowWinddown({ ...base, sessionElapsedMs: 120_000, dismissedThisSession: true })
    ).toBe(false)
  })

  it('threshold converts minutes to ms', () => {
    expect(winddownThresholdMs({ enabled: true, sessionMinutes: 30 })).toBe(1_800_000)
  })
})

describe('winddown preference persistence', () => {
  it('round-trips and clamps the duration to a sane range', () => {
    saveWinddownPreferences({ enabled: true, sessionMinutes: 90 })
    expect(loadWinddownPreferences()).toEqual({ enabled: true, sessionMinutes: 90 })

    saveWinddownPreferences({ enabled: true, sessionMinutes: 99_999 })
    expect(loadWinddownPreferences().sessionMinutes).toBe(600)
  })

  it('defaults to off on missing/garbage storage', () => {
    localStorage.removeItem('xnet:winddown-prefs')
    expect(loadWinddownPreferences()).toEqual(DEFAULT_WINDDOWN_PREFERENCES)
    localStorage.setItem('xnet:winddown-prefs', 'not json')
    expect(loadWinddownPreferences().enabled).toBe(false)
  })
})
