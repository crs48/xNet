/**
 * Seeded PRNG helpers for the reliability lane (exploration 0272).
 *
 * Every random decision in these suites flows through a `SimRng` created from
 * an integer seed, so any failure reproduces exactly by re-running with the
 * seed printed in the failure message. mulberry32 matches the generator the
 * repo already uses for seeded shuffles (packages/data convergence tests).
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class SimRng {
  private next: () => number

  constructor(readonly seed: number) {
    this.next = mulberry32(seed)
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.next()
  }

  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('SimRng.pick on empty array')
    return items[this.int(items.length)]
  }

  /**
   * Pick a key from a weight table. Weights need not sum to anything —
   * they are relative.
   */
  weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as Array<[K, number]>
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    let roll = this.next() * total
    for (const [key, weight] of entries) {
      roll -= weight
      if (roll < 0) return key
    }
    return entries[entries.length - 1][0]
  }

  /** Deterministic 32-byte key material (e.g. an Ed25519 private key). */
  bytes32(): Uint8Array {
    const out = new Uint8Array(32)
    for (let i = 0; i < 32; i += 1) out[i] = this.int(256)
    return out
  }

  /** Fisher–Yates shuffle (copy). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
}

/**
 * Parse a positive-integer env knob with a default. The reliability lane's
 * depth knobs (XNET_SIM_*, XNET_CRASH_*, XNET_SCALE_*) all go through this so
 * the PR tier stays fast and the soak workflow can escalate.
 */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}
