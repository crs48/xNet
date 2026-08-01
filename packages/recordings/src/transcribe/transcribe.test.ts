import type { DictationEngine, TranscriptResult } from '@xnetjs/dictation'
import { describe, expect, it, vi } from 'vitest'
import {
  engineIsVerbatim,
  toRecordingSegments,
  transcribeRecording,
  type TranscribeChunk
} from './transcribe'

const result = (overrides: Partial<TranscriptResult> = {}): TranscriptResult => ({
  text: 'hello there',
  durationMs: 1_000,
  engineId: 'whisper-cpp',
  modelId: 'large-v3-turbo',
  ...overrides
})

const engine = (transcribe: DictationEngine['transcribe'], id = 'whisper-cpp'): DictationEngine =>
  ({
    descriptor: { id, name: id, languages: ['en'], onDevice: true },
    isReady: async () => true,
    ensureModel: async () => undefined,
    transcribe
  }) as unknown as DictationEngine

const chunk = (startMs: number, seconds = 1): TranscribeChunk => ({
  samples: new Float32Array(16_000 * seconds),
  sampleRate: 16_000,
  startMs
})

describe('toRecordingSegments', () => {
  it('offsets segment timings onto the source timeline', () => {
    const segments = toRecordingSegments(
      result({ segments: [{ text: 'hi', startMs: 100, endMs: 400 }] }),
      30_000,
      1_000
    )

    expect(segments).toEqual([{ text: 'hi', startMs: 30_100, endMs: 30_400 }])
  })

  it('offsets word timings too', () => {
    const segments = toRecordingSegments(
      result({
        segments: [
          {
            text: 'hi there',
            startMs: 0,
            endMs: 500,
            words: [
              { text: 'hi', startMs: 0, endMs: 200 },
              { text: 'there', startMs: 250, endMs: 500 }
            ]
          }
        ]
      }),
      10_000,
      1_000
    )

    expect(segments[0]?.words).toEqual([
      { text: 'hi', startMs: 10_000, endMs: 10_200 },
      { text: 'there', startMs: 10_250, endMs: 10_500 }
    ])
  })

  it('synthesises one span when the engine returns no breakdown', () => {
    expect(toRecordingSegments(result(), 5_000, 2_000)).toEqual([
      { text: 'hello there', startMs: 5_000, endMs: 7_000 }
    ])
  })

  it('drops empty text rather than storing blank segments', () => {
    expect(toRecordingSegments(result({ text: '   ' }), 0, 1_000)).toEqual([])
    expect(
      toRecordingSegments(result({ segments: [{ text: ' ', startMs: 0, endMs: 10 }] }), 0, 1_000)
    ).toEqual([])
  })
})

describe('transcribeRecording', () => {
  it('accumulates segments across chunks with absolute offsets', async () => {
    const transcribe = vi
      .fn()
      .mockResolvedValueOnce(
        result({ text: 'first', segments: [{ text: 'first', startMs: 0, endMs: 900 }] })
      )
      .mockResolvedValueOnce(
        result({ text: 'second', segments: [{ text: 'second', startMs: 0, endMs: 800 }] })
      )

    const outcome = await transcribeRecording(engine(transcribe), [chunk(0), chunk(1_000)])

    expect(outcome.segments).toEqual([
      { text: 'first', startMs: 0, endMs: 900 },
      { text: 'second', startMs: 1_000, endMs: 1_800 }
    ])
    expect(outcome.fullText).toBe('first second')
    expect(outcome.partial).toBe(false)
  })

  it('emits segments incrementally so the UI can persist as it goes', async () => {
    const onSegments = vi.fn()
    await transcribeRecording(
      engine(vi.fn().mockResolvedValue(result())),
      [chunk(0), chunk(1_000)],
      { onSegments }
    )

    expect(onSegments).toHaveBeenCalledTimes(2)
  })

  it('keeps earlier segments but reports a mid-run failure as partial', async () => {
    const transcribe = vi
      .fn()
      .mockResolvedValueOnce(result({ text: 'kept' }))
      .mockRejectedValueOnce(new Error('engine died'))

    const outcome = await transcribeRecording(engine(transcribe), [chunk(0), chunk(1_000)])

    expect(outcome.segments).toHaveLength(1)
    expect(outcome.partial).toBe(true)
    expect(outcome.failureReason).toBe('engine died')
  })

  it('stops at a failed chunk instead of leaving an unmarked hole', async () => {
    const transcribe = vi
      .fn()
      .mockResolvedValueOnce(result({ text: 'one' }))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(result({ text: 'three' }))

    const outcome = await transcribeRecording(engine(transcribe), [
      chunk(0),
      chunk(1_000),
      chunk(2_000)
    ])

    expect(transcribe).toHaveBeenCalledTimes(2)
    expect(outcome.fullText).toBe('one')
  })

  it('honours an abort signal between chunks', async () => {
    const controller = new AbortController()
    const transcribe = vi.fn().mockImplementation(async () => {
      controller.abort()
      return result({ text: 'one' })
    })

    const outcome = await transcribeRecording(engine(transcribe), [chunk(0), chunk(1_000)], {
      signal: controller.signal
    })

    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(outcome.partial).toBe(true)
    expect(outcome.failureReason).toMatch(/cancelled/)
  })

  it('records engine and model provenance from the result', async () => {
    const outcome = await transcribeRecording(
      engine(vi.fn().mockResolvedValue(result({ language: 'en' }))),
      [chunk(0)]
    )

    expect(outcome.engineId).toBe('whisper-cpp')
    expect(outcome.modelId).toBe('large-v3-turbo')
    expect(outcome.language).toBe('en')
  })

  it('reports a duration covering every chunk consumed', async () => {
    const outcome = await transcribeRecording(engine(vi.fn().mockResolvedValue(result())), [
      chunk(0, 2),
      chunk(2_000, 3)
    ])

    expect(outcome.durationMs).toBe(5_000)
  })

  it('handles an empty recording without failing', async () => {
    const outcome = await transcribeRecording(engine(vi.fn()), [])

    expect(outcome.segments).toEqual([])
    expect(outcome.partial).toBe(false)
  })
})

describe('engineIsVerbatim', () => {
  it('gates filler cutting to engines that actually keep disfluencies', () => {
    expect(engineIsVerbatim('crisper-whisper')).toBe(true)
    expect(engineIsVerbatim('whisper-cpp')).toBe(false)
    expect(engineIsVerbatim('parakeet-sherpa')).toBe(false)
  })
})
