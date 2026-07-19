/**
 * Event / Rsvp — scheduled gatherings inside a Space (0359).
 *
 * The "calendar" half of a community. `CalendarView` already renders rows with
 * a date field, so an Event is a node with `startsAt`/`endsAt` that the
 * existing database views can display without new rendering code.
 *
 * Distinct from `Meeting` (`meeting.ts`), which is a *recording* — transcript,
 * diarization, summary. An Event is an *invitation*: it exists before anyone
 * shows up, and `attendees` on Meeting is transcript attribution, not RSVPs.
 *
 * Events matter here because the retention evidence points at commitment
 * devices rather than content: live gatherings work by putting a shared time
 * in the diary and generating ties, not by being a better delivery format.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, number, relation, select, text } from '../properties'
import { spaceCascadeAuthorization, spaceContributorAuthorization } from './space-authorization'

export const EVENT_SCHEMA_IRI = 'xnet://xnet.fyi/Event@1.0.0'
export const RSVP_SCHEMA_IRI = 'xnet://xnet.fyi/Rsvp@1.0.0'

export const EventSchema = defineSchema({
  name: 'Event',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text({ required: true, maxLength: 300 }),
    description: text({ maxLength: 2000 }),
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Start, ms since epoch. The field CalendarView sorts and places on. */
    startsAt: number({ required: true }),
    /** End, ms since epoch. Absent = a point in time rather than a range. */
    endsAt: number({}),

    /** Where — a URL for online, a place for in-person. Free text either way. */
    location: text({ maxLength: 500 }),

    /**
     * IANA timezone the host scheduled in (e.g. `Europe/London`), so a
     * recurring community call renders correctly for everyone else. Absent =
     * render in the viewer's local zone.
     */
    timezone: text({ maxLength: 80 }),

    cancelled: select({
      options: [
        { id: 'scheduled', name: 'Scheduled', color: 'green' },
        { id: 'cancelled', name: 'Cancelled', color: 'red' }
      ] as const,
      default: 'scheduled'
    }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

/**
 * One person's response to one Event.
 *
 * A membership-edge shape like `SpaceMembership`, with a deterministic id (see
 * {@link rsvpId}) so changing your mind upserts instead of duplicating.
 *
 * RSVPs ARE readable by the space — knowing who else is coming is the point of
 * a gathering, and it is a stated intention rather than a behavioural signal.
 * That is the line: attendance is not a score, and nothing ranks members by
 * how often they show up.
 */
export const RsvpSchema = defineSchema({
  name: 'Rsvp',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    event: relation({ target: 'xnet://xnet.fyi/Event@1.0.0' as const, required: true }),
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),
    response: select({
      options: [
        { id: 'going', name: 'Going', color: 'green' },
        { id: 'maybe', name: 'Maybe', color: 'yellow' },
        { id: 'declined', name: 'Not going', color: 'gray' }
      ] as const,
      required: true,
      default: 'going'
    }),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceContributorAuthorization()
})

export type Event = InferNode<(typeof EventSchema)['_properties']>
export type Rsvp = InferNode<(typeof RsvpSchema)['_properties']>

/** Deterministic RSVP id so changing your response upserts. */
export function rsvpId(eventId: string, memberDid: string): string {
  return `rsvp:${eventId}:${memberDid}`
}

/** Upcoming events, soonest first. Time ordering, like every calm surface. */
export const upcomingEvents = <T extends Pick<Event, 'startsAt' | 'endsAt' | 'cancelled'>>(
  events: readonly T[],
  now: number
): T[] =>
  events
    .filter((e) => e.cancelled !== 'cancelled' && (e.endsAt ?? e.startsAt ?? 0) >= now)
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
