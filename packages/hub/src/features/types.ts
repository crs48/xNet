/**
 * @xnetjs/hub - Hub feature contract (exploration 0189).
 *
 * The server-side half of a feature module. A `HubFeature` mounts a first-party
 * integration's routes onto the hub's Hono app, receiving a **broker-scoped
 * env** (only the secrets it declared). The hub iterates these instead of
 * hardcoding `app.route(...)` calls, so billing / GitHub-tasks / unfurl — and
 * future features — all mount through one uniform, capability-scoped path.
 *
 * Feature-specific services (task identifiers, crawl user-agent, …) are closed
 * over when the feature is defined, keeping `HubFeatureDeps` to the genuinely
 * shared bag.
 */

import type { Env } from './broker'
import type { DeclarativeWebhook } from './webhooks'
import type { Hono, MiddlewareHandler } from 'hono'

/** Shared dependencies handed to every feature's `mount`. */
export interface HubFeatureDeps {
  /** The hub's Hono app to mount routes onto. */
  app: Hono
  /** Broker-scoped env: only the keys this feature declared in `secrets`. */
  env: Env
  /** UCAN auth middleware. */
  requireAuth: MiddlewareHandler
  /** Storage backend (for features with their own subsystem DB). */
  storage: 'sqlite' | 'memory'
  /** Data directory for subsystem databases. */
  dataDir: string
  /** Web app base URL (checkout success/cancel default, etc.). */
  appUrl: string
}

export interface HubFeature {
  /** Reverse-domain feature id (matches the client FeatureModule by convention). */
  id: string
  /**
   * Env keys this feature may read. The broker scopes `deps.env` to these before
   * calling `mount`, so the feature can't read another feature's secrets.
   */
  secrets?: string[]
  /**
   * Declarative signature-verified webhooks (0189 "v2" shape) — mounted by the
   * registry without the feature hand-writing a route.
   */
  webhooks?: DeclarativeWebhook[]
  /** Mount the feature's routes onto `deps.app` (optional for webhook-only features). */
  mount?(deps: HubFeatureDeps): void
}
