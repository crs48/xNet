import { describeCapabilities, isSystemAudioAllowed } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { detectCaptureCapability } from './capture/capabilities'
import { DEFAULT_CONSENT_SETTINGS, consentAnnouncement, isTranscriptExpired } from './consent'
import { meetingsFeatureModule } from './module'

describe('meetingsFeatureModule', () => {
  it('declares writes to exactly the two meeting schemas plus systemAudio', () => {
    expect(meetingsFeatureModule.capabilities?.schemaWrite).toEqual([
      'xnet://xnet.fyi/Meeting@1.0.0',
      'xnet://xnet.fyi/MeetingTranscript@1.0.0'
    ])
    expect(isSystemAudioAllowed(meetingsFeatureModule.capabilities)).toBe(true)
  })

  it('renders the system-audio grant as a danger consent line', () => {
    const lines = describeCapabilities(meetingsFeatureModule.capabilities)
    const audioLine = lines.find((l) => l.text.includes('system audio'))
    expect(audioLine).toBeDefined()
    expect(audioLine?.danger).toBe(true)
  })
})

describe('detectCaptureCapability', () => {
  it('maps platforms to their honest capture tier', () => {
    expect(detectCaptureCapability({ isElectron: true, electronSystemAudio: true }).tier).toBe(
      'system-audio'
    )
    expect(detectCaptureCapability({ isElectron: true, electronSystemAudio: false }).tier).toBe(
      'mic-only'
    )
    expect(detectCaptureCapability({ displayMediaAudio: true }).tier).toBe('tab-audio')
    expect(detectCaptureCapability({}).tier).toBe('mic-only')
    expect(detectCaptureCapability({ isMobile: true }).tier).toBe('mic-only')
  })

  it('always explains the scope in the message', () => {
    for (const hints of [{}, { isElectron: true }, { displayMediaAudio: true }]) {
      expect(detectCaptureCapability(hints).scopeMessage.length).toBeGreaterThan(20)
    }
  })
})

describe('consent + retention', () => {
  it('is silent by default and announces only when enabled', () => {
    expect(consentAnnouncement(DEFAULT_CONSENT_SETTINGS)).toBeNull()
    expect(
      consentAnnouncement({ ...DEFAULT_CONSENT_SETTINGS, autoConsentMessage: true })
    ).toContain('AI transcription')
    // Blank custom text falls back to the default wording, not an empty announce.
    expect(
      consentAnnouncement({
        ...DEFAULT_CONSENT_SETTINGS,
        autoConsentMessage: true,
        consentMessageText: '  '
      })
    ).toContain('AI transcription')
  })

  it('0-day retention keeps transcripts forever; N-day expires after N days', () => {
    const day = 24 * 60 * 60 * 1000
    expect(isTranscriptExpired(DEFAULT_CONSENT_SETTINGS, 0, 365 * day)).toBe(false)
    const weekly = { ...DEFAULT_CONSENT_SETTINGS, transcriptRetentionDays: 7 }
    expect(isTranscriptExpired(weekly, 0, 6 * day)).toBe(false)
    expect(isTranscriptExpired(weekly, 0, 8 * day)).toBe(true)
  })

  it('never retains audio by default', () => {
    expect(DEFAULT_CONSENT_SETTINGS.retainAudio).toBe(false)
  })
})
