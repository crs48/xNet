/**
 * `@xnetjs/dictation` — provider-agnostic, on-device speech-to-text.
 *
 * Pure logic only: the `DictationEngine` port, a hold-to-talk state machine,
 * transcript-history/retention helpers, and two engines that need no native
 * code (a scripted fake, and a "bring your own" OpenAI-compatible HTTP engine).
 *
 * Platform-native engines (whisper.cpp, NVIDIA Parakeet via sherpa-onnx /
 * FluidAudio, Apple `SpeechAnalyzer`) live in the apps and implement the same
 * port. See docs/explorations/0192.
 */

export {
  audioDurationMs,
  type AudioInput,
  type DictationEngine,
  type EngineDescriptor,
  type ModelDownloadProgress,
  type TranscribeOptions,
  type TranscriptResult,
  type TranscriptSegment,
  type TranscriptionSource
} from './types'

export {
  DEFAULT_DICTATION_CONFIG,
  DictationMachine,
  dictationReducer,
  holdDurationMs,
  initialDictationState,
  isBusy,
  isListening,
  type DictationConfig,
  type DictationEvent,
  type DictationState,
  type DictationStatus
} from './state-machine'

export {
  applyRetention,
  transcriptsToPrune,
  type Retainable,
  type RetentionPolicy,
  type RetentionResult
} from './retention'

export {
  buildTranscriptionFields,
  isEmptyTranscript,
  joinSegments,
  normalizeTranscriptText,
  type TranscriptionFields
} from './transcript'

export { EngineRegistry } from './registry'

export { FakeDictationEngine, type FakeEngineOptions } from './engines/fake'
export { ByoEndpointEngine, isLoopbackUrl, type ByoEndpointConfig } from './engines/byo'
