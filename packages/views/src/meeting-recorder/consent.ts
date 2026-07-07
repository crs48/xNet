/**
 * Consent + retention preference persistence (exploration 0279, phase 3).
 *
 * The policy semantics live in `@xnetjs/meetings` (`MeetingConsentSettings`,
 * `consentAnnouncement`, `isTranscriptExpired`); this module only persists the
 * user's choices — localStorage JSON under `xnet:meetings:consent`, merged
 * over `DEFAULT_CONSENT_SETTINGS` so new fields pick up their defaults, the
 * same device-level-pref pattern as the engine settings.
 */

import { DEFAULT_CONSENT_SETTINGS, type MeetingConsentSettings } from '@xnetjs/meetings'

/** localStorage key for the consent/retention settings JSON. */
export const MEETINGS_CONSENT_STORAGE_KEY = 'xnet:meetings:consent'

export function readMeetingConsentSettings(): MeetingConsentSettings {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_CONSENT_SETTINGS
  try {
    const raw = window.localStorage.getItem(MEETINGS_CONSENT_STORAGE_KEY)
    if (!raw) return DEFAULT_CONSENT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<MeetingConsentSettings>
    return {
      ...DEFAULT_CONSENT_SETTINGS,
      ...parsed,
      // Clamp what arithmetic depends on — a corrupt value must not turn
      // retention into NaN comparisons.
      transcriptRetentionDays:
        typeof parsed.transcriptRetentionDays === 'number' &&
        Number.isFinite(parsed.transcriptRetentionDays)
          ? Math.max(0, Math.floor(parsed.transcriptRetentionDays))
          : DEFAULT_CONSENT_SETTINGS.transcriptRetentionDays
    }
  } catch {
    return DEFAULT_CONSENT_SETTINGS
  }
}

export function writeMeetingConsentSettings(settings: MeetingConsentSettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(MEETINGS_CONSENT_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Silent fail (incognito, quota) — defaults still apply next read.
  }
}
