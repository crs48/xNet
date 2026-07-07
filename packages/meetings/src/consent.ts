/**
 * Recording consent + retention settings (exploration 0279, phase 3).
 *
 * Botless capture means no platform plays a "recording started" announcement —
 * so consent is on us. These settings gate two behaviours the recorder UI and
 * persistence layer enforce:
 *
 * - `autoConsentMessage`: a message the user can paste (or the app can send,
 *   where an integration exists) into the meeting chat when capture starts —
 *   the Notion enterprise pattern.
 * - `transcriptRetentionDays`: automatic transcript deletion schedule; 0 (the
 *   default) keeps transcripts until the user deletes them.
 * - `retainAudio`: audio is NEVER persisted unless this is true (the 0279/0192
 *   privacy norm) — and even then only as a BlobStore CID, never change-log
 *   payload.
 */

export interface MeetingConsentSettings {
  /** Announce capture in the meeting chat when it starts. Default false. */
  autoConsentMessage: boolean
  /** The announcement text, when enabled. */
  consentMessageText: string
  /** Days to keep transcripts; 0 = keep forever. Default 0. */
  transcriptRetentionDays: number
  /** Opt-in: keep the source audio as a content-addressed blob. Default false. */
  retainAudio: boolean
}

export const DEFAULT_CONSENT_SETTINGS: MeetingConsentSettings = {
  autoConsentMessage: false,
  consentMessageText: 'Heads up: I am taking notes with an AI transcription tool for this meeting.',
  transcriptRetentionDays: 0,
  retainAudio: false
}

/** The consent message to announce at capture start, or null when disabled. */
export function consentAnnouncement(settings: MeetingConsentSettings): string | null {
  if (!settings.autoConsentMessage) return null
  const text = settings.consentMessageText.trim()
  return text.length > 0 ? text : DEFAULT_CONSENT_SETTINGS.consentMessageText
}

/**
 * Whether a transcript created at `createdAt` has outlived the retention
 * schedule at `now` (both epoch ms). 0-day retention never expires.
 */
export function isTranscriptExpired(
  settings: MeetingConsentSettings,
  createdAt: number,
  now: number
): boolean {
  if (settings.transcriptRetentionDays <= 0) return false
  return now - createdAt > settings.transcriptRetentionDays * 24 * 60 * 60 * 1000
}
