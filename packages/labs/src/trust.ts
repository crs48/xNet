/**
 * Trust derivation (explorations 0180, 0194).
 *
 * The load-bearing invariant of the whole extensibility story: a Lab/extension's
 * trust tier follows its PROVENANCE — where it came from — never anything the
 * code declares about itself. When a Lab/extension node SYNCS to another device,
 * the receiver must RE-DERIVE the tier from its own local install action — never
 * trust a tier carried in the synced payload. {@link deriveTrustTier} is that
 * single choke point.
 *
 * 0194 extracted this logic into the zero-dep `@xnetjs/trust` leaf (it was
 * byte-for-byte duplicated in `@xnetjs/plugins`); this module re-exports it under
 * the labs-local `LabInstallSource` name to preserve the labs public API.
 */

export { deriveTrustTier, requiresCapabilityReprompt } from '@xnetjs/trust'

/** Where a Lab/extension came from — the only input to its trust tier. */
export type { InstallProvenance as LabInstallSource } from '@xnetjs/trust'
