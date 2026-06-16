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

/** Mount every feature (routes + declarative webhooks), each scoped to its secrets. */
export function mountFeatures(features: readonly HubFeature[], deps: MountFeaturesDeps): void {
  for (const feature of features) {
    const env = scopedEnv(deps.env, feature.secrets ?? [])
    feature.mount?.({ ...deps, env })
    for (const webhook of feature.webhooks ?? []) {
      mountWebhook(deps.app, webhook, env)
    }
  }
}
