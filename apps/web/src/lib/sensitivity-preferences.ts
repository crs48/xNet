/**
 * Viewer-local NSFW / sensitive-content preferences (exploration 0175).
 *
 * The filter dial is inherently per-viewer and per-device, so it lives in
 * localStorage (Bluesky stores content-label prefs per client too). The shape
 * and the visibility math come from `@xnetjs/abuse`; this module only persists
 * the dial and exposes a hook.
 */
import {
  DEFAULT_SENSITIVITY_PREFERENCES,
  SENSITIVITY_LABEL_VALUES,
  type SensitivityLabelValue,
  type SensitivityPreference,
  type UserSensitivityPreferences
} from '@xnetjs/abuse'
import { useCallback, useEffect, useState } from 'react'

function storageKey(): string {
  const scope = (globalThis as { __XNET_STORAGE_SCOPE__?: string }).__XNET_STORAGE_SCOPE__
  return scope ? `xnet:sensitivity-prefs:${scope}` : 'xnet:sensitivity-prefs'
}

function sanitize(parsed: unknown): UserSensitivityPreferences {
  if (typeof parsed !== 'object' || parsed === null) {
    return { ...DEFAULT_SENSITIVITY_PREFERENCES, labels: {} }
  }
  const raw = parsed as Partial<UserSensitivityPreferences>
  const labels: Partial<Record<SensitivityLabelValue, SensitivityPreference>> = {}
  for (const value of SENSITIVITY_LABEL_VALUES) {
    const pref = raw.labels?.[value]
    if (pref === 'show' || pref === 'warn' || pref === 'blur' || pref === 'hide') {
      labels[value] = pref
    }
  }
  return {
    adultContentEnabled: raw.adultContentEnabled === true,
    ageConfirmed: raw.ageConfirmed === true,
    blurUnsolicitedMedia: raw.blurUnsolicitedMedia ?? true,
    labels
  }
}

export function loadSensitivityPreferences(): UserSensitivityPreferences {
  try {
    const raw = localStorage.getItem(storageKey())
    return sanitize(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_SENSITIVITY_PREFERENCES, labels: {} }
  }
}

export function saveSensitivityPreferences(preferences: UserSensitivityPreferences): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(preferences))
  } catch {
    // Storage unavailable (private mode); the in-memory dial still applies.
  }
}

export interface SensitivityPreferencesController {
  preferences: UserSensitivityPreferences
  setLabelPreference: (value: SensitivityLabelValue, pref: SensitivityPreference) => void
  setAdultContentEnabled: (enabled: boolean) => void
  confirmAge: () => void
  setBlurUnsolicitedMedia: (blur: boolean) => void
}

export function useSensitivityPreferences(): SensitivityPreferencesController {
  const [preferences, setPreferences] = useState<UserSensitivityPreferences>(() =>
    loadSensitivityPreferences()
  )

  useEffect(() => {
    saveSensitivityPreferences(preferences)
  }, [preferences])

  const setLabelPreference = useCallback(
    (value: SensitivityLabelValue, pref: SensitivityPreference) => {
      setPreferences((current) => ({
        ...current,
        labels: { ...current.labels, [value]: pref }
      }))
    },
    []
  )

  const setAdultContentEnabled = useCallback((enabled: boolean) => {
    setPreferences((current) => ({
      ...current,
      // Enabling adult content requires a confirmed age; disabling is always allowed.
      adultContentEnabled: enabled && current.ageConfirmed
    }))
  }, [])

  const confirmAge = useCallback(() => {
    setPreferences((current) => ({ ...current, ageConfirmed: true }))
  }, [])

  const setBlurUnsolicitedMedia = useCallback((blur: boolean) => {
    setPreferences((current) => ({ ...current, blurUnsolicitedMedia: blur }))
  }, [])

  return {
    preferences,
    setLabelPreference,
    setAdultContentEnabled,
    confirmAge,
    setBlurUnsolicitedMedia
  }
}
