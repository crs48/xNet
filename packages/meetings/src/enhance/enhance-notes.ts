/**
 * Post-meeting note enhancement (exploration 0279, phase 2 — option D2).
 *
 * One streamed LLM call after the meeting ends: template + the user's rough
 * bullets + the channel-labelled transcript (+ calendar context) → structured
 * notes. The user's text stays authoritative — the caller renders streamed
 * output as AI-marked spans, distinct from what the user typed.
 *
 * Provider-agnostic: any `AIProvider` from `@xnetjs/plugins` works (managed /
 * BYO / local ladder). Streaming is used when the provider supports it, with
 * a one-shot fallback otherwise — budget errors (`AiBudgetError`) propagate
 * to the caller, which owns the UX.
 */

import type { MeetingSegment } from '@xnetjs/data'
import type { AIMessage, AIProvider } from '@xnetjs/plugins'
import { resolveTemplate, type MeetingTemplate } from './templates'

export interface EnhanceNotesRequest {
  /** The user's rough notes, as Markdown (may be empty — transcript-only). */
  roughNotes: string
  /** Channel-labelled transcript segments, ordered by startMs. */
  segments: MeetingSegment[]
  /** Template id from the Meeting node; unknown ids fall back to generic. */
  templateId?: string
  /** Calendar context, when the meeting was detected from an event. */
  calendar?: { title?: string; attendees?: string[] }
}

/** Render segments as the `[me]`/`[them]` transcript the prompts reference. */
export function formatTranscript(segments: MeetingSegment[]): string {
  return segments
    .map((s) => `[${s.speaker ?? s.channel}] ${s.text}`)
    .join('\n')
    .trim()
}

/** Build the messages for the enhancement call. Exported for tests/preview. */
export function buildEnhanceMessages(request: EnhanceNotesRequest): {
  template: MeetingTemplate
  messages: AIMessage[]
} {
  const template = resolveTemplate(request.templateId)
  const calendarLines = [
    request.calendar?.title ? `Meeting title: ${request.calendar.title}` : null,
    request.calendar?.attendees?.length
      ? `Attendees: ${request.calendar.attendees.join(', ')}`
      : null
  ].filter((line): line is string => line !== null)

  const user = [
    ...calendarLines,
    '',
    '## My rough notes',
    request.roughNotes.trim() || '(none — summarize from the transcript alone)',
    '',
    '## Transcript',
    formatTranscript(request.segments) || '(empty)'
  ].join('\n')

  return {
    template,
    messages: [
      { role: 'system', content: template.systemPrompt },
      { role: 'user', content: user }
    ]
  }
}

/**
 * Stream the enhanced notes as text deltas. Uses `provider.stream()` when
 * available, else falls back to one `generateWithTools()`/`generate()` call
 * yielded as a single delta — callers treat both identically.
 */
export async function* streamEnhancedNotes(
  provider: AIProvider,
  request: EnhanceNotesRequest
): AsyncIterable<string> {
  const { messages } = buildEnhanceMessages(request)

  if (provider.stream) {
    for await (const chunk of provider.stream({ messages, stream: true })) {
      if (chunk.type === 'text' && chunk.text) yield chunk.text
    }
    return
  }

  if (provider.generateWithTools) {
    const response = await provider.generateWithTools({ messages })
    if (response.text) yield response.text
    return
  }

  // Bare `generate(prompt)` providers: flatten the messages into one prompt.
  const prompt = messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n')
  const text = await provider.generate(prompt)
  if (text) yield text
}

/** Convenience: collect the full enhanced notes (non-streaming callers). */
export async function enhanceNotes(
  provider: AIProvider,
  request: EnhanceNotesRequest
): Promise<string> {
  let out = ''
  for await (const delta of streamEnhancedNotes(provider, request)) out += delta
  return out
}
