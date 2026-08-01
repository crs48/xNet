/**
 * Turning a finished capture into nodes (exploration 0414, phase 1).
 *
 * Two rules shape this module:
 *
 * 1. **The node exists before transcription.** A recording is a usable artifact
 *    the moment capture stops; blocking its creation on an AI step would make
 *    a model outage look like data loss.
 * 2. **A truncated capture is never presented as a finished one.** If the
 *    helper died, the disk filled, or the browser's own stop button ended the
 *    share, `truncated` is set and the reason is carried verbatim onto the
 *    node (root AGENTS.md: "a truncated run is not a completed one").
 */

import type { CapturePathId, Cut, CameraLayout } from '@xnetjs/data'
import { DEFAULT_CAMERA_LAYOUT } from '@xnetjs/data'

/** What a capture rung hands back, whichever rung it was. */
export interface CaptureOutcome {
  durationMs: number
  width: number
  height: number
  capturePath: CapturePathId
  truncated: boolean
  truncationReason: string | null
  droppedFrames?: number
}

/** The fields a new `Recording` node is created with. */
export interface RecordingDraft {
  title: string
  startedAt: number
  durationMs: number
  width: number
  height: number
  capturePath: CapturePathId
  cuts: Cut[]
  chapters: never[]
  cameraLayout: CameraLayout
  truncated: boolean
  truncationReason: string
  visibility: 'private'
}

/** `Screen recording, 14 Mar 2026 at 10:42` — renamed by the user or the AI. */
export function defaultRecordingTitle(startedAt: number, locale?: string): string {
  const date = new Date(startedAt)
  const formatted = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
  return `Screen recording, ${formatted}`
}

/**
 * Build the node fields for a finished capture.
 *
 * A dropped-frame burst is surfaced as a truncation *reason* only when the
 * capture also ended early; on its own it is a quality note, not a failure,
 * and overstating it would train users to ignore the flag that matters.
 */
export function buildRecordingDraft(
  outcome: CaptureOutcome,
  startedAt: number,
  options: { title?: string; locale?: string } = {}
): RecordingDraft {
  return {
    title: options.title?.trim() || defaultRecordingTitle(startedAt, options.locale),
    startedAt,
    durationMs: Math.max(0, outcome.durationMs),
    width: outcome.width,
    height: outcome.height,
    capturePath: outcome.capturePath,
    cuts: [],
    chapters: [],
    cameraLayout: DEFAULT_CAMERA_LAYOUT,
    truncated: outcome.truncated,
    // An empty string, not a plausible-sounding placeholder: a reader must be
    // able to tell "not truncated" from "truncated for an unknown reason".
    truncationReason: outcome.truncated
      ? (outcome.truncationReason ?? 'Recording ended unexpectedly.')
      : '',
    visibility: 'private'
  }
}

/** One sentence for the UI when a recording did not finish cleanly. */
export function truncationNotice(
  draft: Pick<RecordingDraft, 'truncated' | 'truncationReason'>
): string | null {
  if (!draft.truncated) return null
  return `This recording is incomplete: ${draft.truncationReason} What was captured before it stopped has been kept.`
}
