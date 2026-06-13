/**
 * Content-dial presets (exploration 0176) — the one-screen onboarding choice.
 *
 * Rather than make a new user configure four per-label dials up front, offer
 * four presets that map onto `UserSensitivityPreferences`. "Custom" leaves the
 * existing per-label settings untouched (the user tunes them in settings later).
 */
import { DEFAULT_SENSITIVITY_PREFERENCES, type UserSensitivityPreferences } from '@xnetjs/abuse'

export type ContentDialPreset = 'family' | 'standard' | 'adult' | 'custom'

export const CONTENT_DIAL_PRESETS: { id: ContentDialPreset; name: string; description: string }[] =
  [
    { id: 'family', name: 'Family friendly', description: 'Hide all sensitive content.' },
    { id: 'standard', name: 'Standard', description: 'Blur sensitive content; tap to reveal.' },
    { id: 'adult', name: 'Adult', description: 'Show everything (18+).' },
    { id: 'custom', name: 'Custom', description: 'Tune each category yourself in settings.' }
  ]

/**
 * Apply a preset on top of the viewer's current preferences. `ageConfirmed`
 * carries through; only `adult` requires it and only `adult` enables adult content.
 */
export function applyContentDialPreset(
  preset: ContentDialPreset,
  current: UserSensitivityPreferences = DEFAULT_SENSITIVITY_PREFERENCES
): UserSensitivityPreferences {
  switch (preset) {
    case 'family':
      return {
        ...current,
        adultContentEnabled: false,
        labels: { sexual: 'hide', nudity: 'hide', porn: 'hide', 'graphic-media': 'hide' }
      }
    case 'standard':
      return {
        ...current,
        adultContentEnabled: false,
        labels: { sexual: 'blur', nudity: 'blur', porn: 'hide', 'graphic-media': 'blur' }
      }
    case 'adult':
      return {
        ...current,
        adultContentEnabled: current.ageConfirmed,
        labels: { sexual: 'show', nudity: 'show', porn: 'warn', 'graphic-media': 'warn' }
      }
    case 'custom':
      return current
  }
}
