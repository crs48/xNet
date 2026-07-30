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

import type { HubStorage } from '../storage/interface'
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
  /**
   * The hub's own storage, for features that read/write hub state (rather
   * than opening a subsystem DB). Optional: not every mount site provides it.
   */
  hubStorage?: HubStorage
}

/** A background loop owned by the feature registry (0383 W2). */
export interface HubFeatureLoop {
  /** Loop id, unique within the feature, for logs and shutdown ordering. */
  id: string
  start(): void | Promise<void>
  stop(): void | Promise<void>
}

/**
 * Allowed hub.db table prefixes for feature-owned tables (0383 W2). One prefix
 * per infra plane: `fed_` federation, `crawl_` crawl, `idx_` the atproto index
 * plane (derived-only — the 0383 W3 startup guard keys on this), `sub_`
 * hub-to-hub subscription state (W4), `pi_` public interactions.
 */
export type HubTablePrefix = 'fed_' | 'crawl_' | 'idx_' | 'sub_' | 'pi_'

/** Storage hook: declarative prefix + setup, with ownership enforced. */
export interface HubFeatureStorage {
  /** The single prefix every table this feature creates must carry. */
  prefix: HubTablePrefix
  /**
   * Create tables/migrations. `assertOwnTable` throws unless the name starts
   * with the declared prefix — the discipline is enforced where DDL happens,
   * not reviewed after.
   */
  setup(deps: HubFeatureDeps & { assertOwnTable: (table: string) => string }): void | Promise<void>
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
  /**
   * Long-lived service objects (0383 W2), constructed once at mount time and
   * visible to this feature's own hooks only — cross-feature access stays
   * forbidden, in the spirit of the secret broker. Features defined inline in
   * `server.ts` may instead close over their services; this hook exists for
   * features defined as standalone modules.
   */
  services?(deps: HubFeatureDeps): Record<string, unknown>
  /**
   * Background loops. The REGISTRY owns start/stop and shutdown grace — a
   * feature never manages its own lifecycle (0383 W2).
   */
  loops?: HubFeatureLoop[]
  /** Storage setup (tables/migrations), run before `mount`. */
  storage?: HubFeatureStorage
  /**
   * WebSocket message handlers, namespaced by message type. Collected by the
   * registry (`mountFeatures` returns them); the ws pump integration lands
   * with the first real consumer (0383 W4's subscriber) — the seam exists so
   * that consumer changes no interface.
   */
  ws?(deps: HubFeatureDeps): Record<string, (socket: unknown, message: unknown) => void>
}
