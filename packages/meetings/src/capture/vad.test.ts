import { describe, expect, it } from 'vitest'
import { VadChunker } from './vad'

const RATE = 16_000

/** ms of samples at the test rate. */
const ms = (n: number) => Math.round((n / 1000) * RATE)

const silence = (durationMs: number) => new Float32Array(ms(durationMs))

const speech = (durationMs: number, amplitude = 0.5) => {
  const out = new Float32Array(ms(durationMs))
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE)
  }
  return out
}

const chunker = () =>
  new VadChunker({ sampleRate: RATE, hangoverMs: 300, minChunkMs: 100, maxChunkMs: 5_000 })

describe('VadChunker', () => {
  it('emits nothing for pure silence', () => {
    const vad = chunker()
    expect(vad.push(silence(3_000))).toEqual([])
    expect(vad.end()).toEqual([])
  })

  it('closes a chunk after the hangover silence and reports stream offsets', () => {
    const vad = chunker()
    const chunks = [
      ...vad.push(silence(1_000)),
      ...vad.push(speech(1_000)),
      ...vad.push(silence(1_000))
    ]

    expect(chunks).toHaveLength(1)
    const [chunk] = chunks
    // Started when speech started (~1s into the stream)…
    expect(chunk.startMs).toBeGreaterThanOrEqual(900)
    expect(chunk.startMs).toBeLessThanOrEqual(1_100)
    // …and the trailing hangover silence is trimmed off.
    expect(chunk.endMs - chunk.startMs).toBeGreaterThanOrEqual(800)
    expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(1_300)
  })

  it('force-emits mid-speech at maxChunkMs so monologues stay live', () => {
    const vad = chunker()
    const chunks = vad.push(speech(12_000))
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const chunk of chunks) {
      expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(5_100)
    }
  })

  it('flushes trailing speech on end()', () => {
    const vad = chunker()
    expect(vad.push(speech(500))).toEqual([]) // no closing silence yet
    const chunks = vad.end()
    expect(chunks).toHaveLength(1)
    expect(chunks[0].startMs).toBe(0)
  })

  it('drops blips shorter than minChunkMs as noise', () => {
    const vad = chunker()
    const chunks = [...vad.push(speech(50)), ...vad.push(silence(1_000)), ...vad.end()]
    expect(chunks).toEqual([])
  })

  it('keeps short pauses inside one chunk (no mid-sentence splits)', () => {
    const vad = chunker()
    const chunks = [
      ...vad.push(speech(800)),
      ...vad.push(silence(150)), // shorter than the 300ms hangover
      ...vad.push(speech(800)),
      ...vad.push(silence(1_000))
    ]
    expect(chunks).toHaveLength(1)
  })
})
