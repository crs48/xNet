/**
 * Deterministic string → unit-interval hash for head-based sampling.
 *
 * Using a hash of the traceId (rather than a coin flip) keeps the sampling
 * decision stable for a given id and avoids `Math.random()` on the hot path.
 */

/** FNV-1a 32-bit hash. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    // h *= 16777619, kept in 32-bit space.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

/** Map a string deterministically into the half-open interval [0, 1). */
export function hashToUnit(str: string): number {
  return fnv1a(str) / 0x100000000
}
