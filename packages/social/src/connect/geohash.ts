/**
 * Geohash proximity for in-person intents (exploration 0174, phase 3).
 *
 * A `ConnectableProfile` stores only a COARSE geohash cell (default 5 chars ≈
 * 5km), never exact coordinates. Proximity is decided by shared prefix length;
 * k-anonymity is achieved by querying a cell plus its neighbours so the index
 * cannot single out the querier. Proximity queries must be rate-limited by the
 * caller to defeat walk-test triangulation.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export type GeohashBounds = { lat: number; lon: number; latError: number; lonError: number }

/** Encode latitude/longitude to a geohash of the given precision (default 5). */
export function encodeGeohash(lat: number, lon: number, precision = 5): string {
  let latRange = [-90, 90]
  let lonRange = [-180, 180]
  let hash = ''
  let bit = 0
  let ch = 0
  let even = true

  while (hash.length < precision) {
    if (even) {
      const mid = (lonRange[0] + lonRange[1]) / 2
      if (lon >= mid) {
        ch = (ch << 1) | 1
        lonRange = [mid, lonRange[1]]
      } else {
        ch = ch << 1
        lonRange = [lonRange[0], mid]
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2
      if (lat >= mid) {
        ch = (ch << 1) | 1
        latRange = [mid, latRange[1]]
      } else {
        ch = ch << 1
        latRange = [latRange[0], mid]
      }
    }
    even = !even
    if (++bit === 5) {
      hash += BASE32[ch]
      bit = 0
      ch = 0
    }
  }
  return hash
}

/** Decode a geohash to its centre and error bounds. */
export function decodeGeohash(hash: string): GeohashBounds {
  let latRange = [-90, 90]
  let lonRange = [-180, 180]
  let even = true

  for (const char of hash) {
    const idx = BASE32.indexOf(char)
    if (idx === -1) continue
    for (let bit = 4; bit >= 0; bit--) {
      const bitValue = (idx >> bit) & 1
      if (even) {
        const mid = (lonRange[0] + lonRange[1]) / 2
        lonRange = bitValue ? [mid, lonRange[1]] : [lonRange[0], mid]
      } else {
        const mid = (latRange[0] + latRange[1]) / 2
        latRange = bitValue ? [mid, latRange[1]] : [latRange[0], mid]
      }
      even = !even
    }
  }
  return {
    lat: (latRange[0] + latRange[1]) / 2,
    lon: (lonRange[0] + lonRange[1]) / 2,
    latError: (latRange[1] - latRange[0]) / 2,
    lonError: (lonRange[1] - lonRange[0]) / 2
  }
}

/** Truncate a geohash to a coarser precision (more privacy, larger cell). */
export function coarsenGeohash(hash: string, precision: number): string {
  return hash.slice(0, Math.max(0, precision))
}

/** Length of the shared leading prefix of two geohashes. */
export function sharedPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let i = 0
  while (i < len && a[i] === b[i]) i++
  return i
}

/**
 * Coarse proximity in [0, 1] from shared prefix length relative to the finer of
 * the two cells. 1 = same cell; 0 = no shared prefix.
 */
export function geohashProximity(a: string, b: string): number {
  const denom = Math.max(a.length, b.length)
  return denom === 0 ? 0 : sharedPrefixLength(a, b) / denom
}

const NEIGHBOR = {
  n: ['p0r21436x8zb9dcf5h7kjnmqesgutwvy', 'bc01fg45238967deuvhjyznpkmstqrwx'],
  s: ['14365h7k9dcfesgujnmqp0r2twvyx8zb', '238967debc01fg45kmstqrwxuvhjyznp'],
  e: ['bc01fg45238967deuvhjyznpkmstqrwx', 'p0r21436x8zb9dcf5h7kjnmqesgutwvy'],
  w: ['238967debc01fg45kmstqrwxuvhjyznp', '14365h7k9dcfesgujnmqp0r2twvyx8zb']
} as const
const BORDER = {
  n: ['prxz', 'bcfguvyz'],
  s: ['028b', '0145hjnp'],
  e: ['bcfguvyz', 'prxz'],
  w: ['0145hjnp', '028b']
} as const

function adjacent(hash: string, dir: keyof typeof NEIGHBOR): string {
  const lower = hash.toLowerCase()
  const last = lower[lower.length - 1]
  let parent = lower.slice(0, -1)
  const type = lower.length % 2 // 0 = even
  if (BORDER[dir][type].includes(last) && parent !== '') {
    parent = adjacent(parent, dir)
  }
  return parent + BASE32[NEIGHBOR[dir][type].indexOf(last)]
}

/**
 * The 8 neighbouring cells of a geohash, for k-anonymous proximity queries
 * (query the cell plus neighbours so the index can't single out the querier).
 */
export function geohashNeighbors(hash: string): string[] {
  if (hash.length === 0) return []
  const n = adjacent(hash, 'n')
  const s = adjacent(hash, 's')
  return [
    n,
    s,
    adjacent(hash, 'e'),
    adjacent(hash, 'w'),
    adjacent(n, 'e'),
    adjacent(n, 'w'),
    adjacent(s, 'e'),
    adjacent(s, 'w')
  ]
}

/** A k-anonymous query set: the cell plus its neighbours (9 cells total). */
export function kAnonymityCells(hash: string): string[] {
  return [hash, ...geohashNeighbors(hash)]
}
