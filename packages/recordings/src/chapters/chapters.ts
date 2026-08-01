/**
 * Chapter generation (exploration 0414, phase 4).
 *
 * One LLM call over the timestamped transcript produces the markers that make
 * a twelve-minute screencast navigable. This is a sibling of the meetings
 * enhancement path rather than a template inside it: the input is a single
 * narrator with source-timeline offsets, not a two-channel conversation, and
 * the output is structured data rather than prose.
 *
 * Two guards, both inherited from 0394's lesson that a fabricated specific is
 * indistinguishable from a real one once written down:
 *
 * - **Timestamps are snapped, never trusted.** A model asked for `MM:SS` will
 *   occasionally invent an offset past the end of the recording. Every
 *   proposed start is snapped to the nearest real segment boundary, so a
 *   chapter can only ever begin where something was actually said.
 * - **Titles are screened.** `screenGroundedness` from `@xnetjs/meetings`
 *   rejects titles carrying numbers or proper nouns the transcript never
 *   contained.
 */

import type { Chapter, RecordingSegment } from '@xnetjs/data'
import type { AIMessage, AIProvider } from '@xnetjs/plugins'
import { screenGroundedness } from '@xnetjs/meetings'

export const CHAPTERS_SYSTEM_PROMPT = `You split a screen-recording transcript into chapters.

Rules, in priority order:
1. Use only what the transcript says. Never invent a topic, product name, number, or claim that is not there.
2. Prefer few, meaningful chapters over many thin ones — roughly one per distinct topic, never more than one per 30 seconds of recording.
3. A title is a short noun phrase, at most 6 words, in sentence case. No trailing punctuation.
4. The first chapter always starts at 00:00.
5. Answer with one chapter per line, in the exact form: MM:SS | Title
   Emit nothing else — no preamble, no numbering, no markdown.`

/** Render segments as the `MM:SS text` transcript the prompt references. */
export function formatTimedTranscript(segments: readonly RecordingSegment[]): string {
  return segments
    .map((segment) => `${formatClock(segment.startMs)} ${segment.text.trim()}`)
    .join('\n')
    .trim()
}

/** `MM:SS`, or `HH:MM:SS` past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1_000))
  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** Parse `MM:SS` / `HH:MM:SS` back to milliseconds; `null` if unparseable. */
export function parseClock(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const [, hours, minutes, seconds] = match
  const ms = (Number(hours ?? 0) * 3_600 + Number(minutes) * 60 + Number(seconds)) * 1_000
  return Number.isFinite(ms) ? ms : null
}

export function buildChapterMessages(segments: readonly RecordingSegment[]): AIMessage[] {
  return [
    { role: 'system', content: CHAPTERS_SYSTEM_PROMPT },
    { role: 'user', content: formatTimedTranscript(segments) || '(empty)' }
  ]
}

/** Snap a proposed offset onto the nearest segment start at or before it. */
function snapToSegment(startMs: number, segments: readonly RecordingSegment[]): number | null {
  let best: number | null = null
  for (const segment of segments) {
    if (segment.startMs <= startMs) best = segment.startMs
    else break
  }
  return best
}

export interface ParseChaptersResult {
  chapters: Chapter[]
  /** Lines the model emitted that could not be read as a chapter. */
  rejected: string[]
}

/**
 * Parse the model's lines into chapters, snapping every start to a real
 * segment boundary and dropping anything ungrounded.
 */
export function parseChapters(
  output: string,
  segments: readonly RecordingSegment[]
): ParseChaptersResult {
  const sources = segments.map((segment) => segment.text)
  const chapters: Chapter[] = []
  const rejected: string[] = []
  const seen = new Set<number>()

  for (const raw of output.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const separator = line.indexOf('|')
    if (separator === -1) {
      rejected.push(line)
      continue
    }

    const startMs = parseClock(line.slice(0, separator))
    const title = line
      .slice(separator + 1)
      .trim()
      .replace(/[.;,]+$/, '')

    if (startMs === null || !title) {
      rejected.push(line)
      continue
    }

    const snapped = snapToSegment(startMs, segments)
    if (snapped === null) {
      rejected.push(line)
      continue
    }

    if (!screenGroundedness(title, sources).grounded) {
      rejected.push(line)
      continue
    }

    if (seen.has(snapped)) continue
    seen.add(snapped)
    chapters.push({ startMs: snapped, title })
  }

  chapters.sort((a, b) => a.startMs - b.startMs)
  return { chapters, rejected }
}

/**
 * Ask the provider for chapters. Returns an empty list rather than throwing
 * when nothing survives screening — the caller shows "no chapters" instead of
 * fabricated ones.
 */
export async function generateChapters(
  provider: AIProvider,
  segments: readonly RecordingSegment[]
): Promise<ParseChaptersResult> {
  if (segments.length === 0) return { chapters: [], rejected: [] }

  const messages = buildChapterMessages(segments)
  let text = ''

  if (provider.generateWithTools) {
    text = (await provider.generateWithTools({ messages })).text ?? ''
  } else {
    text = await provider.generate(
      messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n')
    )
  }

  return parseChapters(text, segments)
}
