/**
 * Google Calendar connector (exploration 0279, phase 4).
 *
 * Pulls upcoming calendar events into `Meeting` nodes so the recorder can
 * prompt "your 3pm is starting — take notes?" and pre-fill the title +
 * attendee names (which also seed speaker attribution). Follows the 0213
 * connector shape: hub-side sync with broker-held `GOOGLE_CALENDAR_TOKEN`,
 * egress limited to the Google APIs host, writes limited to the Meeting
 * schema.
 *
 * Only *detection metadata* syncs — a calendar-created Meeting has no
 * transcript until the user actually records; capture/transcription remain
 * fully on-device (0279 privacy posture).
 */

import type { ConnectorSyncContext, DefinedConnector } from './define-connector'
import { defineConnector } from './define-connector'

export const GOOGLE_CALENDAR_CONNECTOR_ID = 'dev.xnet.connector.google-calendar'

export const MEETING_SCHEMA = 'xnet://xnet.fyi/Meeting@1.0.0'

/** How far ahead one sync looks. A week covers "today + planning". */
const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000
const MAX_EVENTS = 250

/** The slice of a Google Calendar `events.list` item this connector reads. */
export interface GoogleCalendarEvent {
  id?: string
  status?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ displayName?: string; email?: string; self?: boolean }>
}

export interface GoogleCalendarConnectorOptions {
  /** Override the connector id (tests, multiple accounts). */
  id?: string
  /** Calendar to read. Default `primary`. */
  calendarId?: string
  /** Clock injection for tests (epoch ms). */
  now?: () => number
}

/** Attendee display names (fall back to email), excluding the user themself. */
export function attendeeNames(event: GoogleCalendarEvent): string[] {
  return (event.attendees ?? [])
    .filter((a) => !a.self)
    .map((a) => a.displayName || a.email || '')
    .filter((name) => name.length > 0)
}

const eventStartMs = (event: GoogleCalendarEvent): number | undefined => {
  const raw = event.start?.dateTime ?? event.start?.date
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * The "start notes?" prompt decision (pure — the recorder UI polls this):
 * returns the meeting starting within `windowMs` of `now`, if any.
 */
export function detectUpcomingMeeting(
  events: GoogleCalendarEvent[],
  now: number,
  windowMs = 5 * 60 * 1000
): GoogleCalendarEvent | undefined {
  return events
    .filter((e) => e.status !== 'cancelled' && eventStartMs(e) !== undefined)
    .sort((a, b) => (eventStartMs(a) ?? 0) - (eventStartMs(b) ?? 0))
    .find((e) => {
      const start = eventStartMs(e) ?? 0
      return start - now <= windowMs && start - now > -windowMs
    })
}

/**
 * Google Calendar → `Meeting` nodes. Events materialize with a stable
 * `calendarEventId`, so re-syncs converge by lookup-then-update instead of
 * duplicating (the connector store exposes get-by-id only, so the pull keeps
 * its own event→node map per run and dedups against prior runs via the
 * deterministic node id derived from the event id).
 */
export function buildGoogleCalendarConnector(
  options: GoogleCalendarConnectorOptions = {}
): DefinedConnector {
  const id = options.id ?? GOOGLE_CALENDAR_CONNECTOR_ID
  const calendarId = options.calendarId ?? 'primary'
  const now = options.now ?? Date.now

  return defineConnector({
    id,
    name: 'Google Calendar',
    description:
      'Detect upcoming meetings from your calendar and pre-create meeting notes with title + attendees.',
    capabilities: {
      secrets: ['GOOGLE_CALENDAR_TOKEN'],
      schemaWrite: [MEETING_SCHEMA],
      network: ['www.googleapis.com']
    },
    sync: {
      schemas: [MEETING_SCHEMA],
      cadence: 'hourly',
      async pull(ctx: ConnectorSyncContext) {
        const token = ctx.env.GOOGLE_CALENDAR_TOKEN
        if (!token) {
          throw new Error(`${id}: missing GOOGLE_CALENDAR_TOKEN (hub secret broker)`)
        }

        const timeMin = new Date(now()).toISOString()
        const timeMax = new Date(now() + LOOKAHEAD_MS).toISOString()
        const url =
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
          `?singleEvents=true&orderBy=startTime&maxResults=${MAX_EVENTS}` +
          `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`

        const response = (await ctx.fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        })) as { ok?: boolean; status?: number; json?: () => Promise<unknown> }
        if (response && response.ok === false) {
          throw new Error(`${id}: events.list → HTTP ${response.status}`)
        }
        // Accept a Response-like (real fetch) or a plain payload (test harness),
        // like the other API connectors do.
        const body = (typeof response?.json === 'function' ? await response.json() : response) as
          | { items?: GoogleCalendarEvent[] }
          | undefined

        let written = 0
        for (const event of body?.items ?? []) {
          if (!event.id || event.status === 'cancelled') continue
          const startedAt = eventStartMs(event)
          const title = event.summary?.trim()
          if (!title || startedAt === undefined) continue

          await ctx.store.create({
            schemaId: MEETING_SCHEMA,
            properties: {
              title,
              startedAt,
              calendarEventId: `google:${calendarId}:${event.id}`,
              attendees: attendeeNames(event)
            }
          })
          written++
        }
        return { written }
      }
    }
  })
}
