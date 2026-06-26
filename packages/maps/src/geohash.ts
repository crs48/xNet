/**
 * Geohash encoding + bbox cell-cover (pure, dependency-free) — exploration 0230.
 *
 * A geohash is a base-32 string where each character refines a lat/lon cell.
 * Because a prefix is a containment relation ("everything in this cell" =
 * "every hash starting with this prefix"), a geohash column is a spatial index
 * over a plain B-tree — no SpatiaLite, no R*Tree, works on the `sql.js` web
 * build today via `node_property_scalars`. These helpers derive the cell for a
 * point (write side) and the minimal set of covering cells for a viewport
 * bounding box (read side).
 */

/** Geohash base-32 alphabet (note: no a, i, l, o). */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

/** Longitude/latitude bounds as `[west, south, east, north]`. */
export type GeoBox = [west: number, south: number, east: number, north: number]

/** Clamp a latitude to the valid Web-Mercator-ish range. */
function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat))
}

/** Wrap a longitude into [-180, 180). */
function wrapLon(lon: number): number {
  let l = lon
  while (l < -180) l += 360
  while (l >= 180) l -= 360
  return l
}

/**
 * Encode a `(lat, lon)` point as a geohash of `precision` characters
 * (1–12; default 8 ≈ ±19 m). Higher precision = smaller cell.
 */
export function geohashEncode(lat: number, lon: number, precision = 8): string {
  const p = Math.max(1, Math.min(12, Math.floor(precision)))
  let latMin = -90
  let latMax = 90
  let lonMin = -180
  let lonMax = 180
  const y = clampLat(lat)
  const x = wrapLon(lon)

  let hash = ''
  let even = true // even bit → longitude
  let bit = 0
  let ch = 0

  while (hash.length < p) {
    if (even) {
      const mid = (lonMin + lonMax) / 2
      if (x >= mid) {
        ch = (ch << 1) | 1
        lonMin = mid
      } else {
        ch = ch << 1
        lonMax = mid
      }
    } else {
      const mid = (latMin + latMax) / 2
      if (y >= mid) {
        ch = (ch << 1) | 1
        latMin = mid
      } else {
        ch = ch << 1
        latMax = mid
      }
    }
    even = !even
    if (bit < 4) {
      bit += 1
    } else {
      hash += BASE32[ch]
      bit = 0
      ch = 0
    }
  }
  return hash
}

/** Decode a geohash into its `[west, south, east, north]` cell bounds. */
export function geohashBounds(hash: string): GeoBox {
  let latMin = -90
  let latMax = 90
  let lonMin = -180
  let lonMax = 180
  let even = true

  for (const char of hash.toLowerCase()) {
    const idx = BASE32.indexOf(char)
    if (idx === -1) throw new Error(`Invalid geohash char: ${char}`)
    for (let mask = 16; mask >= 1; mask >>= 1) {
      const on = (idx & mask) !== 0
      if (even) {
        const mid = (lonMin + lonMax) / 2
        if (on) lonMin = mid
        else lonMax = mid
      } else {
        const mid = (latMin + latMax) / 2
        if (on) latMin = mid
        else latMax = mid
      }
      even = !even
    }
  }
  return [lonMin, latMin, lonMax, latMax]
}

/** Cell width (°lon) × height (°lat) for a geohash precision. */
function cellSize(precision: number): { w: number; h: number } {
  // Each char carries 5 bits: ceil(5p/2) lon-bits, floor(5p/2) lat-bits.
  const bits = 5 * precision
  const lonBits = Math.ceil(bits / 2)
  const latBits = Math.floor(bits / 2)
  return { w: 360 / 2 ** lonBits, h: 180 / 2 ** latBits }
}

/**
 * Pick the coarsest precision whose cell is no larger than the bbox, so a
 * viewport is covered by a small, bounded number of cells.
 */
function precisionForBox(box: GeoBox, maxCells: number): number {
  const [w, s, e, n] = box
  const spanW = Math.max(1e-9, Math.abs(e - w))
  const spanH = Math.max(1e-9, Math.abs(n - s))
  for (let p = 1; p <= 12; p += 1) {
    const { w: cw, h: ch } = cellSize(p)
    const cols = Math.ceil(spanW / cw) + 1
    const rows = Math.ceil(spanH / ch) + 1
    if (cols * rows > maxCells) return Math.max(1, p - 1)
  }
  return 12
}

/**
 * Compute the minimal set of geohash cells (prefixes) covering a bounding box.
 *
 * The returned prefixes are suitable for an indexed `geohash LIKE 'prefix%'`
 * (or range) scan: a row is in the box's neighborhood iff its geohash starts
 * with one of these. `maxCells` bounds the result (coarsening precision when a
 * box would need too many cells), so a whole-world view returns a handful of
 * short prefixes rather than thousands.
 */
export function geohashCellsForBounds(box: GeoBox, maxCells = 64): string[] {
  const [w, s, e, n] = box
  const west = wrapLon(w)
  const east = wrapLon(e)
  const south = clampLat(s)
  const north = clampLat(n)
  const precision = precisionForBox(box, maxCells)
  const { w: cw, h: ch } = cellSize(precision)

  const cells = new Set<string>()
  // Step across the box at one cell per step; sample the cell centre to avoid
  // boundary rounding. The antimeridian-wrapped case (west > east) is split.
  const sweep = (x0: number, x1: number): void => {
    for (let y = south; y <= north + ch; y += ch) {
      for (let x = x0; x <= x1 + cw; x += cw) {
        cells.add(geohashEncode(Math.min(y, north), Math.min(x, x1), precision))
        if (cells.size > maxCells * 4) return // hard backstop
      }
    }
  }
  if (west <= east) {
    sweep(west, east)
  } else {
    sweep(west, 180)
    sweep(-180, east)
  }
  return [...cells].sort()
}
