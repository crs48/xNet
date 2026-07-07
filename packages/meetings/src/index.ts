/**
 * @xnetjs/meetings — botless meeting transcription + AI notes (exploration
 * 0279). Platform-agnostic core: the capture session (VAD chunking, Me/Them
 * channel attribution, batched transcript upserts), swappable-engine selection
 * over `@xnetjs/dictation`, capture-tier detection, consent/retention policy,
 * and the enhancement/template/chat logic. Platforms (Electron, web, mobile)
 * own the actual audio plumbing and push PCM in.
 */

export { MEETINGS_MODULE_ID, meetingsFeatureModule } from './module'

export { VadChunker, type VadChunk, type VadOptions } from './capture/vad'
export {
  SegmentBatcher,
  type TranscriptSnapshot,
  type SegmentBatcherOptions
} from './capture/segment-batcher'
export {
  MeetingCaptureSession,
  meetingSessionReducer,
  initialMeetingSessionState,
  type MeetingCaptureOptions,
  type MeetingSessionState,
  type MeetingSessionStatus,
  type MeetingSessionEvent
} from './capture/session'
export {
  detectCaptureCapability,
  type CaptureTier,
  type CapturePlatformHints,
  type CaptureCapability
} from './capture/capabilities'

export { selectEngine, type EngineSelection } from './engines/select'

export {
  MEETING_TEMPLATES,
  listTemplates,
  resolveTemplate,
  type MeetingTemplate
} from './enhance/templates'
export {
  buildEnhanceMessages,
  streamEnhancedNotes,
  enhanceNotes,
  formatTranscript,
  type EnhanceNotesRequest
} from './enhance/enhance-notes'
export {
  buildTranscriptChatMessages,
  streamTranscriptChat,
  type TranscriptChatContext
} from './enhance/chat'
export { polishTranscript, type RetainedChannelAudio, type PolishResult } from './enhance/polish'

export {
  DEFAULT_CONSENT_SETTINGS,
  consentAnnouncement,
  isTranscriptExpired,
  type MeetingConsentSettings
} from './consent'
