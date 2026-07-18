/**
 * Sync granularity guardrail (exploration 0200).
 *
 * The central rule of the xNet ↔ Unreal bridge: **if it belongs in a save file it
 * can sync to xNet; if it belongs in a netcode packet it must not.** xNet's store
 * is a signed, content-addressed, LWW CRDT graph — wonderful for the dozens of
 * durable, player-facing facts per session (identity, inventory, achievements,
 * economy) and catastrophic for the thousands of per-frame ones (transforms,
 * physics). Exploration 0200 makes that boundary a rule, not a hope — and this
 * module enforces it on both axes a connector can violate:
 *
 *   1. **cadence** — reject any automatic re-sync faster than {@link MIN_SYNC_INTERVAL_MS};
 *   2. **schema** — reject any sync target outside the durable game-interop pack.
 *
 * The cadence type mirrors `@xnetjs/plugins`' `ConnectorCadence` structurally, so a
 * value validated here is assignable to a real connector definition without a
 * runtime dependency on the plugin runtime.
 */

/** Re-sync cadence — structurally identical to `@xnetjs/plugins` `ConnectorCadence`. */
export type SyncCadence = 'manual' | 'hourly' | 'daily' | { everyMs: number }

/**
 * The hard floor for an automatic sync interval. Anything faster is netcode-packet
 * territory (a 60fps frame is ~16ms; even a 10Hz tick is 100ms) and must never
 * drive CRDT writes. One second is comfortably slower than any per-tick loop while
 * still allowing a responsive durable sync.
 */
export const MIN_SYNC_INTERVAL_MS = 1_000

const HOUR_MS = 60 * 60 * 1_000
const DAY_MS = 24 * HOUR_MS

export class GranularityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GranularityError'
  }
}

/**
 * The automatic interval a cadence implies, in ms, or `null` for `manual`
 * (no automatic loop — always durable: it only fires on explicit/agent trigger).
 */
export function cadenceIntervalMs(cadence: SyncCadence): number | null {
  if (cadence === 'manual') return null
  if (cadence === 'hourly') return HOUR_MS
  if (cadence === 'daily') return DAY_MS
  return cadence.everyMs
}

/** True when a cadence would re-sync faster than {@link MIN_SYNC_INTERVAL_MS}. */
export function isHighFrequencyCadence(cadence: SyncCadence): boolean {
  const interval = cadenceIntervalMs(cadence)
  return interval !== null && interval < MIN_SYNC_INTERVAL_MS
}

/**
 * Throw unless the cadence is slow enough to be durable. Called at connector
 * build time so a per-frame sync fails loudly instead of melting the hub.
 *
 * @throws {GranularityError}
 */
export function assertDurableCadence(cadence: SyncCadence): void {
  if (isHighFrequencyCadence(cadence)) {
    const interval = cadenceIntervalMs(cadence)
    throw new GranularityError(
      `sync cadence ${interval}ms is below the ${MIN_SYNC_INTERVAL_MS}ms durable floor — ` +
        `xNet syncs save-file-grade data, not netcode-packet state (exploration 0200)`
    )
  }
}

/**
 * Throw unless every schema is in the durable game-interop allowlist. Guards
 * against a connector pointing its sync at a high-churn/transform schema that
 * does not belong in the graph.
 *
 * @throws {GranularityError}
 */
export function assertDurableSchemas(schemas: readonly string[], durable: readonly string[]): void {
  const allow = new Set(durable)
  const offenders = schemas.filter((iri) => !allow.has(iri))
  if (offenders.length > 0) {
    throw new GranularityError(
      `schema(s) outside the durable game-interop pack cannot be synced: ${offenders.join(', ')}`
    )
  }
}
