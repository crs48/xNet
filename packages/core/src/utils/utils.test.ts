import { describe, expect, it } from 'vitest'
import { clamp, clamp01, formatBytes } from './index'

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('clamps below the minimum', () => {
    expect(clamp(-3, 0, 10)).toBe(0)
  })

  it('clamps above the maximum', () => {
    expect(clamp(42, 0, 10)).toBe(10)
  })

  it('handles inclusive bounds', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('clamp01', () => {
  it('clamps into [0, 1]', () => {
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
  })
})

describe('formatBytes', () => {
  it('formats sub-kilobyte values as integer bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('scales through binary units', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB')
  })

  it('does not cap at megabytes (regression: the old devtools copy did)', () => {
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB')
    expect(formatBytes(3 * 1024 ** 4)).toBe('3.0 TB')
    expect(formatBytes(2 * 1024 ** 5)).toBe('2.0 PB')
  })

  it('handles negative and non-finite input', () => {
    expect(formatBytes(-1536)).toBe('-1.5 KB')
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—')
  })
})
