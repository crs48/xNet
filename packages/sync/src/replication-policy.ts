/**
 * Signed-replication policy helpers.
 */

export interface SyncCompatibilityConfig {
  /**
   * Temporary compatibility mode for legacy peers that still send unsigned
   * Yjs replication payloads.
   */
  allowUnsignedReplication?: boolean
}

export interface SyncReplicationConfig {
  /**
   * Compatibility toggles for older replication paths.
   */
  compatibility?: SyncCompatibilityConfig
}

export interface ResolvedSyncReplicationPolicy {
  /**
   * Whether unsigned replication payloads are accepted.
   */
  allowUnsignedReplication: boolean
  /**
   * Whether replication payloads must be signed.
   */
  requireSignedReplication: boolean
}

export function resolveSyncReplicationPolicy(
  config: SyncReplicationConfig | undefined
): ResolvedSyncReplicationPolicy {
  const allowUnsignedReplication = config?.compatibility?.allowUnsignedReplication === true

  return {
    allowUnsignedReplication,
    requireSignedReplication: !allowUnsignedReplication
  }
}
