/**
 * @xnetjs/hub - Hub feature registry (exploration 0189).
 *
 * Replaces the hand-written `app.route(...)` block in `server.ts` with iteration
 * over a list of first-party `HubFeature`s. Each feature is mounted with a
 * **broker-scoped env** so it only sees the secrets it declared — the
 * capability model, enforced at mount time.
 */

import type { Env } from './broker'
import type { HubFeature, HubFeatureDeps } from './types'
import { scopedEnv } from './broker'
import { mountWebhook } from './webhooks'

/** Shared deps, but with the FULL env — the registry scopes it per feature. */
export type MountFeaturesDeps = Omit<HubFeatureDeps, 'env'> & { env: Env }

/** What `mountFeatures` hands back for lifecycle + ws integration (0383 W2). */
export interface MountedFeatures {
  /** Start every feature loop, in feature order. Await before serving. */
  start(): Promise<void>
  /** Stop every loop in reverse order; errors are logged-and-continued. */
  stop(): Promise<void>
  /** Collected ws handler maps, keyed by feature id (consumer lands in W4). */
  wsHandlers: Map<string, Record<string, (socket: unknown, message: unknown) => void>>
}

/**
 * Mount every feature — storage setup, routes, declarative webhooks — each
 * scoped to its declared secrets, and hand lifecycle ownership back to the
 * caller as one start/stop pair. The REGISTRY owns loops: a feature declares
 * them and never manages its own lifecycle (0383 W2).
 */
export async function mountFeatures(
  features: readonly HubFeature[],
  deps: MountFeaturesDeps
): Promise<MountedFeatures> {
  const wsHandlers = new Map<string, Record<string, (socket: unknown, message: unknown) => void>>()

  for (const feature of features) {
    const env = scopedEnv(deps.env, feature.secrets ?? [])
    const scoped: HubFeatureDeps = { ...deps, env }

    // Storage first, so mount/services see the feature's tables. Table
    // ownership is enforced HERE: names must carry the declared prefix
    // (fed_/crawl_/idx_/sub_/pi_ — 0383 W2's discipline; the W3 derived-state
    // guard depends on it).
    if (feature.storage) {
      const { prefix, setup } = feature.storage
      await setup({
        ...scoped,
        assertOwnTable: (table: string): string => {
          if (!table.startsWith(prefix)) {
            throw new Error(
              `[features] ${feature.id} may only create "${prefix}*" tables, got "${table}"`
            )
          }
          return table
        }
      })
    }

    feature.services?.(scoped)
    feature.mount?.(scoped)
    const ws = feature.ws?.(scoped)
    if (ws) wsHandlers.set(feature.id, ws)
    for (const webhook of feature.webhooks ?? []) {
      mountWebhook(deps.app, webhook, env)
    }
  }

  const loops = features.flatMap((f) => (f.loops ?? []).map((loop) => ({ feature: f.id, loop })))

  return {
    async start() {
      for (const { loop } of loops) {
        await loop.start()
      }
    },
    async stop() {
      for (const { feature, loop } of [...loops].reverse()) {
        try {
          await loop.stop()
        } catch (err) {
          // Shutdown must not wedge on one feature; log and continue.
          console.error(`[features] ${feature}/${loop.id} stop failed:`, err)
        }
      }
    },
    wsHandlers
  }
}
