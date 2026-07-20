/**
 * @xnetjs/hub - Named role presets (explorations 0382/0383, W1).
 *
 * "Everything is a hub": one binary, and a role is nothing but a named
 * `Partial<HubConfig>` spread into `resolveConfig`'s merge chain between
 * `DEFAULT_CONFIG` and explicit options — so precedence is always
 * preset < explicit config < CLI flags/env, and a role can never override a
 * choice the operator made by hand.
 *
 * Rules (0383):
 * - A role is a preset here, NEVER a runtime branch. Any behaviour that would
 *   need `if (role === …)` in server code must instead become config that a
 *   preset sets and a resolver reads (the #603 `resolvePerUserQuota` pattern).
 * - The named presets are the only supported combinations; unlisted config
 *   mixes remain possible programmatically but are unclaimed.
 * - `index` state discipline and the `gateway` role land with 0383 W3/W4.
 */

import type { HubConfig, HubRole } from './types'

export const HUB_ROLES: Record<HubRole, Partial<HubConfig>> = {
  /** The default: a person's (or small team's) hub. Nothing extra on. */
  personal: {},

  /**
   * The public demo hub: restricted per-user quotas, disk watchdog, periodic
   * reset — a disposable-volume preset, formerly the `--demo` flag.
   */
  demo: { demo: true },

  /**
   * A community hub (0359/0382): participates in federated search so its
   * public face is discoverable across the fleet. The public-interaction
   * surface joins this preset in 0383 W2.
   */
  community: {
    federation: { enabled: true },
    publicInteractions: { enabled: true }
  },

  /**
   * The Index (0374/0382): reads PUBLIC atproto records and serves derived
   * state only. The legacy hub search stack stays OFF here — 0367 documented
   * its defects, and the index plane must never depend on it. The
   * `atprotoIndex` engine module arrives in 0383 W3.
   */
  index: {
    federation: { enabled: false },
    shards: { enabled: false },
    crawl: { enabled: false },
    publicInteractions: { enabled: true },
    atprotoIndex: { enabled: true }
  },

  /**
   * The search-infrastructure coordinator: owns the shard ring
   * (`isRegistry` — 0305's epoch nonce lives here) and coordinates the web
   * crawl queue that feeds shard ingest.
   */
  registry: {
    shards: { enabled: true, isRegistry: true },
    crawl: { enabled: true }
  }
}

export const isHubRole = (value: string): value is HubRole => value in HUB_ROLES

/** The preset for a role; `personal` (empty) for undefined. */
export const rolePreset = (role: HubRole | undefined): Partial<HubConfig> =>
  role ? HUB_ROLES[role] : HUB_ROLES.personal
