/**
 * Video transcripts for imported social content (exploration 0419).
 */

export {
  enrichmentStatusForTranscriptOutcome,
  isRetryableTranscriptStatus,
  type TranscriptCue,
  type TranscriptFetchOutcome,
  type TranscriptFetchStatus,
  type TranscriptFetcher,
  type TranscriptTarget
} from './types'

export {
  createYouTubeTranscriptFetcher,
  parseYouTubeJson3Transcript,
  parseYouTubeTranscript,
  parseYouTubeXmlTranscript,
  youTubeTimedTextUrl,
  type YouTubeTimedTextFormat,
  type YouTubeTranscriptFetcherOptions
} from './youtube'

export {
  createSocialTranscriptId,
  createTranscriptContentDrafts,
  segmentTranscript,
  transcriptText,
  TRANSCRIPT_SEGMENT_MAX_CHARS,
  type TranscriptContentDraft,
  type TranscriptContentDraftInput,
  type TranscriptSegment
} from './nodes'

export {
  describeTranscriptRun,
  summarizeTranscriptRun,
  transcriptStateForEnrichmentStatus,
  transcriptStateForOutcome,
  TRANSCRIPT_TARGET_STATES,
  type TranscriptRunSummary,
  type TranscriptTargetState
} from './states'

export {
  runTranscriptFetchPass,
  DEFAULT_MAX_CONSECUTIVE_BLOCKS,
  DEFAULT_TRANSCRIPT_INTERVAL_MS,
  DEFAULT_TRANSCRIPT_JITTER_MS,
  type TranscriptPassOptions,
  type TranscriptPassResult
} from './schedule'
