/**
 * Transcript chat (exploration 0279, phase 2 — option D3).
 *
 * "What were the action items?" over a finished meeting. This is ordinary AI
 * chat grounded in the transcript: we build the message list (system grounding
 * + transcript + history + question); the app's existing AI chat surface owns
 * rendering, streaming, and budget handling.
 */

import type { MeetingSegment } from '@xnetjs/data'
import type { AIMessage, AIProvider } from '@xnetjs/plugins'
import { formatTranscript } from './enhance-notes'

const CHAT_SYSTEM_PROMPT = `You answer questions about one specific meeting, using only its transcript and notes below.
The transcript labels speakers as [me] (the note-taker) and [them] (everyone else).
If the answer is not in the transcript, say so — never guess or bring in outside knowledge.
Quote the transcript when it settles the question.`

export interface TranscriptChatContext {
  /** Channel-labelled transcript segments, ordered by startMs. */
  segments: MeetingSegment[]
  /** The meeting's notes (rough or enhanced), for extra grounding. */
  notes?: string
  /** Meeting title, when known. */
  title?: string
}

/** Build the grounded message list for one chat turn. */
export function buildTranscriptChatMessages(
  context: TranscriptChatContext,
  history: AIMessage[],
  question: string
): AIMessage[] {
  const grounding = [
    context.title ? `Meeting: ${context.title}` : null,
    context.notes ? `## Notes\n${context.notes}` : null,
    `## Transcript\n${formatTranscript(context.segments) || '(empty)'}`
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n')

  return [
    { role: 'system', content: `${CHAT_SYSTEM_PROMPT}\n\n${grounding}` },
    ...history.filter((m) => m.role === 'user' || m.role === 'assistant'),
    { role: 'user', content: question }
  ]
}

/** One chat turn, streamed. Same provider-fallback ladder as enhancement. */
export async function* streamTranscriptChat(
  provider: AIProvider,
  context: TranscriptChatContext,
  history: AIMessage[],
  question: string
): AsyncIterable<string> {
  const messages = buildTranscriptChatMessages(context, history, question)

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

  const prompt = messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n')
  const text = await provider.generate(prompt)
  if (text) yield text
}
