import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import {
  MEETING_SCHEMA_IRI,
  MEETING_TRANSCRIPT_SCHEMA_IRI,
  MeetingSchema,
  MeetingTranscriptSchema,
  type MeetingSegment
} from './meeting'

describe('MeetingSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  it('has the expected schema identity and a collaborative notes body', () => {
    expect(MeetingSchema.schema['@id']).toBe(MEETING_SCHEMA_IRI)
    expect(MeetingSchema.schema.name).toBe('Meeting')
    expect(MeetingSchema.schema.document).toBe('yjs')
  })

  it('defaults visibility to private (never leaks to public surfaces)', () => {
    const meeting = MeetingSchema.create(
      { title: 'Weekly 1:1', startedAt: 1_750_000_000_000, templateId: '1on1' },
      { createdBy: testDID }
    )

    expect(meeting.visibility).toBe('private')
    expect(meeting.title).toBe('Weekly 1:1')
  })

  it('declares space-cascade authorization', () => {
    expect(MeetingSchema.schema.authorization).toBeDefined()
    expect(MeetingTranscriptSchema.schema.authorization).toBeDefined()
  })
})

describe('MeetingTranscriptSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  it('has the expected schema identity and NO document body', () => {
    expect(MeetingTranscriptSchema.schema['@id']).toBe(MEETING_TRANSCRIPT_SCHEMA_IRI)
    expect(MeetingTranscriptSchema.schema.name).toBe('MeetingTranscript')
    expect(MeetingTranscriptSchema.schema.document).toBeUndefined()
  })

  it('stores channel-attributed timed segments and engine provenance', () => {
    const segments: MeetingSegment[] = [
      { channel: 'me', text: 'Can we ship Friday?', startMs: 0, endMs: 1800 },
      { channel: 'them', text: 'Yes, pending the review.', startMs: 2100, endMs: 4200 }
    ]

    const transcript = MeetingTranscriptSchema.create(
      {
        meeting: 'meeting-node-id',
        fullText: segments.map((s) => s.text).join(' '),
        segments,
        language: 'en',
        engineId: 'parakeet-sherpa',
        modelId: 'parakeet-tdt-0.6b-v2',
        durationMs: 4200
      },
      { createdBy: testDID }
    )

    expect(transcript.segments).toHaveLength(2)
    expect(transcript.segments?.[0]?.channel).toBe('me')
    expect(transcript.engineId).toBe('parakeet-sherpa')
    expect(transcript.visibility).toBe('private')
    // Audio is opt-in: absent unless the user explicitly retains it.
    expect(transcript.audio).toBeUndefined()
  })

  it('requires the meeting relation', () => {
    const result = MeetingTranscriptSchema.validate({
      id: 'transcript-1',
      schemaId: MEETING_TRANSCRIPT_SCHEMA_IRI,
      createdAt: Date.now(),
      createdBy: testDID
    })

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'meeting')).toBe(true)
  })
})
