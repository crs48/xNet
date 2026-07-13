/**
 * Meetings list + detail cores (exploration 0279, 0277 shared-view-core
 * pattern). The list is a plain useQuery over Meeting nodes; the detail pane
 * shows the notes body (platform editor injected via `renderNotes` — the
 * shared core stays free of @xnetjs/editor) beside the transcript timeline
 * from the sibling MeetingTranscript node. Both apps wrap these with their
 * own routing/chrome.
 */

import type { MeetingSegment } from '@xnetjs/data'
import type { AIProvider } from '@xnetjs/plugins'
import type * as Y from 'yjs'
import { MeetingSchema, MeetingTranscriptSchema } from '@xnetjs/data'
import { useNode, useQuery } from '@xnetjs/react'
import { Clock, Mic, Plus } from 'lucide-react'
import { useMemo, type JSX, type ReactNode } from 'react'
import { TranscriptSegmentRow } from './components.js'
import { extractDocText } from './enhance-append.js'
import { MeetingTranscriptChat } from './MeetingTranscriptChat.js'

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return '—'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return '<1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatStartedAt(startedAt: number | undefined): string {
  if (!startedAt) return ''
  return new Date(startedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

// ─── List ────────────────────────────────────────────────────────────────────

export interface MeetingsListViewProps {
  onOpenMeeting: (meetingId: string) => void
  onNewMeeting: () => void
  className?: string
}

/** All Meeting nodes, newest first, with the "New meeting" entry point. */
export function MeetingsListView({
  onOpenMeeting,
  onNewMeeting,
  className
}: MeetingsListViewProps): JSX.Element {
  const { data: meetings, loading } = useQuery(MeetingSchema)

  const sorted = useMemo(
    () =>
      [...(meetings ?? [])].sort(
        (a, b) =>
          (typeof b.startedAt === 'number' ? b.startedAt : 0) -
          (typeof a.startedAt === 'number' ? a.startedAt : 0)
      ),
    [meetings]
  )

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 ${className ?? ''}`}
      data-meetings-list="true"
    >
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">Meetings</h2>
        <button
          type="button"
          onClick={onNewMeeting}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
          data-meetings-new="true"
        >
          <Plus size={12} /> New meeting
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading meetings…</p>
      ) : sorted.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-border bg-secondary/30 p-8 text-center">
          <Mic size={20} className="text-muted-foreground" />
          <p className="text-sm text-foreground">No meetings yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Record a meeting to get a live Me/Them transcript and AI-enhanced notes — no bot joins
            the call, and audio never leaves this device.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          {sorted.map((meeting) => (
            <button
              key={meeting.id}
              type="button"
              onClick={() => onOpenMeeting(meeting.id)}
              className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-secondary/40"
              data-meeting-row={meeting.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {meeting.title || 'Untitled meeting'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatStartedAt(
                    typeof meeting.startedAt === 'number' ? meeting.startedAt : undefined
                  )}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Clock size={12} />
                {formatDuration(
                  typeof meeting.durationMs === 'number' ? meeting.durationMs : undefined
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Detail ──────────────────────────────────────────────────────────────────

export interface MeetingDetailViewProps {
  meetingId: string
  /**
   * Platform slot for the collaborative notes editor — the apps pass their
   * XNetEditor (BlockNote, 0312) bound to the meeting's Y.Doc. Absent → the
   * pane explains notes need the editor surface (transcript still renders).
   */
  renderNotes?: (args: { meetingId: string; doc: Y.Doc }) => ReactNode
  /**
   * Platform slot for the transcript chat (0279 phase 2 D3) — same resolver
   * the recorder's enhancement uses. Absent → the panel is hidden entirely
   * (the desktop wrapper's current choice while it has no provider wiring).
   */
  resolveAiProvider?: () => Promise<AIProvider | null>
  className?: string
}

/** One meeting: title/metadata, notes body, and the transcript timeline. */
export function MeetingDetailView({
  meetingId,
  renderNotes,
  resolveAiProvider,
  className
}: MeetingDetailViewProps): JSX.Element {
  const { data: meeting, doc, loading, update } = useNode(MeetingSchema, meetingId)
  const transcriptId =
    meeting && typeof meeting.transcript === 'string' && meeting.transcript
      ? meeting.transcript
      : null
  const { data: transcript } = useNode(MeetingTranscriptSchema, transcriptId)

  const segments = useMemo<MeetingSegment[]>(
    () => (Array.isArray(transcript?.segments) ? (transcript.segments as MeetingSegment[]) : []),
    [transcript?.segments]
  )

  // Plain-text notes ground the chat; recomputed per render is fine — the
  // panel only reads it when a question is asked.
  const notesText = doc ? extractDocText(doc) : ''

  if (loading && !meeting) {
    return (
      <div className={`flex h-full items-center justify-center ${className ?? ''}`}>
        <p className="text-sm text-muted-foreground">Loading meeting…</p>
      </div>
    )
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 ${className ?? ''}`}
      data-meeting-detail={meetingId}
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <input
          type="text"
          className="min-w-0 flex-1 border-none bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          value={meeting?.title ?? ''}
          onChange={(event) => void update({ title: event.target.value })}
          placeholder="Untitled meeting"
          data-meeting-title="true"
        />
        <span className="text-xs text-muted-foreground">
          {formatStartedAt(typeof meeting?.startedAt === 'number' ? meeting.startedAt : undefined)}
          {' · '}
          {formatDuration(typeof meeting?.durationMs === 'number' ? meeting.durationMs : undefined)}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notes
          </span>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background p-3">
            {doc && renderNotes ? (
              renderNotes({ meetingId, doc })
            ) : (
              <p className="text-sm text-muted-foreground">
                {doc ? 'Notes editing is not available on this surface yet.' : 'Loading notes…'}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Transcript
              {transcript?.engineId ? (
                <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">
                  via {String(transcript.engineId)}
                </span>
              ) : null}
            </span>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-3">
              {segments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transcript for this meeting.</p>
              ) : (
                segments.map((segment, index) => (
                  <TranscriptSegmentRow key={`${segment.startMs}-${index}`} segment={segment} />
                ))
              )}
            </div>
          </div>

          {resolveAiProvider && segments.length > 0 ? (
            <MeetingTranscriptChat
              className="max-h-[45%] min-h-[180px]"
              segments={segments}
              notes={notesText}
              title={typeof meeting?.title === 'string' ? meeting.title : undefined}
              resolveAiProvider={resolveAiProvider}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
