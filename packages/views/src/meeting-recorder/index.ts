/**
 * Meeting recorder sub-barrel (exploration 0279; sub-barrel policy 0276).
 * The shared botless-meeting surfaces both apps consume: capture glue
 * (IPC/BYO engine registry, mic + system-audio PCM pipelines), the recorder
 * view core, the list/detail cores, and the engine settings panel.
 */

export {
  getMeetingsBridge,
  type MeetingsBridge,
  type MeetingsBridgeEngine,
  type MeetingsCaptureStatus,
  type MeetingsPermissionState,
  type MeetingsPermissions,
  type MeetingsSystemAudioPath
} from './capture/bridge.js'
export {
  describeCapturePreflight,
  getCapturePreflight,
  type CapturePreflight
} from './capture/preflight.js'
export { IpcDictationEngine } from './capture/ipc-engine.js'
export {
  MEETING_SAMPLE_RATE,
  PcmRing,
  encodeWavPcm16,
  mixToMono,
  resamplePcm
} from './capture/pcm.js'
export {
  MEETINGS_STORAGE_KEYS,
  PcmToWavEngine,
  buildMeetingEngineRegistry,
  readMeetingEnginePrefs,
  writeMeetingEnginePref,
  type BuildMeetingEngineRegistryOptions,
  type MeetingEnginePrefs
} from './capture/registry.js'
export {
  startMicCapture,
  startSystemCapture,
  type CaptureHandle,
  type PcmSink
} from './capture/audio.js'
export {
  appendAiNotesToDoc,
  appendMarkdownToDoc,
  extractDocText,
  parseEnhancedMarkdown,
  type AppendMarkdownOptions
} from './enhance-append.js'
export {
  MEETINGS_CONSENT_STORAGE_KEY,
  readMeetingConsentSettings,
  writeMeetingConsentSettings
} from './consent.js'
export { MeetingRecorderView, type MeetingRecorderViewProps } from './MeetingRecorderView.js'
export {
  MeetingDetailView,
  MeetingsListView,
  type MeetingDetailViewProps,
  type MeetingsListViewProps
} from './MeetingsSurface.js'
export { MeetingTranscriptChat, type MeetingTranscriptChatProps } from './MeetingTranscriptChat.js'
export { MeetingEngineSettings } from './MeetingEngineSettings.js'
