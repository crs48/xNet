/**
 * Desktop Meetings surface (exploration 0279).
 *
 * The recorder/list/detail cores are shared from @xnetjs/views (0277
 * shared-view-core pattern); this wrapper keeps the desktop deltas: local
 * mode state (the desktop shell has no router — same idiom as
 * DataWorkspaceView), the XNetEditor notes editor, and the close
 * affordance back to the home canvas. `window.xnetMeetings` is present here,
 * so the recorder runs at the system-audio tier with the native engines.
 */

import { XNetEditor } from '@xnetjs/editor/react'
import { MeetingDetailView, MeetingRecorderView, MeetingsListView } from '@xnetjs/views'
import { ArrowLeft, X } from 'lucide-react'
import React, { useState } from 'react'

type MeetingsMode = { kind: 'list' } | { kind: 'detail'; meetingId: string } | { kind: 'record' }

interface MeetingsViewProps {
  onClose: () => void
}

export function MeetingsView({ onClose }: MeetingsViewProps): React.ReactElement {
  const [mode, setMode] = useState<MeetingsMode>({ kind: 'list' })

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        {mode.kind !== 'list' ? (
          <button
            type="button"
            onClick={() => setMode({ kind: 'list' })}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            data-meetings-back="true"
          >
            <ArrowLeft size={12} /> All meetings
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted"
        >
          <X size={12} /> Close
        </button>
      </div>

      {mode.kind === 'record' ? (
        <MeetingRecorderView
          className="min-h-0 flex-1"
          onDone={(meetingId) => setMode({ kind: 'detail', meetingId })}
          onCancel={() => setMode({ kind: 'list' })}
        />
      ) : mode.kind === 'detail' ? (
        // No `resolveAiProvider` yet: the desktop shell has no AI connector
        // resolution (the web one lives in apps/web), so the transcript chat
        // panel stays hidden here — same decision as recorder enhancement.
        <MeetingDetailView
          className="min-h-0 flex-1"
          meetingId={mode.meetingId}
          renderNotes={({ doc }) => <XNetEditor ydoc={doc} />}
        />
      ) : (
        <MeetingsListView
          className="min-h-0 flex-1"
          onOpenMeeting={(meetingId) => setMode({ kind: 'detail', meetingId })}
          onNewMeeting={() => setMode({ kind: 'record' })}
        />
      )}
    </div>
  )
}
