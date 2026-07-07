/**
 * Meeting schema pack — botless meeting notes + transcript (exploration 0279).
 *
 * A `Meeting` is the container: metadata plus a collaborative Y.Doc notes body
 * (the user's rough bullets during the call, merged with AI-enhanced output
 * afterwards — Page-like). Its transcript lives in a sibling
 * `MeetingTranscript` node so the high-churn segment batching during a live
 * meeting never rewrites the meeting node itself, and the notes Y.Doc and the
 * transcript can sync/update on independent cadences.
 *
 * Hard rule from 0249/0279: **audio bytes never ride the change log.** The
 * transcript node stores text (FTS-searchable) and timed segments; source
 * audio is an optional content-addressed blob reference, off by default —
 * the same privacy posture as `Transcription` (0192).
 *
 * Like `Transcription` and `Metric`, meetings are sensitive — `visibility`
 * defaults to `private` so a meeting never leaks to a public surface by
 * accident.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, number, select, file, relation, json } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const MEETING_SCHEMA_IRI = 'xnet://xnet.fyi/Meeting@1.0.0' as const
export const MEETING_TRANSCRIPT_SCHEMA_IRI = 'xnet://xnet.fyi/MeetingTranscript@1.0.0' as const

/**
 * Speaker attribution channel (the Granola trick): the microphone stream is
 * `me`, the system-audio stream is `them`. Everyone on the far end collapses
 * into `them` until a diarization upgrade splits that channel.
 */
export const MEETING_CHANNELS = ['me', 'them'] as const
export type MeetingChannel = (typeof MEETING_CHANNELS)[number]

/** One timed, channel-attributed slice of a meeting transcript. */
export interface MeetingSegment {
  /** Which capture channel produced this slice. */
  channel: MeetingChannel
  /** Transcribed text for the slice. */
  text: string
  /** Start offset from meeting start, in milliseconds. */
  startMs: number
  /** End offset from meeting start, in milliseconds. */
  endMs: number
  /**
   * Optional speaker label once diarization/calendar attribution upgrades
   * `them` into named speakers (phase 4). Absent = channel label only.
   */
  speaker?: string
}

/** Built-in enhancement template ids (phase 2); free-form ids are allowed. */
export const MEETING_TEMPLATE_IDS = ['generic', '1on1', 'standup', 'sales', 'interview'] as const
export type MeetingTemplateId = (typeof MEETING_TEMPLATE_IDS)[number]

export const MeetingSchema = defineSchema({
  name: 'Meeting',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Meeting title — from the calendar event when available. */
    title: text({ required: true, maxLength: 500 }),

    /** Wall-clock start, epoch ms. */
    startedAt: number({ integer: true, min: 0 }),

    /** Total captured duration in milliseconds. */
    durationMs: number({ integer: true, min: 0 }),

    /** Enhancement template shaping the AI notes, e.g. "1on1" | "standup". */
    templateId: text({ maxLength: 120 }),

    /** The sibling transcript node (one per meeting). */
    transcript: relation({ target: MEETING_TRANSCRIPT_SCHEMA_IRI }),

    /** Calendar event this meeting came from, when detected (phase 4). */
    calendarEventId: text({ maxLength: 300 }),

    /** Attendee display names from the calendar, for context + attribution. */
    attendees: json<string[]>({}),

    /** Canonical home; empty = Unfiled (exploration 0169). */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Workspace-wide labels, referenced by id (exploration 0169). */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Order among siblings — fractional index. */
    sortKey: text({ maxLength: 500 }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179). */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /**
     * Per-node visibility. Defaults to `private` — a meeting may contain
     * anything, and must never leak to a public surface by accident (0279).
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
  document: 'yjs', // notes body — user bullets + AI-enhanced output
  // Owner-only by default; inherits access from its home Space when filed into
  // one — same model as Transcription/Metric (explorations 0181/0192).
  authorization: spaceCascadeAuthorization()
})

export const MeetingTranscriptSchema = defineSchema({
  name: 'MeetingTranscript',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The meeting this transcript belongs to. */
    meeting: relation({ target: MEETING_SCHEMA_IRI, required: true }),

    /**
     * Concatenated transcript text — FTS-indexed so meetings are searchable.
     * Rebuilt from `segments` on each batched upsert.
     */
    fullText: text({}),

    /** Timed, channel-attributed segments (me | them). */
    segments: json<MeetingSegment[]>({}),

    /** Detected/used language (BCP-47-ish, e.g. "en"), when known. */
    language: text({ maxLength: 16 }),

    /** Which engine produced this, e.g. "parakeet-sherpa" | "whisper-cpp" | "byo". */
    engineId: text({ maxLength: 120 }),

    /** Which model produced this, e.g. "parakeet-tdt-0.6b-v2". */
    modelId: text({ maxLength: 200 }),

    /** Length of the transcribed audio in milliseconds. */
    durationMs: number({ integer: true, min: 0 }),

    /**
     * Optional source audio, stored as a content-addressed blob reference.
     * Off by default — retained only when the user opts into keeping audio
     * (0279 privacy norm; the bytes live in BlobStore, never the change log).
     */
    audio: file({}),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179). */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility. Defaults to `private`, like the meeting itself. */
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

/** A Meeting node type (inferred from schema). */
export type Meeting = InferNode<(typeof MeetingSchema)['_properties']>

/** A MeetingTranscript node type (inferred from schema). */
export type MeetingTranscript = InferNode<(typeof MeetingTranscriptSchema)['_properties']>
