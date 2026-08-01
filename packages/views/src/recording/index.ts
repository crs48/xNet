/**
 * Screen recording surface (exploration 0414) — recorder, player, and the
 * three editing panes. Pure logic lives in `@xnetjs/recordings`; this area is
 * the React shell plus the browser-side capture plumbing.
 */

export { RecordingRecorderView, type RecordingRecorderViewProps } from './RecordingRecorderView'
export { RecordingPlayer, type RecordingPlayerProps } from './RecordingPlayer'
export { CutInspector, describeCuts, type CutInspectorProps } from './CutInspector'
export {
  TranscriptTimeline,
  flattenWords,
  type TranscriptTimelineProps
} from './TranscriptTimeline'
export { ChapterList, type ChapterListProps } from './ChapterList'

export {
  buildRecordingDraft,
  defaultRecordingTitle,
  truncationNotice,
  type CaptureOutcome,
  type RecordingDraft
} from './create-recording'

export {
  getRecordingsBridge,
  type RecordingsBridge,
  type RecordingCaptureStatus,
  type RecordingPermissions,
  type RecordingPermissionState,
  type RecordingStartResult,
  type RecordingStopResult
} from './capture/bridge'
export {
  startBrowserCapture,
  pickMimeType,
  type BrowserCaptureHandle,
  type BrowserCaptureOptions,
  type BrowserCaptureResult
} from './capture/browser-capture'
export {
  evaluatePreflight,
  scopeSentence,
  LOW_DISK_BYTES,
  type Preflight,
  type PreflightInput,
  type PreflightNotice,
  type PreflightSeverity
} from './capture/preflight'
