/**
 * @xnetjs/plugins — FeatureModule (exploration 0189).
 *
 * A `FeatureModule` is the uniform shape every first-party integration and
 * community plugin can take: a superset of `XNetExtension` (the client
 * contributions) that also **declares its capability surface** and, by
 * convention via a shared `id`, links to a hub-side feature mounted through
 * `@xnetjs/hub`'s feature registry.
 *
 * The client stays hub-free on purpose: `hub` here is a *declarative pointer*
 * (an id), not server code. The actual hub routes/secrets live in the hub
 * package's `HubFeature`, and the hub's capability/secret broker is what
 * enforces `capabilities.secrets`. This keeps the dependency direction clean
 * (no `@xnetjs/plugins` → `@xnetjs/hub` edge) while letting one manifest
 * document the full two-sided surface — billing, GitHub, importers, and
 * eventually core surfaces all expressed the same way.
 */

import type { XNetExtension } from './manifest'

/**
 * The capability surface a module declares. The install UI renders this as a
 * consent dialog; the hub broker injects only the declared `secrets`; the
 * client sandbox exposes only the declared `endowments`.
 */
export interface ModuleCapabilities {
  /**
   * Env secret keys the module's hub half is permitted to read. Supports exact
   * keys (`STRIPE_SECRET_KEY`) and `PREFIX_*` globs (`BTCPAY_*`). First-party
   * tier only — community modules never receive raw secrets.
   */
  secrets?: string[]
  /** Schema IRIs the module may write. */
  schemaWrite?: string[]
  /** Schema IRIs the module may read. */
  schemaRead?: string[]
  /** Network domains the module may reach (allowlist), e.g. for unfurl/proxy. */
  network?: string[]
  /** Host APIs the client sandbox should expose to the module's code. */
  endowments?: string[]
  /**
   * Whether the module may capture the machine's system audio (meeting
   * transcription, exploration 0279). Renders as a prominent consent line and
   * gates the desktop loopback-capture IPC — a module without this grant never
   * reaches the capture service. Microphone access is NOT covered here: the
   * mic goes through the platform's own `getUserMedia` permission prompt.
   */
  systemAudio?: boolean
}

/**
 * A two-sided feature module. Inherits all client `contributes` (including the
 * new `importers` point) from `XNetExtension`, and adds the capability
 * declaration + the hub linkage.
 */
export interface FeatureModule extends XNetExtension {
  /** Declared capability surface (client + hub). The hub broker enforces `secrets`. */
  capabilities?: ModuleCapabilities
  /**
   * Declarative pointer to a hub-side feature. By convention the hub feature is
   * registered under the same `id` and mounted at `/x/<featureId>` (or, for the
   * bundled first-party features, at their legacy path). Absence means the
   * module is client-only.
   */
  hub?: { featureId: string }
}

/** Define a feature module with type checking (mirrors `defineExtension`). */
export function defineFeatureModule(module: FeatureModule): FeatureModule {
  return module
}
