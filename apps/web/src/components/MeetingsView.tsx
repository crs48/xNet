/**
 * MeetingsView - the web Meetings surface (exploration 0279).
 *
 * The recorder/list/detail cores live in @xnetjs/views (0277 shared-view-core
 * pattern); this file keeps the web deltas: router-backed mode switching
 * (`?meeting=` opens a meeting, `?record=1` opens the recorder), the TipTap
 * notes editor bound to the meeting's Y.Doc, and the AI-provider resolver
 * shared with the chat panel (0252/0208).
 */

import type { JSX } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MeetingDetailView, MeetingRecorderView, MeetingsListView } from '@xnetjs/views'
import { ArrowLeft } from 'lucide-react'
import { resolveMeetingAiProvider } from '../lib/meeting-ai'
import { Editor } from './Editor'

export interface MeetingsViewProps {
  /** Meeting whose detail pane is open (`/meetings?meeting=`) */
  openMeetingId?: string | null
  /** Open in recorder mode (`/meetings?record=1`) */
  recording?: boolean
}

export function MeetingsView({
  openMeetingId = null,
  recording = false
}: MeetingsViewProps): JSX.Element {
  const navigate = useNavigate()

  const showList = (): void => {
    void navigate({ to: '/meetings', search: {} })
  }
  const openMeeting = (meetingId: string): void => {
    void navigate({ to: '/meetings', search: { meeting: meetingId } })
  }
  const openRecorder = (): void => {
    void navigate({ to: '/meetings', search: { record: 1 } })
  }

  if (recording) {
    return (
      <div className="flex h-full flex-col gap-3">
        <BackToMeetings onClick={showList} />
        <MeetingRecorderView
          className="min-h-0 flex-1"
          resolveAiProvider={resolveMeetingAiProvider}
          onDone={openMeeting}
          onCancel={showList}
        />
      </div>
    )
  }

  if (openMeetingId) {
    return (
      <div className="flex h-full flex-col gap-3">
        <BackToMeetings onClick={showList} />
        <MeetingDetailView
          className="min-h-0 flex-1"
          meetingId={openMeetingId}
          renderNotes={({ doc }) => <Editor doc={doc} className="min-h-full" />}
        />
      </div>
    )
  }

  return <MeetingsListView onOpenMeeting={openMeeting} onNewMeeting={openRecorder} />
}

function BackToMeetings({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      data-meetings-back="true"
    >
      <ArrowLeft size={12} /> All meetings
    </button>
  )
}
