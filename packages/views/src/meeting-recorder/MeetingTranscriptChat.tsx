/**
 * Transcript chat panel (exploration 0279, phase 2 — option D3).
 *
 * "What were the action items?" over a finished meeting: a small chat surface
 * grounded in the transcript + notes via `streamTranscriptChat` from
 * @xnetjs/meetings. The provider arrives through the same injected
 * `resolveAiProvider` slot the recorder's enhancement uses; when it resolves
 * null the panel stays visible but disabled, saying why — configuring is one
 * hop away in the AI chat settings.
 */

import type { MeetingSegment } from '@xnetjs/data'
import type { AIMessage, AIProvider } from '@xnetjs/plugins'
import { streamTranscriptChat, type TranscriptChatContext } from '@xnetjs/meetings'
import { Loader2, MessageCircleQuestion, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

export interface MeetingTranscriptChatProps {
  segments: MeetingSegment[]
  /** The meeting's notes as plain text, for extra grounding. */
  notes?: string
  title?: string
  /** Same slot as the recorder's enhancement; resolves null → disabled panel. */
  resolveAiProvider: () => Promise<AIProvider | null>
  className?: string
}

/** Ask questions about one meeting's transcript, streamed. */
export function MeetingTranscriptChat({
  segments,
  notes,
  title,
  resolveAiProvider,
  className
}: MeetingTranscriptChatProps): JSX.Element {
  const [history, setHistory] = useState<AIMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const providerRef = useRef<AIProvider | null>(null)
  // Re-entry guard: `streaming` state lags a synchronous double-submit
  // (Enter + click land in the same tick before the re-render disables them).
  const streamingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Resolve once on mount so the panel can say up front whether it works.
  useEffect(() => {
    let cancelled = false
    void resolveAiProvider()
      .then((provider) => {
        if (cancelled) return
        providerRef.current = provider
        setAvailable(provider !== null)
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [resolveAiProvider])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history])

  const handleAsk = useCallback(async () => {
    const question = input.trim()
    const provider = providerRef.current
    if (!question || !provider || streamingRef.current) return

    setError(null)
    setInput('')
    streamingRef.current = true
    setStreaming(true)
    // History *before* this question grounds the call; the question rides
    // separately (buildTranscriptChatMessages appends it).
    const priorHistory = history
    setHistory((previous) => [
      ...previous,
      { role: 'user', content: question },
      { role: 'assistant', content: '' }
    ])

    const context: TranscriptChatContext = {
      segments,
      ...(notes?.trim() ? { notes } : {}),
      ...(title ? { title } : {})
    }

    try {
      for await (const delta of streamTranscriptChat(provider, context, priorHistory, question)) {
        setHistory((previous) => {
          const last = previous[previous.length - 1]
          if (last?.role !== 'assistant') return previous
          return [...previous.slice(0, -1), { ...last, content: last.content + delta }]
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      // Drop the empty assistant stub so a retry doesn't ground on it.
      setHistory((previous) =>
        previous[previous.length - 1]?.role === 'assistant' &&
        previous[previous.length - 1]?.content === ''
          ? previous.slice(0, -1)
          : previous
      )
    } finally {
      streamingRef.current = false
      setStreaming(false)
    }
  }, [history, input, notes, segments, title])

  const disabled = available === false

  return (
    <div
      className={`flex min-h-0 flex-col gap-1.5 ${className ?? ''}`}
      data-meeting-transcript-chat="true"
    >
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <MessageCircleQuestion size={12} /> Ask this meeting
      </span>

      <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-background">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {disabled ? (
            <p className="text-xs text-muted-foreground" data-meeting-chat-unavailable="true">
              No AI provider is configured — set one up in the AI chat panel settings to ask
              questions about this transcript.
            </p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ask about this meeting — &ldquo;What were the action items?&rdquo;, &ldquo;What did we
              decide about the launch date?&rdquo;. Answers use only this transcript and its notes.
            </p>
          ) : (
            history.map((message, index) => (
              <div
                key={index}
                className={`text-sm ${
                  message.role === 'user'
                    ? 'font-medium text-foreground'
                    : 'whitespace-pre-wrap text-muted-foreground'
                }`}
                data-meeting-chat-role={message.role}
              >
                {message.content ||
                  (message.role === 'assistant' && streaming && index === history.length - 1 ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    message.content
                  ))}
              </div>
            ))
          )}
          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        </div>

        <form
          className="flex items-center gap-2 border-t border-border p-2"
          onSubmit={(event) => {
            event.preventDefault()
            void handleAsk()
          }}
        >
          <input
            type="text"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            placeholder={disabled ? 'AI provider required' : 'What were the action items?'}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={disabled || streaming || available === null}
            data-meeting-chat-input="true"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            disabled={disabled || streaming || available === null || input.trim().length === 0}
            data-meeting-chat-send="true"
          >
            {streaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Ask
          </button>
        </form>
      </div>
    </div>
  )
}
