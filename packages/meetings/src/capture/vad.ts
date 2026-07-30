/**
 * Energy-based voice-activity chunker (exploration 0279).
 *
 * Splits a continuous PCM stream into speech chunks sized for one-shot
 * `DictationEngine.transcribe()` calls. Deliberately simple — RMS energy with
 * hangover — because it only decides *where to cut*, not what is speech; a
 * mis-cut costs a slightly odd chunk boundary, never lost audio (silence-only
 * stretches are dropped, everything else is emitted).
 *
 * Guarantees:
 * - a chunk is emitted no later than `maxChunkMs` after it started (so live
 *   transcripts stay live during monologues), and
 * - trailing speech is flushed on `end()` regardless of size.
 */

export interface VadChunk {
  /** Mono PCM samples normalized to [-1, 1]. */
  samples: Float32Array
  /** Start offset of the chunk within the stream, in milliseconds. */
  startMs: number
  /** End offset of the chunk within the stream, in milliseconds. */
  endMs: number
}

export interface VadOptions {
  /** Samples per second of the pushed PCM (e.g. 16000). */
  sampleRate: number
  /** RMS below this is treated as silence. Default 0.01 (-40 dBFS-ish). */
  energyThreshold?: number
  /** Analysis window, ms. Default 30. */
  frameMs?: number
  /**
   * How long a silence must last before it closes a chunk, ms. Default 700 —
   * short pauses stay inside one chunk so sentences aren't split mid-breath.
   */
  hangoverMs?: number
  /** Never emit a chunk shorter than this, ms (dropped as noise). Default 250. */
  minChunkMs?: number
  /** Force-emit a chunk at this length even mid-speech, ms. Default 25_000. */
  maxChunkMs?: number
}

const rms = (samples: Float32Array, from: number, to: number): number => {
  let sum = 0
  for (let i = from; i < to; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / Math.max(1, to - from))
}

/**
 * Push-based chunker: feed arbitrary-sized PCM buffers, get speech chunks out.
 * One instance per capture channel; not thread-safe (single pusher).
 */
export class VadChunker {
  private readonly sampleRate: number
  private readonly threshold: number
  private readonly frameSamples: number
  private readonly hangoverFrames: number
  private readonly minChunkSamples: number
  private readonly maxChunkSamples: number

  /** Frames not yet analyzed (carry between push() calls). */
  private pending: Float32Array = new Float32Array(0)
  /** Samples of the chunk currently being built (speech + inner silence). */
  private current: Float32Array[] = []
  private currentSamples = 0
  private chunkStartSample = -1
  private silentFrames = 0
  /** Total samples consumed from the stream so far. */
  private consumed = 0

  constructor(options: VadOptions) {
    this.sampleRate = options.sampleRate
    this.threshold = options.energyThreshold ?? 0.01
    this.frameSamples = Math.max(1, Math.round(((options.frameMs ?? 30) / 1000) * this.sampleRate))
    this.hangoverFrames = Math.max(
      1,
      Math.round((options.hangoverMs ?? 700) / (options.frameMs ?? 30))
    )
    this.minChunkSamples = Math.round(((options.minChunkMs ?? 250) / 1000) * this.sampleRate)
    this.maxChunkSamples = Math.round(((options.maxChunkMs ?? 25_000) / 1000) * this.sampleRate)
  }

  /** Feed PCM; returns any chunks completed by this push. */
  push(samples: Float32Array): VadChunk[] {
    // Concatenate the carry-over with the new buffer.
    const buf = new Float32Array(this.pending.length + samples.length)
    buf.set(this.pending, 0)
    buf.set(samples, this.pending.length)

    const chunks: VadChunk[] = []
    let offset = 0

    while (offset + this.frameSamples <= buf.length) {
      const frame = buf.subarray(offset, offset + this.frameSamples)
      const speech = rms(frame, 0, frame.length) >= this.threshold
      const frameStartSample = this.consumed

      if (speech || this.chunkStartSample >= 0) {
        if (this.chunkStartSample < 0) this.chunkStartSample = frameStartSample
        this.current.push(frame.slice())
        this.currentSamples += frame.length
        this.silentFrames = speech ? 0 : this.silentFrames + 1

        const silenceClosed = this.silentFrames >= this.hangoverFrames
        const maxed = this.currentSamples >= this.maxChunkSamples
        if (silenceClosed || maxed) {
          const chunk = this.takeChunk(silenceClosed)
          if (chunk) chunks.push(chunk)
        }
      }

      this.consumed += frame.length
      offset += this.frameSamples
    }

    this.pending = buf.slice(offset)
    return chunks
  }

  /** Flush any trailing speech (call when the stream ends or on pause). */
  end(): VadChunk[] {
    const chunk = this.takeChunk(false)
    this.pending = new Float32Array(0)
    return chunk ? [chunk] : []
  }

  private takeChunk(trimHangover: boolean): VadChunk | null {
    if (this.chunkStartSample < 0 || this.currentSamples === 0) {
      this.resetChunk()
      return null
    }

    const all = new Float32Array(this.currentSamples)
    let cursor = 0
    for (const part of this.current) {
      all.set(part, cursor)
      cursor += part.length
    }

    // Drop the trailing silence that closed the chunk — it carries no speech.
    let end = all.length
    if (trimHangover) {
      const hangoverSamples = this.hangoverFrames * this.frameSamples
      if (end > hangoverSamples) end -= hangoverSamples
    }

    const startSample = this.chunkStartSample
    this.resetChunk()

    if (end < this.minChunkSamples) return null

    const toMs = (s: number) => Math.round((s / this.sampleRate) * 1000)
    return {
      samples: all.slice(0, end),
      startMs: toMs(startSample),
      endMs: toMs(startSample + end)
    }
  }

  private resetChunk(): void {
    this.current = []
    this.currentSamples = 0
    this.chunkStartSample = -1
    this.silentFrames = 0
  }
}
