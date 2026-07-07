/**
 * Phase-4 modules: in-person (mobile) mode, diarization merge, opt-in audio
 * retention (exploration 0279).
 */

import type { MeetingSegment } from '@xnetjs/data'
import { FakeDictationEngine } from '@xnetjs/dictation'
import { describe, expect, it } from 'vitest'
import { applyDiarization, type SpeakerTurn } from '../enhance/diarization'
import { InPersonRecorder } from './in-person'
import { encodeWav, persistMeetingAudio } from './retain-audio'

const RATE = 16_000
const speech = (durationMs: number) => {
  const out = new Float32Array(Math.round((durationMs / 1000) * RATE))
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE)
  return out
}
const silence = (durationMs: number) => new Float32Array(Math.round((durationMs / 1000) * RATE))

describe('InPersonRecorder', () => {
  it('records, then transcribes post-hoc with progress — all on the me channel', async () => {
    const recorder = new InPersonRecorder({ sampleRate: RATE })
    recorder.push(speech(1_000))
    recorder.push(silence(1_000))
    recorder.push(speech(1_000))
    expect(recorder.durationMs).toBe(3_000)

    const engine = new FakeDictationEngine({ script: 'spoken words' })
    const progress: Array<[number, number]> = []
    const snapshot = await recorder.finish(engine, {
      onProgress: (done, total) => void progress.push([done, total]),
      vad: { hangoverMs: 300, minChunkMs: 100 }
    })

    expect(snapshot.segments.length).toBeGreaterThanOrEqual(2)
    expect(snapshot.segments.every((s) => s.channel === 'me')).toBe(true)
    // No transcription happened while recording — only at finish().
    expect(engine.calls.length).toBe(snapshot.segments.length)
    expect(progress[progress.length - 1][0]).toBe(progress[progress.length - 1][1])
    // Segment timings are recording-relative and ordered.
    expect(snapshot.segments[0].startMs).toBeLessThan(snapshot.segments[1].startMs)
  })

  it('ignores audio pushed after finish()', async () => {
    const recorder = new InPersonRecorder({ sampleRate: RATE })
    recorder.push(speech(500))
    await recorder.finish(new FakeDictationEngine({}), { vad: { minChunkMs: 100 } })
    recorder.push(speech(500))
    expect(recorder.durationMs).toBe(500)
  })
})

describe('applyDiarization', () => {
  const segments: MeetingSegment[] = [
    { channel: 'me', text: 'my question', startMs: 0, endMs: 2_000 },
    { channel: 'them', text: 'first answer', startMs: 2_500, endMs: 5_000 },
    { channel: 'them', text: 'second voice', startMs: 5_500, endMs: 8_000 },
    { channel: 'them', text: 'outside any turn', startMs: 20_000, endMs: 21_000 }
  ]
  const turns: SpeakerTurn[] = [
    { speakerIndex: 0, startMs: 2_000, endMs: 5_200 },
    { speakerIndex: 1, startMs: 5_200, endMs: 9_000 }
  ]

  it('labels them-segments by best overlap, seeding names from attendees', () => {
    const labelled = applyDiarization(segments, turns, ['Ana', 'Bo'])
    expect(labelled[0].speaker).toBeUndefined() // me: already attributed
    expect(labelled[1].speaker).toBe('Ana')
    expect(labelled[2].speaker).toBe('Bo')
    expect(labelled[3].speaker).toBeUndefined() // no overlap → never guess
    // Channels are preserved so the UI can always fall back.
    expect(labelled.every((s, i) => s.channel === segments[i].channel)).toBe(true)
  })

  it('falls back to Speaker N when attendees run out, and no-ops without turns', () => {
    const labelled = applyDiarization(segments, turns, ['Ana'])
    expect(labelled[2].speaker).toBe('Speaker 2')
    expect(applyDiarization(segments, [])).toBe(segments)
  })
})

describe('audio retention (opt-in)', () => {
  it('encodes valid 16-bit mono WAV', () => {
    const wav = encodeWav(speech(100), RATE)
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe('RIFF')
    expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe('WAVE')
    expect(view.getUint32(24, true)).toBe(RATE)
    expect(view.getUint16(34, true)).toBe(16)
    expect(wav.byteLength).toBe(44 + Math.round(0.1 * RATE) * 2)
  })

  it('puts bytes in the blob store and returns only a file reference', async () => {
    const puts: Uint8Array[] = []
    const putBlob = async (bytes: Uint8Array) => {
      puts.push(bytes)
      return { cid: 'cid:blake3:fake' }
    }
    const ref = await persistMeetingAudio(putBlob, 'them', speech(100), RATE)
    expect(puts).toHaveLength(1)
    expect(ref).toEqual({
      cid: 'cid:blake3:fake',
      name: 'meeting-them.wav',
      mimeType: 'audio/wav',
      size: puts[0].byteLength
    })
  })
})
