import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAMERA_LAYOUT,
  RECORDING_SCHEMA_IRI,
  RECORDING_TRANSCRIPT_SCHEMA_IRI,
  RecordingSchema,
  RecordingTranscriptSchema,
  type Cut,
  type RecordingSegment
} from './recording'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

describe('RecordingSchema', () => {
  it('has the expected schema identity and a collaborative notes body', () => {
    expect(RecordingSchema.schema['@id']).toBe(RECORDING_SCHEMA_IRI)
    expect(RecordingSchema.schema.name).toBe('Recording')
    expect(RecordingSchema.schema.document).toBe('yjs')
  })

  it('defaults visibility to private — a screencast may show anything', () => {
    const recording = RecordingSchema.create(
      { title: 'Walkthrough', startedAt: 1_750_000_000_000 },
      { createdBy: testDID }
    )

    expect(recording.visibility).toBe('private')
  })

  it('defaults to not truncated — a partial recording must be distinguishable', () => {
    const recording = RecordingSchema.create({ title: 'Walkthrough' }, { createdBy: testDID })

    expect(recording.truncated).toBe(false)
  })

  it('carries the edit as a cut list rather than a re-rendered file', () => {
    const cuts: Cut[] = [
      { startMs: 1_000, endMs: 2_400, reason: 'silence', enabled: true },
      { startMs: 9_000, endMs: 9_300, reason: 'filler', enabled: false }
    ]

    const recording = RecordingSchema.create(
      { title: 'Walkthrough', durationMs: 60_000, cuts, cameraLayout: DEFAULT_CAMERA_LAYOUT },
      { createdBy: testDID }
    )

    expect(recording.cuts).toHaveLength(2)
    expect(recording.cuts?.[1]?.enabled).toBe(false)
    expect(recording.cameraLayout?.corner).toBe('bottom-left')
  })

  it('declares space-cascade authorization on both nodes', () => {
    expect(RecordingSchema.schema.authorization).toBeDefined()
    expect(RecordingTranscriptSchema.schema.authorization).toBeDefined()
  })
})

describe('RecordingTranscriptSchema', () => {
  it('has the expected schema identity and NO document body', () => {
    expect(RecordingTranscriptSchema.schema['@id']).toBe(RECORDING_TRANSCRIPT_SCHEMA_IRI)
    expect(RecordingTranscriptSchema.schema.name).toBe('RecordingTranscript')
    expect(RecordingTranscriptSchema.schema.document).toBeUndefined()
  })

  it('stores timed segments with optional word-level timings', () => {
    const segments: RecordingSegment[] = [
      {
        text: 'Here is the dashboard',
        startMs: 0,
        endMs: 1_800,
        words: [
          { text: 'Here', startMs: 0, endMs: 300 },
          { text: 'is', startMs: 300, endMs: 450 }
        ]
      }
    ]

    const transcript = RecordingTranscriptSchema.create(
      { recording: 'node-1', fullText: 'Here is the dashboard', segments, engineId: 'whisper-cpp' },
      { createdBy: testDID }
    )

    expect(transcript.segments?.[0]?.words).toHaveLength(2)
    expect(transcript.visibility).toBe('private')
  })

  it('defaults verbatim to false — filler cutting stays gated on a verbatim engine', () => {
    const transcript = RecordingTranscriptSchema.create(
      { recording: 'node-1' },
      { createdBy: testDID }
    )

    expect(transcript.verbatim).toBe(false)
  })
})
