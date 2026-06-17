/**
 * Transcript-history retention.
 *
 * Dictations are stored as nodes, but a chatty user could pile up thousands.
 * `applyRetention` is the pure policy that decides which transcripts to keep and
 * which to prune, so the app can show "keep last N / auto-prune after X days"
 * without scattering the rules across UI code.
 *
 * Rules, in order:
 *   1. Starred items are always kept (when `keepStarred`) and never count
 *      toward `maxItems`.
 *   2. Of the rest, anything older than `maxAgeMs` is pruned.
 *   3. Of what survives age-pruning, the newest `maxItems` are kept; the
 *      overflow is pruned.
 */

export interface RetentionPolicy {
  /** Keep at most this many (newest-first). `undefined`/`0` = unlimited. */
  maxItems?: number
  /** Prune items older than this many ms, relative to `now`. `undefined`/`0` = no age limit. */
  maxAgeMs?: number
  /** Never prune starred items, and don't count them toward `maxItems`. */
  keepStarred?: boolean
}

export interface Retainable {
  id: string
  /** Epoch ms the transcript was created. */
  createdAt: number
  starred?: boolean
}

export interface RetentionResult<T extends Retainable> {
  keep: T[]
  prune: T[]
}

function isUnlimited(value: number | undefined): boolean {
  return value == null || value <= 0
}

export function applyRetention<T extends Retainable>(
  items: readonly T[],
  policy: RetentionPolicy,
  now: number
): RetentionResult<T> {
  // Newest first. Array.prototype.sort is stable, so equal timestamps keep order.
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt)

  const keep: T[] = []
  const prune: T[] = []
  let kept = 0

  for (const item of sorted) {
    if (policy.keepStarred && item.starred) {
      keep.push(item)
      continue
    }

    const tooOld =
      !isUnlimited(policy.maxAgeMs) && now - item.createdAt > (policy.maxAgeMs as number)
    const overflow = !isUnlimited(policy.maxItems) && kept >= (policy.maxItems as number)

    if (tooOld || overflow) {
      prune.push(item)
      continue
    }

    keep.push(item)
    kept++
  }

  return { keep, prune }
}

/** Just the ids that should be deleted under a policy — convenient for a store sweep. */
export function transcriptsToPrune<T extends Retainable>(
  items: readonly T[],
  policy: RetentionPolicy,
  now: number
): string[] {
  return applyRetention(items, policy, now).prune.map((item) => item.id)
}
