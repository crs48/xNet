export const CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

/** Keep one point per interval/day/week, plus the latest two and explicitly pinned points. */
export function retainedCheckpointIds(
  points: readonly { id: string; createdAt: string; pinned?: boolean }[],
  now: number
): Set<string> {
  const sorted = [...points].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const retained = new Set(sorted.slice(0, 2).map((point) => point.id))
  const buckets = new Set<string>()
  for (const point of sorted) {
    const time = Date.parse(point.createdAt)
    if (!Number.isFinite(time)) throw new Error('Invalid checkpoint date')
    const age = now - time
    if (point.pinned || age < 0) retained.add(point.id)
    const bucket =
      age <= DAY
        ? `recent:${Math.floor(time / CHECKPOINT_INTERVAL_MS)}`
        : age <= 7 * DAY
          ? `daily:${Math.floor(time / DAY)}`
          : age <= 28 * DAY
            ? `weekly:${Math.floor(time / (7 * DAY))}`
            : null
    if (bucket && !buckets.has(bucket)) {
      buckets.add(bucket)
      retained.add(point.id)
    }
  }
  return retained
}

/** Level-triggered: every tick rechecks durable evidence, so missed timers need no replay. */
export function createCheckpointSchedule(options: {
  now: () => number
  busy: () => boolean
  latest: () => Promise<{ createdAt: string; sourceFingerprint?: string } | null>
  fingerprint: () => Promise<string>
  create: () => Promise<unknown>
  failed: (error: unknown) => void
}) {
  let checking = false
  return async (): Promise<void> => {
    if (checking || options.busy()) return
    checking = true
    try {
      const latest = await options.latest()
      const age = latest ? options.now() - Date.parse(latest.createdAt) : Infinity
      // A clock correction should not suppress protection indefinitely.
      if (age >= 0 && age < CHECKPOINT_INTERVAL_MS) return
      const fingerprint = await options.fingerprint()
      if (latest?.sourceFingerprint === fingerprint) return
      if (!options.busy()) await options.create()
    } catch (error) {
      options.failed(error)
    } finally {
      checking = false
    }
  }
}
