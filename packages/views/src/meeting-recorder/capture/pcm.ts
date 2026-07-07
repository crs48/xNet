/**
 * PCM plumbing for the meeting recorder (exploration 0279). Pure functions:
 * linear resampling (browser AudioContexts run at 44.1/48 kHz; the STT
 * engines and VAD expect 16 kHz mono) and a minimal PCM16 WAV encoder for
 * engines that only accept encoded blobs (the BYO OpenAI-compatible
 * endpoint). No audio ever persists — these buffers live and die in memory.
 */

/** The sample rate every capture channel is normalized to before transcription. */
export const MEETING_SAMPLE_RATE = 16_000

/**
 * Linear-interpolation resample. Good enough for speech-to-text (the engines
 * front their own filtering); avoids shipping a DSP dependency.
 */
export function resamplePcm(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples
  const ratio = fromRate / toRate
  const outLength = Math.max(1, Math.floor(samples.length / ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const left = Math.floor(pos)
    const right = Math.min(left + 1, samples.length - 1)
    const frac = pos - left
    out[i] = samples[left]! * (1 - frac) + samples[right]! * frac
  }
  return out
}

/** Average interleaved/multi-channel input down to mono. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0)
  if (channels.length === 1) return channels[0]!
  const length = channels[0]!.length
  const out = new Float32Array(length)
  for (const channel of channels) {
    for (let i = 0; i < length; i++) out[i] += (channel[i] ?? 0) / channels.length
  }
  return out
}

/**
 * A fixed-capacity rolling window of recent PCM — feeds `detectChannelBleed`
 * with the last ~1 s of each channel without retaining the meeting's audio.
 */
export class PcmRing {
  private buffer: Float32Array
  private length = 0

  constructor(private readonly capacity: number) {
    this.buffer = new Float32Array(capacity)
  }

  push(samples: Float32Array): void {
    if (samples.length >= this.capacity) {
      this.buffer.set(samples.subarray(samples.length - this.capacity))
      this.length = this.capacity
      return
    }
    const keep = Math.min(this.length, this.capacity - samples.length)
    if (keep > 0) this.buffer.copyWithin(0, this.length - keep, this.length)
    this.buffer.set(samples, keep)
    this.length = keep + samples.length
  }

  /** The window's samples, oldest → newest. */
  snapshot(): Float32Array {
    return this.buffer.slice(0, this.length)
  }

  get filled(): boolean {
    return this.length >= this.capacity
  }
}

/** Encode mono float PCM as a 16-bit PCM WAV file (for encoded-only engines). */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataLength = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }

  return new Uint8Array(buffer)
}
