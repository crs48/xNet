import { describe, expect, it } from 'vitest'
import { EventSchema, RsvpSchema, rsvpId, upcomingEvents } from './event'

const NOW = 1_000_000

describe('Event', () => {
  it('carries the date field CalendarView needs', () => {
    expect(Object.keys(EventSchema._properties)).toEqual(expect.arrayContaining(['startsAt']))
    const ev = EventSchema.create(
      { title: 'Office hours', startsAt: NOW },
      { createdBy: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' }
    )
    expect(ev.startsAt).toBe(NOW)
    expect(ev.cancelled).toBe('scheduled')
  })
})

describe('Rsvp', () => {
  it('has a deterministic id so changing your response upserts', () => {
    expect(rsvpId('ev1', 'did:key:alice')).toBe('rsvp:ev1:did:key:alice')
  })

  it('lets the space see who is coming', () => {
    // A gathering is pointless if you cannot see who else is going. This is a
    // stated intention, not a behavioural signal — and nothing ranks members
    // by attendance (exploration 0359).
    expect(RsvpSchema.schema.authorization?.actions?.read).toMatchObject({
      roles: expect.arrayContaining(['spaceMember'])
    })
  })
})

describe('upcomingEvents', () => {
  const ev = (startsAt: number, over: Record<string, unknown> = {}) =>
    ({ startsAt, cancelled: 'scheduled', ...over }) as Parameters<typeof upcomingEvents>[0][number]

  it('sorts soonest first', () => {
    const out = upcomingEvents([ev(NOW + 500), ev(NOW + 100), ev(NOW + 300)], NOW)
    expect(out.map((e) => e.startsAt)).toEqual([NOW + 100, NOW + 300, NOW + 500])
  })

  it('drops past events', () => {
    expect(upcomingEvents([ev(NOW - 1)], NOW)).toHaveLength(0)
  })

  it('keeps an event that has started but not ended', () => {
    expect(upcomingEvents([ev(NOW - 500, { endsAt: NOW + 500 })], NOW)).toHaveLength(1)
  })

  it('drops cancelled events even when still in the future', () => {
    expect(upcomingEvents([ev(NOW + 500, { cancelled: 'cancelled' })], NOW)).toHaveLength(0)
  })
})
