/**
 * Recording schema pack — local-first screen recording (exploration 0414).
 *
 * A `Recording` is a screencast: one immutable screen track, an optional
 * camera track, and — the load-bearing idea — an **edit decision list** rather
 * than an edited file. `cuts` names the spans playback skips; `chapters` names
 * the markers; `cameraLayout` says where the camera bubble sits. Nothing in
 * that list destroys the source, so "auto-edit" is a JSON write and undo is a
 * boolean flip (0414 §Options: EDL over destructive re-encode).
 *
 * Hard rule inherited from 0249/0279/0385: **video bytes never ride the change
 * log.** Tracks are content-addressed blob references; a 300 MB screencast is
 * chunked in BlobStore and the node carries only the CID. The transcript lives
 * in a sibling `RecordingTranscript` node so segment batching during
 * transcription never rewrites the recording node itself — the same split
 * `Meeting`/`MeetingTranscript` uses.
 *
 * Like `Meeting` and `Transcription`, a recording may contain anything on your
 * screen — `visibility` defaults to `private`.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, number, select, file, relation, json, checkbox } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const RECORDING_SCHEMA_IRI = 'xnet://xnet.fyi/Recording@1.0.0' as const
export const RECORDING_TRANSCRIPT_SCHEMA_IRI =
  'xnet://xnet.fyi/RecordingTranscript@1.0.0' as const

/**
 * Why a span was cut. `silence` and `filler` are machine proposals the user can
 * reject; `manual` is the user's own edit. The reason is kept so the cut
 * inspector can explain itself — an auto-editor that cannot say *why* it
 * removed a sentence is indistinguishable from data loss (0414 §Risks).
 */
export const CUT_REASONS = ['silence', 'filler', 'manual'] as const
export type CutReason = (typeof CUT_REASONS)[number]

/** One skipped span of the source timeline. */
export interface Cut {
  /** Start offset from recording start, in milliseconds. */
  startMs: number
  /** End offset from recording start, in milliseconds. */
  endMs: number
  /** What proposed this cut. */
  reason: CutReason
  /**
   * Disabled cuts stay in the list rather than being deleted, so restoring a
   * mis-cut is a toggle and the proposal history survives.
   */
  enabled: boolean
}

/** A timed chapter marker over the source timeline. */
export interface Chapter {
  /** Start offset from recording start, in milliseconds. */
  startMs: number
  /** Short title, LLM-proposed then user-editable. */
  title: string
  /** Optional one-line summary. */
  summary?: string
}

/** Where the camera bubble sits during playback. */
export const CAMERA_CORNERS = ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const
export type CameraCorner = (typeof CAMERA_CORNERS)[number]

export const CAMERA_SHAPES = ['circle', 'rounded', 'square'] as const
export type CameraShape = (typeof CAMERA_SHAPES)[number]

/**
 * Camera compositing is a *playback* property, not a record-time one — the
 * camera is captured to its own track so moving the bubble never re-renders
 * anything (0414 §Key Findings 2).
 */
export interface CameraLayout {
  corner: CameraCorner
  /** Bubble width as a fraction of the screen track's width (0–1). */
  size: number
  shape: CameraShape
  /** Spans where the camera is hidden entirely, e.g. during a demo. */
  hiddenSpans?: Array<{ startMs: number; endMs: number }>
}

/** The default bubble: small, bottom-left, circular — the Loom convention. */
export const DEFAULT_CAMERA_LAYOUT: CameraLayout = {
  corner: 'bottom-left',
  size: 0.18,
  shape: 'circle'
}

/**
 * How this recording's pixels were captured. Recorded on the node because it
 * explains the artifact's quality after the fact, and because a support report
 * that cannot say which rung produced a stuttering file is useless (0414 §2).
 */
export const CAPTURE_PATHS = [
  'screencapturekit-helper',
  'chromium-desktop-capturer',
  'display-media',
  'unknown'
] as const
export type CapturePathId = (typeof CAPTURE_PATHS)[number]

export const RecordingSchema = defineSchema({
  name: 'Recording',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Display title — defaults to a timestamp, renamed by the user or AI. */
    title: text({ required: true, maxLength: 500 }),

    /** Wall-clock start, epoch ms. */
    startedAt: number({ integer: true, min: 0 }),

    /** Source duration in milliseconds, before cuts. */
    durationMs: number({ integer: true, min: 0 }),

    /**
     * The screen track — a content-addressed blob reference. Immutable: edits
     * never rewrite it, they accumulate in `cuts`.
     */
    screenTrack: file({}),

    /** The camera track, when the user recorded one. Separate by design. */
    cameraTrack: file({}),

    /**
     * The edit. An array of `Cut`; playback skips the enabled ones and export
     * renders them out. Small structured data — syncs as ordinary LWW fields.
     */
    cuts: json<Cut[]>({}),

    /** Timed chapter markers. */
    chapters: json<Chapter[]>({}),

    /** Camera bubble placement, applied at playback/export time. */
    cameraLayout: json<CameraLayout>({}),

    /** The sibling transcript node (one per recording). */
    transcript: relation({ target: RECORDING_TRANSCRIPT_SCHEMA_IRI }),

    /** Which capture rung produced the tracks. */
    capturePath: select({
      options: [
        { id: 'screencapturekit-helper', name: 'ScreenCaptureKit helper' },
        { id: 'chromium-desktop-capturer', name: 'Chromium desktopCapturer' },
        { id: 'display-media', name: 'Browser getDisplayMedia' },
        { id: 'unknown', name: 'Unknown' }
      ] as const,
      default: 'unknown'
    }),

    /** Pixel dimensions of the screen track, when known. */
    width: number({ integer: true, min: 0 }),
    height: number({ integer: true, min: 0 }),

    /**
     * True when capture stopped for a reason other than the user asking —
     * a full disk, a helper crash, a revoked permission. A truncated recording
     * is NOT a completed one and must never render as an ordinary result
     * (root AGENTS.md: "a truncated run is not a completed one").
     */
    truncated: checkbox({ default: false }),

    /** Why it was truncated, when it was — shown verbatim in the UI. */
    truncationReason: text({ maxLength: 500 }),

    /** Canonical home; empty = Unfiled (exploration 0169). */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Workspace-wide labels, referenced by id (exploration 0169). */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Order among siblings — fractional index. */
    sortKey: text({ maxLength: 500 }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179). */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /**
     * Per-node visibility. Defaults to `private` — a screen recording may show
     * anything that was on screen, and must never reach a public surface by
     * accident (0414, same posture as Meeting/Transcription).
     */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'private'
    })
  },
  document: 'yjs', // description / notes body, Page-like
  authorization: spaceCascadeAuthorization()
})

/**
 * One timed slice of a recording transcript. Unlike `MeetingSegment` there is
 * no `channel` — a screencast has one narrator — but `words` carries
 * word-level timings when the engine provides them, which is what
 * transcript-as-timeline editing and filler-word cutting both need.
 */
export interface RecordingSegment {
  text: string
  startMs: number
  endMs: number
  /** Word-level timings, when the engine emits them. */
  words?: Array<{ text: string; startMs: number; endMs: number }>
}

export const RecordingTranscriptSchema = defineSchema({
  name: 'RecordingTranscript',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The recording this transcript belongs to. */
    recording: relation({ target: RECORDING_SCHEMA_IRI, required: true }),

    /** Concatenated text — FTS-indexed so recordings are searchable. */
    fullText: text({}),

    /** Timed segments over the SOURCE timeline (pre-cut offsets). */
    segments: json<RecordingSegment[]>({}),

    /** Detected/used language (BCP-47-ish, e.g. "en"), when known. */
    language: text({ maxLength: 16 }),

    /** Which engine produced this, e.g. "parakeet-sherpa" | "whisper-cpp". */
    engineId: text({ maxLength: 120 }),

    /** Which model produced this, e.g. "parakeet-tdt-0.6b-v2". */
    modelId: text({ maxLength: 200 }),

    /**
     * Whether the engine preserves disfluencies. Filler-word cutting is only
     * offered when this is true — a "remove filler words" button over a
     * transcript that never contained them would silently do nothing
     * (0414 §Key Findings 4).
     */
    verbatim: checkbox({ default: false }),

    /** Length of the transcribed audio in milliseconds. */
    durationMs: number({ integer: true, min: 0 }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179). */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility. Defaults to `private`, like the recording itself. */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'private'
    })
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

/** A Recording node type (inferred from schema). */
export type Recording = InferNode<(typeof RecordingSchema)['_properties']>

/** A RecordingTranscript node type (inferred from schema). */
export type RecordingTranscript = InferNode<(typeof RecordingTranscriptSchema)['_properties']>
