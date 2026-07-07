import { describe, expect, it } from 'vitest'
import {
  attendeeNames,
  buildGoogleCalendarConnector,
  detectUpcomingMeeting,
  MEETING_SCHEMA,
  type GoogleCalendarEvent
} from './calendar'
import { runConnectorSync } from './sync-runner'

interface Created {
  schemaId: string
  properties: Record<string, unknown>
}

const NOW = Date.UTC(2026, 6, 1, 12, 0, 0)

const event = (overrides: Partial<GoogleCalendarEvent>): GoogleCalendarEvent => ({
  id: 'evt-1',
  summary: 'Weekly sync',
  start: { dateTime: new Date(NOW + 60 * 60 * 1000).toISOString() },
  attendees: [
    { displayName: 'Ana', email: 'ana@acme.test' },
    { email: 'bo@acme.test' },
    { displayName: 'You', self: true }
  ],
  ...overrides
})

function harness(payload: unknown) {
  const created: Created[] = []
  const requests: string[] = []
  return {
    created,
    requests,
    fetch: async (input: string | { url: string }) => {
      requests.push(typeof input === 'string' ? input : input.url)
      return payload
    },
    store: {
      async create({ schemaId, properties }: Created) {
        created.push({ schemaId, properties })
        return { id: `id-${created.length}`, schemaId }
      },
      async get() {
        return null
      },
      async update() {
        return undefined
      }
    }
  }
}

describe('buildGoogleCalendarConnector', () => {
  it('materializes upcoming events as Meeting nodes with attendees', async () => {
    const h = harness({ items: [event({}), event({ id: 'evt-2', summary: 'Design review' })] })
    const connector = buildGoogleCalendarConnector({ now: () => NOW })

    const result = await runConnectorSync(connector.definition, {
      env: { GOOGLE_CALENDAR_TOKEN: 'gtok' },
      fetch: h.fetch,
      store: h.store,
      space: 'space-1'
    })

    expect(result.written).toBe(2)
    expect(h.created[0].schemaId).toBe(MEETING_SCHEMA)
    expect(h.created[0].properties).toMatchObject({
      title: 'Weekly sync',
      startedAt: NOW + 60 * 60 * 1000,
      calendarEventId: 'google:primary:evt-1',
      attendees: ['Ana', 'bo@acme.test'],
      space: 'space-1'
    })
    // timeMin/timeMax window derives from the injected clock.
    expect(h.requests[0]).toContain('www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(h.requests[0]).toContain(encodeURIComponent(new Date(NOW).toISOString()))
  })

  it('skips cancelled, untitled, and unstartable events', async () => {
    const h = harness({
      items: [
        event({ status: 'cancelled' }),
        event({ id: 'evt-3', summary: '   ' }),
        event({ id: 'evt-4', start: {} }),
        event({ id: 'evt-5' })
      ]
    })
    const connector = buildGoogleCalendarConnector({ now: () => NOW })
    const result = await runConnectorSync(connector.definition, {
      env: { GOOGLE_CALENDAR_TOKEN: 'gtok' },
      fetch: h.fetch,
      store: h.store,
      space: 'space-1'
    })
    expect(result.written).toBe(1)
    expect(h.created[0].properties.calendarEventId).toBe('google:primary:evt-5')
  })

  it('requires the broker-held token', async () => {
    const h = harness({ items: [] })
    const connector = buildGoogleCalendarConnector({ now: () => NOW })
    await expect(
      runConnectorSync(connector.definition, {
        env: {},
        fetch: h.fetch,
        store: h.store,
        space: 'space-1'
      })
    ).rejects.toThrow(/GOOGLE_CALENDAR_TOKEN/)
  })

  it('declares the enforced capability surface', () => {
    const connector = buildGoogleCalendarConnector()
    expect(connector.module.capabilities?.schemaWrite).toEqual([MEETING_SCHEMA])
    expect(connector.module.capabilities?.network).toEqual(['www.googleapis.com'])
    expect(connector.module.capabilities?.secrets).toEqual(['GOOGLE_CALENDAR_TOKEN'])
  })
})

describe('detectUpcomingMeeting', () => {
  it('returns the next meeting starting within the window', () => {
    const soon = event({
      id: 'soon',
      start: { dateTime: new Date(NOW + 3 * 60_000).toISOString() }
    })
    const later = event({
      id: 'later',
      start: { dateTime: new Date(NOW + 60 * 60_000).toISOString() }
    })
    expect(detectUpcomingMeeting([later, soon], NOW)?.id).toBe('soon')
  })

  it('ignores cancelled events and far-future ones', () => {
    const cancelled = event({
      id: 'c',
      status: 'cancelled',
      start: { dateTime: new Date(NOW + 60_000).toISOString() }
    })
    const far = event({ id: 'far', start: { dateTime: new Date(NOW + 60 * 60_000).toISOString() } })
    expect(detectUpcomingMeeting([cancelled, far], NOW)).toBeUndefined()
  })
})

describe('attendeeNames', () => {
  it('prefers display names, falls back to email, excludes self', () => {
    expect(attendeeNames(event({}))).toEqual(['Ana', 'bo@acme.test'])
    expect(attendeeNames(event({ attendees: undefined }))).toEqual([])
  })
})
