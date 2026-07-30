/**
 * The umbrella xNet Protocol Version.
 *
 * Five subsystems version independently (the change record, the Yjs sync
 * envelope, awareness, schemas, the crypto level). To avoid a five-way
 * negotiation, peers advertise a single named bundle — exactly as Matrix
 * bundles breaking changes into "room versions". A breaking change to any
 * normative layer mints a new umbrella version; the handshake advertises a
 * set, so old and new peers can coexist.
 *
 * This is the machine-readable counterpart of the normative specification in
 * `docs/specs/protocol/`. See `00-overview.md` §5.
 */

import { CURRENT_PROTOCOL_VERSION } from '@xnetjs/sync'

/** Schema profile version (xnet://authority/Name@version default). */
export const XNET_SCHEMA_VERSION = '1.0.0'

/** Signed Yjs envelope wire version (SignedYjsEnvelopeV2). */
export const XNET_SYNC_ENVELOPE_VERSION = 2

/** y-protocols awareness profile version. */
export const XNET_AWARENESS_VERSION = 1

/** The L1 data-model version (Node shape + canonicalization contract). */
export const XNET_DATA_MODEL_VERSION = 1

/** UCAN capability-token profile pinned by this umbrella version. */
export const XNET_UCAN_PROFILE = '1.0'

/**
 * The per-subsystem versions bundled by one umbrella version. Implementations
 * negotiate the umbrella `id`; this record documents what it expands to.
 */
export interface XNetProtocolBundle {
  /** Umbrella identifier advertised in the handshake, e.g. `"xnet/1.0"`. */
  id: string
  /** L1 data-model version. */
  dataModel: number
  /** Change-record protocol version (`CURRENT_PROTOCOL_VERSION`). */
  change: number
  /** Signed Yjs envelope wire version. */
  syncEnvelope: number
  /** Awareness profile version. */
  awareness: number
  /** Default schema profile version. */
  schema: string
  /**
   * Default crypto signature level: 0 = Ed25519/X25519, 1 = hybrid (+ML-DSA),
   * 2 = post-quantum. Level 0 is the only one required for baseline conformance.
   */
  cryptoLevel: number
  /** UCAN capability-token profile. */
  ucan: string
}

/**
 * The current umbrella version this implementation speaks. The canonical
 * version token is {@link XNET_PROTOCOL_VERSION.id} (`"xnet/1.0"`).
 */
export const XNET_PROTOCOL_VERSION: XNetProtocolBundle = {
  id: 'xnet/1.0',
  dataModel: XNET_DATA_MODEL_VERSION,
  change: CURRENT_PROTOCOL_VERSION,
  syncEnvelope: XNET_SYNC_ENVELOPE_VERSION,
  awareness: XNET_AWARENESS_VERSION,
  schema: XNET_SCHEMA_VERSION,
  cryptoLevel: 0,
  ucan: XNET_UCAN_PROFILE
}

/**
 * Every umbrella version this implementation can interoperate with, newest
 * first. Older entries are added here (not removed) as the protocol evolves,
 * so the handshake can advertise the full supported set.
 */
export const XNET_SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [XNET_PROTOCOL_VERSION.id]

/**
 * Two peers are compatible when their advertised umbrella-version sets
 * intersect. Returns the newest shared version id, or `null` when there is no
 * overlap (the caller should then refuse with a typed version-mismatch rather
 * than partially syncing — see `docs/specs/protocol/03-replication.md` §7).
 */
export function negotiateProtocolVersion(
  ours: readonly string[],
  theirs: readonly string[]
): string | null {
  const offered = new Set(theirs)
  for (const version of ours) {
    if (offered.has(version)) {
      return version
    }
  }
  return null
}

/**
 * Convenience: whether this implementation can interoperate with a peer that
 * advertises `theirs`.
 */
export function isProtocolCompatible(theirs: readonly string[]): boolean {
  return negotiateProtocolVersion(XNET_SUPPORTED_PROTOCOL_VERSIONS, theirs) !== null
}
