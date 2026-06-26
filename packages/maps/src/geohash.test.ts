import { describe, expect, it } from 'vitest'
import { geohashBounds, geohashCellsForBounds, geohashEncode, type GeoBox } from './geohash'

describe('geohashEncode', () => {
  it('matches well-known reference encodings', () => {
    // Classic geohash test vectors.
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj')
    expect(geohashEncode(42.6, -5.6, 5)).toBe('ezs42')
  })

  it('honors precision (length) and bounds it to 1..12', () => {
    expect(geohashEncode(37.77, -122.42, 6)).toHaveLength(6)
    expect(geohashEncode(37.77, -122.42, 0)).toHaveLength(1)
    expect(geohashEncode(37.77, -122.42, 99)).toHaveLength(12)
  })

  it('encodes a longer prefix that contains its shorter prefix (containment)', () => {
    const long = geohashEncode(51.5, -0.13, 8)
    const short = geohashEncode(51.5, -0.13, 4)
    expect(long.startsWith(short)).toBe(true)
  })

  it('wraps longitude and clamps latitude into range', () => {
    // 200° lon wraps to -160°; 100° lat clamps to 90°.
    expect(geohashEncode(100, 200, 6)).toBe(geohashEncode(90, -160, 6))
  })
})

describe('geohashBounds', () => {
  it('round-trips: the encoded point lies inside its decoded cell', () => {
    const lat = 48.8566
    const lon = 2.3522
    const [w, s, e, n] = geohashBounds(geohashEncode(lat, lon, 9))
    expect(lon).toBeGreaterThanOrEqual(w)
    expect(lon).toBeLessThanOrEqual(e)
    expect(lat).toBeGreaterThanOrEqual(s)
    expect(lat).toBeLessThanOrEqual(n)
  })

  it('throws on an invalid character', () => {
    expect(() => geohashBounds('abc')).toThrow(/Invalid geohash/)
  })
})

describe('geohashCellsForBounds', () => {
  const within = (box: GeoBox, lat: number, lon: number, cells: string[]): boolean => {
    const h = geohashEncode(lat, lon, 12)
    return cells.some((c) => h.startsWith(c))
  }

  it('returns a bounded, non-empty cover for a city-scale box', () => {
    const box: GeoBox = [-0.2, 51.4, 0.0, 51.6] // London-ish
    const cells = geohashCellsForBounds(box, 64)
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.length).toBeLessThanOrEqual(64 * 4)
  })

  it('covers points inside the box (prefix-match)', () => {
    const box: GeoBox = [-0.2, 51.4, 0.0, 51.6]
    const cells = geohashCellsForBounds(box, 64)
    expect(within(box, 51.5, -0.1, cells)).toBe(true)
    expect(within(box, 51.45, -0.15, cells)).toBe(true)
  })

  it('coarsens to a handful of short prefixes for a whole-world box', () => {
    const cells = geohashCellsForBounds([-180, -85, 180, 85], 32)
    expect(cells.length).toBeGreaterThan(0)
    // Whole-world coarsens to length-1 prefixes, not deep cells.
    expect(Math.max(...cells.map((c) => c.length))).toBeLessThanOrEqual(2)
  })

  it('handles an antimeridian-wrapped box (west > east)', () => {
    const box: GeoBox = [170, -10, -170, 10] // crosses 180°
    const cells = geohashCellsForBounds(box, 64)
    expect(cells.length).toBeGreaterThan(0)
    expect(within(box, 0, 175, cells)).toBe(true)
    expect(within(box, 0, -175, cells)).toBe(true)
  })
})
