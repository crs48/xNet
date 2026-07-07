/**
 * PCM plumbing tests (exploration 0279): resampling, mono mixdown, WAV
 * encoding, and the bleed-check ring buffer.
 */

import { describe, expect, it } from 'vitest'
import { PcmRing, encodeWavPcm16, mixToMono, resamplePcm } from './pcm'

describe('resamplePcm', () => {
  it('returns the input untouched at equal rates', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3])
    expect(resamplePcm(samples, 16_000, 16_000)).toBe(samples)
  })

  it('halves the sample count when downsampling 2:1', () => {
    const samples = new Float32Array(48_000).fill(0.5)
    const out = resamplePcm(samples, 48_000, 16_000)
    expect(out.length).toBe(16_000)
    expect(out[0]).toBeCloseTo(0.5)
    expect(out[out.length - 1]!).toBeCloseTo(0.5)
  })

  it('interpolates between neighbours', () => {
    const out = resamplePcm(new Float32Array([0, 1]), 2, 4)
    // Position 0.5 lands halfway between 0 and 1.
    expect(out[1]).toBeCloseTo(0.5)
  })
})

describe('mixToMono', () => {
  it('passes a single channel through', () => {
    const channel = new Float32Array([0.25, -0.25])
    expect(mixToMono([channel])).toBe(channel)
  })

  it('averages stereo channels', () => {
    const out = mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])])
    expect(out[0]).toBeCloseTo(0.5)
    expect(out[1]).toBeCloseTo(0.5)
  })
})

describe('encodeWavPcm16', () => {
  it('writes a valid RIFF/WAVE header with the right sizes', () => {
    const bytes = encodeWavPcm16(new Float32Array([0, 0.5, -0.5]), 16_000)
    expect(bytes.length).toBe(44 + 6)
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + length))
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(36, 4)).toBe('data')
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(24, true)).toBe(16_000) // sample rate
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint16(34, true)).toBe(16) // bit depth
    expect(view.getUint32(40, true)).toBe(6) // data length
  })

  it('clamps out-of-range samples instead of wrapping', () => {
    const bytes = encodeWavPcm16(new Float32Array([2, -2]), 16_000)
    const view = new DataView(bytes.buffer)
    expect(view.getInt16(44, true)).toBe(0x7fff)
    expect(view.getInt16(46, true)).toBe(-0x8000)
  })
})

describe('PcmRing', () => {
  it('keeps only the newest `capacity` samples', () => {
    const ring = new PcmRing(4)
    ring.push(new Float32Array([1, 2]))
    expect(ring.filled).toBe(false)
    ring.push(new Float32Array([3, 4, 5]))
    expect(ring.filled).toBe(true)
    expect([...ring.snapshot()]).toEqual([2, 3, 4, 5])
  })

  it('handles a push larger than the capacity', () => {
    const ring = new PcmRing(3)
    ring.push(new Float32Array([1, 2, 3, 4, 5]))
    expect([...ring.snapshot()]).toEqual([3, 4, 5])
  })
})
