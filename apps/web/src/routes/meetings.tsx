/**
 * Meetings surface route (exploration 0279). `?meeting=` opens one meeting's
 * notes + transcript; `?record=1` opens the botless recorder.
 */

import { createFileRoute } from '@tanstack/react-router'
import { MeetingsView } from '../components/MeetingsView'

interface MeetingsSearch {
  meeting?: string
  record?: number
}

export const Route = createFileRoute('/meetings')({
  validateSearch: (search: Record<string, unknown>): MeetingsSearch => {
    const meeting =
      typeof search.meeting === 'string' && search.meeting ? search.meeting : undefined
    const record = search.record ? 1 : undefined
    return { ...(meeting ? { meeting } : {}), ...(record ? { record } : {}) }
  },
  component: MeetingsPage
})

function MeetingsPage(): JSX.Element {
  const { meeting, record } = Route.useSearch()
  return <MeetingsView openMeetingId={meeting ?? null} recording={Boolean(record)} />
}
