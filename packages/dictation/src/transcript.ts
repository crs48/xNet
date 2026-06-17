/**
 * Transcript text tidying + node-field shaping.
 *
 * Engines return raw recognizer output; before we insert it into a text field
 * or store it as a `Transcription` node we normalize whitespace and assemble the
 * field values. Keeping this pure means the same shaping runs on every platform.
 */

import type { TranscriptResult, TranscriptSegment, TranscriptionSource } from './types'

/** Collapse runs of whitespace, drop spaces before punctuation, and trim. */
export function normalizeTranscriptText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()
}

/** Join timed segments into a single normalized string. */
export function joinSegments(segments: readonly TranscriptSegment[]): string {
  return normalizeTranscriptText(segments.map((s) => s.text).join(' '))
}

/** Field values for a `Transcription` node (see packages/data … schemas/transcription.ts). */
export interface TranscriptionFields {
  text: string
  language?: string
  engineId: string
  modelId: string
  durationMs: number
  source: TranscriptionSource
}

/**
 * Build the storable field values from an engine result. The `text` is
 * normalized; empty/whitespace-only results yield an empty string (callers
 * should skip storing those).
 */
export function buildTranscriptionFields(
  result: TranscriptResult,
  source: TranscriptionSource = 'inApp'
): TranscriptionFields {
  const fields: TranscriptionFields = {
    text: normalizeTranscriptText(result.text),
    engineId: result.engineId,
    modelId: result.modelId,
    durationMs: Math.max(0, Math.round(result.durationMs)),
    source
  }
  if (result.language) {
    fields.language = result.language
  }
  return fields
}

/** True when a result carries no usable text after normalization. */
export function isEmptyTranscript(result: TranscriptResult): boolean {
  return normalizeTranscriptText(result.text).length === 0
}
