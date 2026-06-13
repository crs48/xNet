/**
 * Perceptual image hashing + known-bad-hash matching (exploration 0175, phase 3).
 *
 * Operates on a decoded grayscale image (`luma` 0–255, row-major). Decoding is
 * the caller's job — a browser uses a `<canvas>`, a hub uses sharp/jimp — so this
 * module stays pure, portable, and unit-testable.
 *
 * Two distinct jobs, both needed (the research is explicit that ML classification
 * and hash matching are complementary):
 *  - `perceptualHash` / `averageHash` / `differenceHash` — robust similarity
 *    hashes for "is this the same image as one we've seen", used for dedupe and
 *    as the comparison primitive behind known-bad matching.
 *  - `matchKnownImageHash` — the CSAM-style matcher: compare a candidate hash to
 *    a list of known-bad hashes (e.g. a PDQ/PhotoDNA-derived list). The matching
 *    LOGIC lives here; sourcing the actual list is an operator/legal step.
 */

export type GrayscaleImage = {
  width: number
  height: number
  /** Row-major luma values in [0, 255], length === width * height. */
  luma: readonly number[]
}

// ─── Resampling ──────────────────────────────────────────────────────────────

/** Box-average downscale to `size`×`size` grayscale. */
function resample(image: GrayscaleImage, size: number): number[] {
  const out = new Array<number>(size * size).fill(0)
  if (image.width === 0 || image.height === 0) return out
  for (let oy = 0; oy < size; oy++) {
    const y0 = Math.floor((oy * image.height) / size)
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * image.height) / size))
    for (let ox = 0; ox < size; ox++) {
      const x0 = Math.floor((ox * image.width) / size)
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * image.width) / size))
      let sum = 0
      let count = 0
      for (let y = y0; y < y1 && y < image.height; y++) {
        for (let x = x0; x < x1 && x < image.width; x++) {
          sum += image.luma[y * image.width + x] ?? 0
          count++
        }
      }
      out[oy * size + ox] = count > 0 ? sum / count : 0
    }
  }
  return out
}

// ─── Bit packing ─────────────────────────────────────────────────────────────

function bitsToHex(bits: readonly boolean[]): string {
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    let nibble = 0
    for (let b = 0; b < 4; b++) {
      if (bits[i + b]) nibble |= 1 << (3 - b)
    }
    hex += nibble.toString(16)
  }
  return hex
}

// ─── Hashes ──────────────────────────────────────────────────────────────────

/** Average hash (aHash): 8×8 luma compared to the mean → 64-bit hex. */
export function averageHash(image: GrayscaleImage): string {
  const px = resample(image, 8)
  const mean = px.reduce((sum, value) => sum + value, 0) / px.length
  return bitsToHex(px.map((value) => value >= mean))
}

/** Difference hash (dHash): 9×8, each pixel brighter than its right neighbour → 64-bit hex. */
export function differenceHash(image: GrayscaleImage): string {
  const w = 9
  const h = 8
  const px = resample(image, Math.max(w, h)) // resample square then sample 9×8 grid
  const grid = resampleGrid(image, w, h)
  void px
  const bits: boolean[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits.push(grid[y * w + x] > grid[y * w + x + 1])
    }
  }
  return bitsToHex(bits)
}

function resampleGrid(image: GrayscaleImage, w: number, h: number): number[] {
  const out = new Array<number>(w * h).fill(0)
  if (image.width === 0 || image.height === 0) return out
  for (let oy = 0; oy < h; oy++) {
    const y = Math.min(image.height - 1, Math.floor((oy * image.height) / h))
    for (let ox = 0; ox < w; ox++) {
      const x = Math.min(image.width - 1, Math.floor((ox * image.width) / w))
      out[oy * w + ox] = image.luma[y * image.width + x] ?? 0
    }
  }
  return out
}

/**
 * DCT-based perceptual hash (pHash family): downscale to 32×32, take the 2D
 * DCT-II, keep the low-frequency top-left 8×8 block (excluding the DC term), and
 * threshold each coefficient against the block median → 64-bit hex. More robust
 * to scaling/compression than aHash/dHash.
 */
export function perceptualHash(image: GrayscaleImage): string {
  const N = 32
  const px = resample(image, N)
  const dct = dct2d(px, N)

  const coeffs: number[] = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (x === 0 && y === 0) continue // drop DC
      coeffs.push(dct[y * N + x])
    }
  }
  const median = medianOf(coeffs)
  return bitsToHex(coeffs.map((value) => value > median))
}

function dct2d(input: readonly number[], n: number): number[] {
  // Separable DCT-II: rows then columns.
  const cos: number[][] = []
  for (let u = 0; u < n; u++) {
    cos[u] = []
    for (let x = 0; x < n; x++) {
      cos[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n))
    }
  }
  const temp = new Array<number>(n * n).fill(0)
  for (let y = 0; y < n; y++) {
    for (let u = 0; u < n; u++) {
      let sum = 0
      for (let x = 0; x < n; x++) sum += input[y * n + x] * cos[u][x]
      temp[y * n + u] = sum
    }
  }
  const out = new Array<number>(n * n).fill(0)
  for (let u = 0; u < n; u++) {
    for (let v = 0; v < n; v++) {
      let sum = 0
      for (let y = 0; y < n; y++) sum += temp[y * n + v] * cos[u][y]
      out[u * n + v] = sum
    }
  }
  return out
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// ─── Comparison + known-hash matching ────────────────────────────────────────

const HEX_BITS: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  for (let i = 0; i < 16; i++) {
    map[i.toString(16)] = (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1)
  }
  return map
})()

/** Hamming distance (number of differing bits) between two equal-length hex hashes. */
export function hammingDistanceHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let distance = Math.abs(a.length - b.length) * 4
  for (let i = 0; i < len; i++) {
    distance += HEX_BITS[(parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(16)] ?? 0
  }
  return distance
}

/** Similarity in [0, 1] from Hamming distance over the hash bit length. */
export function imageHashSimilarity(a: string, b: string): number {
  const bits = Math.max(a.length, b.length) * 4
  if (bits === 0) return 1
  return 1 - hammingDistanceHex(a, b) / bits
}

export type KnownImageHash = { hash: string; label: string; source?: string }

export type KnownHashMatch = { label: string; source?: string; distance: number }

/**
 * Match a candidate hash against a list of known-bad hashes. A match within
 * `maxHammingBits` is the CSAM-style "known content" signal — zero ML, near-zero
 * false positives for the exact known item. Returns the closest match or null.
 */
export function matchKnownImageHash(
  hash: string,
  known: readonly KnownImageHash[],
  maxHammingBits = 8
): KnownHashMatch | null {
  let best: KnownHashMatch | null = null
  for (const entry of known) {
    const distance = hammingDistanceHex(hash, entry.hash)
    if (distance <= maxHammingBits && (best === null || distance < best.distance)) {
      best = { label: entry.label, source: entry.source, distance }
    }
  }
  return best
}
