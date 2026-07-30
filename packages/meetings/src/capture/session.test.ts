import type { TranscriptSnapshot } from './segment-batcher'
import { FakeDictationEngine } from '@xnetjs/dictation'
import { describe, expect, it } from 'vitest'
import {
  MeetingCaptureSession,
  initialMeetingSessionState,
  meetingSessionReducer,
  type MeetingSessionState
} from './session'

const RATE = 16_000
const speech = (durationMs: number) => {
  const out = new Float32Array(Math.round((durationMs / 1000) * RATE))
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE)
  return out
}
const silence = (durationMs: number) => new Float32Array(Math.round((durationMs / 1000) * RATE))

describe('meetingSessionReducer', () => {
  const drive = (events: Parameters<typeof meetingSessionReducer>[1][]): MeetingSessionState =>
    events.reduce(meetingSessionReducer, initialMeetingSessionState)

  it('runs the happy path: start → granted → recording → stop → enhanced → done', () => {
    let state = drive([
      { type: 'start', at: 0 },
      { type: 'permissionsGranted', systemAudio: true, at: 10 }
    ])
    expect(state.status).toBe('recording')

    state = meetingSessionReducer(state, { type: 'stop', at: 60_000 })
    expect(state.status).toBe('enhancing')

    state = meetingSessionReducer(state, { type: 'enhanced' })
    expect(state).toEqual({ status: 'done', startedAt: 10, endedAt: 60_000 })
  })

  it('treats mic-only as a first-class mode, not an error', () => {
    const state = drive([
      { type: 'start', at: 0 },
      { type: 'permissionsGranted', systemAudio: false, at: 10 }
    ])
    expect(state.status).toBe('recording-mic-only')
    // Stopping from mic-only still flows through enhancement.
    const stopped = meetingSessionReducer(state, { type: 'stop', at: 500 })
    expect(stopped.status).toBe('enhancing')
  })

  it('degrades recording → mic-only when system audio dies mid-meeting', () => {
    const state = drive([
      { type: 'start', at: 0 },
      { type: 'permissionsGranted', systemAudio: true, at: 10 },
      { type: 'systemAudioLost' }
    ])
    expect(state.status).toBe('recording-mic-only')
  })

  it('pause/resume preserves the mic-only flag', () => {
    const state = drive([
      { type: 'start', at: 0 },
      { type: 'permissionsGranted', systemAudio: false, at: 10 },
      { type: 'pause' },
      { type: 'resume' }
    ])
    expect(state.status).toBe('recording-mic-only')
  })

  it('mic denial is an error; skip-enhancement also reaches done', () => {
    expect(
      drive([
        { type: 'start', at: 0 },
        { type: 'permissionsDenied', at: 5 }
      ]).status
    ).toBe('error')

    const state = drive([
      { type: 'start', at: 0 },
      { type: 'permissionsGranted', systemAudio: true, at: 10 },
      { type: 'stop', at: 100 },
      { type: 'skipEnhancement' }
    ])
    expect(state.status).toBe('done')
  })

  it('ignores invalid transitions instead of throwing', () => {
    expect(meetingSessionReducer(initialMeetingSessionState, { type: 'pause' })).toBe(
      initialMeetingSessionState
    )
  })
})

describe('MeetingCaptureSession', () => {
  it('attributes channels, transcribes chunks, and batches upserts', async () => {
    const engine = new FakeDictationEngine({
      script: (audio) => (audio.kind === 'pcm' ? `heard ${audio.samples.length}` : 'heard')
    })
    const upserts: TranscriptSnapshot[] = []
    const clock = 0
    const session = new MeetingCaptureSession({
      engine,
      onTranscript: (s) => void upserts.push(s),
      flushIntervalMs: 30_000,
      now: () => clock,
      vad: { hangoverMs: 300, minChunkMs: 100 }
    })

    // "Me" speaks, then "them" answers; silence closes both chunks.
    session.pushAudio('me', speech(1_000), RATE)
    session.pushAudio('me', silence(1_000), RATE)
    session.pushAudio('them', speech(1_500), RATE)
    session.pushAudio('them', silence(1_000), RATE)

    const final = await session.stop()

    expect(engine.calls.length).toBeGreaterThanOrEqual(2)
    expect(final.segments.map((s) => s.channel)).toContain('me')
    expect(final.segments.map((s) => s.channel)).toContain('them')
    // Every segment carries stream-relative timings.
    for (const segment of final.segments) {
      expect(segment.endMs).toBeGreaterThan(segment.startMs)
    }
    // stop() forces the final upsert even inside the flush interval.
    expect(upserts.length).toBeGreaterThanOrEqual(1)
    expect(upserts[upserts.length - 1].fullText).toBe(final.fullText)
  })

  it('reports engine failures per channel without killing capture', async () => {
    const failing = new FakeDictationEngine({})
    failing.transcribe = async () => {
      throw new Error('model exploded')
    }
    const errors: Array<{ channel: string }> = []
    const session = new MeetingCaptureSession({
      engine: failing,
      onTranscript: () => {},
      onError: (_err, channel) => void errors.push({ channel }),
      vad: { hangoverMs: 300, minChunkMs: 100 }
    })

    session.pushAudio('me', speech(1_000), RATE)
    session.pushAudio('me', silence(1_000), RATE)
    const final = await session.stop()

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors[0].channel).toBe('me')
    expect(final.segments).toEqual([])
  })

  it('ignores audio pushed after stop()', async () => {
    const engine = new FakeDictationEngine({})
    const session = new MeetingCaptureSession({ engine, onTranscript: () => {} })
    await session.stop()
    session.pushAudio('me', speech(1_000), RATE)
    expect(engine.calls).toHaveLength(0)
  })
})
