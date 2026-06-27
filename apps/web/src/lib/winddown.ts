/**
 * "Time well spent" wind-down (xNet Humane Internet Charter §Calm, 0234).
 *
 * The one humane feature that helps you *close the laptop*: an opt-in (off by
 * default), once-per-session, gently-dismissible nudge after you've been here a
 * while. Deliberately NOT a streak, a counter, or anything that rewards staying
 * — it competes for your wellbeing, not your time. The decision is a pure
 * function so it can be unit-tested without a clock or a DOM.
 */
import { useCallback, useEffect, useState } from 'react'

export interface WinddownPreferences {
  /** Off by default — the calm default is no nudge at all. */
  enabled: boolean
  /** Minutes of continuous session before the nudge may appear. */
  sessionMinutes: number
}

/** Offered durations (minutes). Coarse on purpose — this is a boundary, not a stopwatch. */
export const WINDDOWN_DURATION_CHOICES = [30, 60, 90, 120] as const

export const DEFAULT_WINDDOWN_PREFERENCES: WinddownPreferences = {
  enabled: false,
  sessionMinutes: 60
}

/**
 * Should the wind-down nudge be visible right now? Pure: enabled, not already
 * dismissed this session, and the session has run past the threshold.
 */
export function shouldShowWinddown(input: {
  enabled: boolean
  sessionElapsedMs: number
  thresholdMs: number
  dismissedThisSession: boolean
}): boolean {
  if (!input.enabled || input.dismissedThisSession) return false
  return input.sessionElapsedMs >= input.thresholdMs
}

export function winddownThresholdMs(prefs: WinddownPreferences): number {
  return Math.max(0, prefs.sessionMinutes) * 60_000
}

function storageKey(): string {
  const scope = (globalThis as { __XNET_STORAGE_SCOPE__?: string }).__XNET_STORAGE_SCOPE__
  return scope ? `xnet:winddown-prefs:${scope}` : 'xnet:winddown-prefs'
}

function clampMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WINDDOWN_PREFERENCES.sessionMinutes
  }
  return Math.min(600, Math.max(1, Math.round(value)))
}

function sanitize(parsed: unknown): WinddownPreferences {
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_WINDDOWN_PREFERENCES }
  const raw = parsed as Partial<WinddownPreferences>
  return { enabled: raw.enabled === true, sessionMinutes: clampMinutes(raw.sessionMinutes) }
}

export function loadWinddownPreferences(): WinddownPreferences {
  try {
    const raw = localStorage.getItem(storageKey())
    return sanitize(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_WINDDOWN_PREFERENCES }
  }
}

export function saveWinddownPreferences(prefs: WinddownPreferences): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(prefs))
  } catch {
    // Storage unavailable (private mode); the in-memory preference still applies.
  }
}

export interface WinddownPreferencesController {
  preferences: WinddownPreferences
  setEnabled: (enabled: boolean) => void
  setSessionMinutes: (minutes: number) => void
}

export function useWinddownPreferences(): WinddownPreferencesController {
  const [preferences, setPreferences] = useState<WinddownPreferences>(() =>
    loadWinddownPreferences()
  )

  useEffect(() => {
    saveWinddownPreferences(preferences)
  }, [preferences])

  const setEnabled = useCallback((enabled: boolean) => {
    setPreferences((current) => ({ ...current, enabled }))
  }, [])

  const setSessionMinutes = useCallback((minutes: number) => {
    setPreferences((current) => ({ ...current, sessionMinutes: minutes }))
  }, [])

  return { preferences, setEnabled, setSessionMinutes }
}
