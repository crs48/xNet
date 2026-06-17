/**
 * @xnetjs/plugins — install provenance → trust tier (explorations 0192, 0194).
 *
 * This used to carry a byte-for-byte copy of `@xnetjs/labs`'s trust logic
 * (mirrored in 0192 to avoid a `plugins → labs` dependency edge). 0194 extracted
 * the shared logic into the zero-dep `@xnetjs/trust` leaf, which both packages
 * now consume — so this module is a thin re-export that preserves the plugins
 * public API (`InstallProvenance`, `PluginTrustTier`, `SandboxKind`, and the
 * three functions).
 */

export { deriveTrustTier, requiresCapabilityReprompt, sandboxForTier } from '@xnetjs/trust'
export type { InstallProvenance, SandboxKind } from '@xnetjs/trust'

/** The execution trust tier a plugin runs at (alias of the shared `TrustTier`). */
export type { TrustTier as PluginTrustTier } from '@xnetjs/trust'
