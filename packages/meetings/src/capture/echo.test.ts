import { describe, expect, it } from 'vitest'
import { detectChannelBleed } from './echo'

const RATE = 16_000

/** Deterministic pseudo-noise (no Math.random — keeps the spec reproducible). */
const noise = (n: number, seed: number) => {
  const out = new Float32Array(n)
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    out[i] = (x / 0xffffffff) * 2 - 1
  }
  return out
}

describe('detectChannelBleed', () => {
  const system = noise(RATE, 42) // 1s of far-end audio

  it('flags a delayed, attenuated copy of the system audio in the mic', () => {
    const lagSamples = Math.round(0.05 * RATE) // 50ms speaker→mic delay
    const mic = new Float32Array(RATE)
    for (let i = lagSamples; i < RATE; i++) {
      mic[i] = 0.4 * system[i - lagSamples] // bleed
    }
    // Plus the user's own (independent) speech on top.
    const own = noise(RATE, 7)
    for (let i = 0; i < RATE; i++) mic[i] += 0.3 * own[i]

    const result = detectChannelBleed(mic, system, { sampleRate: RATE })
    expect(result.bleeding).toBe(true)
    expect(result.lagMs).toBeGreaterThanOrEqual(40)
    expect(result.lagMs).toBeLessThanOrEqual(60)
  })

  it('stays quiet when the mic carries only independent speech (AEC working)', () => {
    const mic = noise(RATE, 7) // uncorrelated with `system`
    const result = detectChannelBleed(mic, system, { sampleRate: RATE })
    expect(result.bleeding).toBe(false)
    expect(result.correlation).toBeLessThan(0.2)
  })

  it('handles silence and empty windows without dividing by zero', () => {
    expect(detectChannelBleed(new Float32Array(RATE), system, { sampleRate: RATE }).bleeding).toBe(
      false
    )
    expect(
      detectChannelBleed(noise(RATE, 3), new Float32Array(RATE), { sampleRate: RATE }).bleeding
    ).toBe(false)
    expect(
      detectChannelBleed(new Float32Array(0), new Float32Array(0), { sampleRate: RATE }).bleeding
    ).toBe(false)
  })
})
