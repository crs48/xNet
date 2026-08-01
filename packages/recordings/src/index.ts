/**
 * @xnetjs/recordings — local-first screen recording core (exploration 0414).
 *
 * Pure, platform-agnostic logic. Capture itself is platform code (the Electron
 * `xnet-screencap` helper, the Chromium fallback, a browser tab); nothing here
 * ever touches a frame. What lives here is everything that decides what the
 * viewer sees: the edit decision list, the auto-edit proposers, caption and
 * chapter generation, camera-layout maths, and the resumable-upload manifest.
 */

export {
  activeCuts,
  addManualCut,
  cutAt,
  editedDurationMs,
  editedToSource,
  keptSpans,
  nextPlayheadMs,
  removedMs,
  restoreAll,
  sourceToEdited,
  summarizeCuts,
  toggleCut,
  type CutSummary,
  type Span
} from './edl/edl'

export { proposeSilenceCuts, type SilenceTrimOptions, type SpeechSpan } from './auto-edit/silence'
export {
  DEFAULT_FILLER_WORDS,
  proposeFillerCuts,
  type FillerCutOptions,
  type FillerCutResult
} from './auto-edit/filler'

export {
  CAPTURE_PATH_RANK,
  detectVideoCapability,
  isBetterPath,
  type VideoCapturePath,
  type VideoCaptureCapability,
  type VideoCaptureHints
} from './capture/capabilities'

export { formatVttTimestamp, segmentsToCues, toWebVtt, type VttCue } from './captions/vtt'

export {
  buildChapterMessages,
  CHAPTERS_SYSTEM_PROMPT,
  formatClock,
  formatTimedTranscript,
  generateChapters,
  parseChapters,
  parseClock,
  type ParseChaptersResult
} from './chapters/chapters'

export {
  bubbleRect,
  bubbleStyle,
  isCameraHidden,
  type BubbleRect,
  type StageSize
} from './camera/layout'

export {
  planUpload,
  resumeUpload,
  uploadFraction,
  UPLOAD_CHUNK_SIZE,
  type ChunkPlan,
  type DigestFn,
  type UploadFailureReason,
  type UploadManifest,
  type UploadProgress
} from './upload/manifest'

export {
  engineIsVerbatim,
  toRecordingSegments,
  transcribeRecording,
  type TranscribeChunk,
  type TranscribeRecordingOptions,
  type TranscribeRecordingResult
} from './transcribe/transcribe'
