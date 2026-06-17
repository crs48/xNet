/**
 * TranscriptionSchema — one stored speech-to-text dictation (exploration 0192).
 *
 * Every time the user dictates — into an xNet field or, eventually, via
 * system-wide push-to-talk — the result is stored as a `Transcription` node so
 * they can scroll back through history and re-copy an old one. The text is the
 * payload; the audio blob is **optional and off by default** (privacy).
 *
 * Like `Metric` (health/habit data), transcripts are sensitive — `visibility`
 * defaults to `private` so a dictation never leaks to a public surface by
 * accident.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, number, select, file, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const TRANSCRIPTION_SCHEMA_IRI = 'xnet://xnet.fyi/Transcription@1.0.0' as const

export const TranscriptionSchema = defineSchema({
  name: 'Transcription',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The transcribed text — FTS-indexed so history is searchable. */
    text: text({ required: true }),

    /** Detected/used language (BCP-47-ish, e.g. "en"). */
    language: text({ maxLength: 16 }),

    /** Which engine produced this, e.g. "whisper" | "parakeet" | "apple" | "byo". */
    engineId: text({ maxLength: 120 }),

    /** Which model produced this, e.g. "parakeet-tdt-0.6b-v2". */
    modelId: text({ maxLength: 200 }),

    /** Length of the source audio in milliseconds. */
    durationMs: number({ integer: true, min: 0 }),

    /** How the dictation was triggered. */
    source: select({
      options: [
        { id: 'inApp', name: 'In-app field' },
        { id: 'pushToTalk', name: 'Global push-to-talk' }
      ] as const,
      default: 'inApp'
    }),

    /**
     * Optional source audio, stored as a content-addressed blob. Off by
     * default — retained only when the user opts into keeping audio.
     */
    audio: file({}),

    /** App / field the text was inserted into (for push-to-talk history). */
    pastedInto: text({ maxLength: 300 }),

    /** Pin a transcript so retention never prunes it. */
    starred: select({
      options: [
        { id: 'no', name: 'Not starred' },
        { id: 'yes', name: 'Starred' }
      ] as const,
      default: 'no'
    }),

    /** Canonical home; empty = Unfiled (exploration 0169). */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Workspace-wide labels, referenced by id (exploration 0169). */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Order among siblings — fractional index. */
    sortKey: text({ maxLength: 500 }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179). */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /**
     * Per-node visibility. Defaults to `private` — a dictation may contain
     * anything, and must never leak to public surfaces by accident (0192).
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
  document: undefined,
  // Owner-only by default; inherits access from its home Space when filed into
  // one — same model as Metric, since transcripts are equally sensitive
  // (explorations 0181/0192).
  authorization: spaceCascadeAuthorization()
})

/** A Transcription node type (inferred from schema). */
export type Transcription = InferNode<(typeof TranscriptionSchema)['_properties']>

export type TranscriptionSourceId = 'inApp' | 'pushToTalk'
