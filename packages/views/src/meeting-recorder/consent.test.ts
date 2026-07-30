/**
 * Consent/retention persistence tests (exploration 0279, phase 3): defaults
 * without storage, round-trips, forward-compatible merging, and corrupt-value
 * hardening. Policy semantics themselves are tested in @xnetjs/meetings.
 */

import { DEFAULT_CONSENT_SETTINGS, consentAnnouncement } from '@xnetjs/meetings'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MEETINGS_CONSENT_STORAGE_KEY,
  readMeetingConsentSettings,
  writeMeetingConsentSettings
} from './consent'

afterEach(() => {
  window.localStorage.removeItem(MEETINGS_CONSENT_STORAGE_KEY)
})

describe('meeting consent settings persistence', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(readMeetingConsentSettings()).toEqual(DEFAULT_CONSENT_SETTINGS)
    // The privacy norm: audio retention defaults OFF.
    expect(readMeetingConsentSettings().retainAudio).toBe(false)
  })

  it('round-trips a write', () => {
    writeMeetingConsentSettings({
      autoConsentMessage: true,
      consentMessageText: 'Recording for notes!',
      transcriptRetentionDays: 30,
      retainAudio: true
    })
    const settings = readMeetingConsentSettings()
    expect(settings.autoConsentMessage).toBe(true)
    expect(settings.consentMessageText).toBe('Recording for notes!')
    expect(settings.transcriptRetentionDays).toBe(30)
    expect(settings.retainAudio).toBe(true)
    expect(consentAnnouncement(settings)).toBe('Recording for notes!')
  })

  it('merges partial stored JSON over the defaults (forward compatibility)', () => {
    window.localStorage.setItem(
      MEETINGS_CONSENT_STORAGE_KEY,
      JSON.stringify({ autoConsentMessage: true })
    )
    const settings = readMeetingConsentSettings()
    expect(settings.autoConsentMessage).toBe(true)
    expect(settings.consentMessageText).toBe(DEFAULT_CONSENT_SETTINGS.consentMessageText)
    expect(settings.transcriptRetentionDays).toBe(0)
  })

  it('survives corrupt JSON and bogus retention values', () => {
    window.localStorage.setItem(MEETINGS_CONSENT_STORAGE_KEY, '{not json')
    expect(readMeetingConsentSettings()).toEqual(DEFAULT_CONSENT_SETTINGS)

    window.localStorage.setItem(
      MEETINGS_CONSENT_STORAGE_KEY,
      JSON.stringify({ transcriptRetentionDays: 'forever' })
    )
    expect(readMeetingConsentSettings().transcriptRetentionDays).toBe(0)

    window.localStorage.setItem(
      MEETINGS_CONSENT_STORAGE_KEY,
      JSON.stringify({ transcriptRetentionDays: -5 })
    )
    expect(readMeetingConsentSettings().transcriptRetentionDays).toBe(0)
  })
})
