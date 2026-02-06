/**
 * Version negotiation protocol for xNet peers.
 *
 * When two peers connect, they exchange capability information and
 * negotiate a common set of features they both support. This allows:
 * - Older clients to work with newer servers (backward compatibility)
 * - Newer clients to work with older servers (graceful degradation)
 * - Feature-specific behavior based on negotiated capabilities
 *
 * Usage:
 * ```typescript
 * import { VersionNegotiator, createLocalCapabilities } from '@xnet/sync'
 *
 * const negotiator = new VersionNegotiator()
 * const local = createLocalCapabilities('did:key:z...', ['node-changes', 'yjs-updates'])
 *
 * // On receiving remote capabilities:
 * const session = negotiator.negotiate(local, remoteCapabilities)
 * if (session.success) {
 *   if (session.canUse('schema-versioning')) {
 *     // Use schema versioning
 *   }
 * }
 * ```
 */

import { CURRENT_PROTOCOL_VERSION } from './change'
import {
  type FeatureFlag,
  getEnabledFeatures,
  getRequiredFeatures,
  intersectFeatures,
  diffFeatures,
  validateFeatureSet
} from './features'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Capabilities advertised by a peer during connection.
 */
export interface PeerCapabilities {
  /** Peer's DID */
  peerId: string
  /** Maximum protocol version supported */
  protocolVersion: number
  /** Minimum protocol version supported */
  minProtocolVersion: number
  /** Features enabled on this peer */
  features: FeatureFlag[]
  /** Package version string (e.g., '0.5.0') */
  packageVersion: string
  /** Schema IRIs this peer understands (optional) */
  schemas?: string[]
}

/**
 * Result of a successful negotiation.
 */
export interface NegotiatedSession {
  success: true
  /** Remote peer's ID */
  peerId: string
  /** Agreed protocol version (highest common version) */
  agreedVersion: number
  /** Features both peers support */
  commonFeatures: FeatureFlag[]
  /** Warnings about degraded functionality */
  warnings: NegotiationWarning[]

  /**
   * Check if a feature can be used in this session.
   */
  canUse(feature: FeatureFlag): boolean
}

/**
 * Result of a failed negotiation.
 */
export interface NegotiationFailure {
  success: false
  /** Error code */
  error: 'incompatible-versions' | 'missing-required-features' | 'invalid-capabilities'
  /** Human-readable message */
  message: string
  /** Local protocol version */
  localVersion: number
  /** Remote protocol version */
  remoteVersion: number
  /** Suggestion for resolving the issue */
  suggestion: 'upgrade-client' | 'upgrade-hub' | 'upgrade-both' | 'contact-support'
}

/**
 * Warning about potential issues in a negotiated session.
 */
export interface NegotiationWarning {
  type: 'degraded-features' | 'version-mismatch' | 'unknown-features'
  message: string
  /** Features affected by this warning */
  affectedFeatures?: FeatureFlag[]
}

/**
 * Result type for negotiation (success or failure).
 */
export type NegotiationResult = NegotiatedSession | NegotiationFailure

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Create local capabilities for negotiation.
 *
 * @param peerId - Local peer's DID
 * @param features - Features to advertise (defaults to all enabled at current version)
 * @param options - Additional options
 * @returns PeerCapabilities for this peer
 */
export function createLocalCapabilities(
  peerId: string,
  features?: FeatureFlag[],
  options?: {
    packageVersion?: string
    minProtocolVersion?: number
    schemas?: string[]
  }
): PeerCapabilities {
  return {
    peerId,
    protocolVersion: CURRENT_PROTOCOL_VERSION,
    minProtocolVersion: options?.minProtocolVersion ?? 1,
    features: features ?? getEnabledFeatures(CURRENT_PROTOCOL_VERSION),
    packageVersion: options?.packageVersion ?? '0.0.0',
    schemas: options?.schemas
  }
}

/**
 * Parse capabilities from a handshake message.
 * Handles missing or malformed fields gracefully.
 *
 * @param message - Raw handshake message
 * @returns Parsed capabilities or null if invalid
 */
export function parseCapabilities(message: unknown): PeerCapabilities | null {
  if (!message || typeof message !== 'object') {
    return null
  }

  const msg = message as Record<string, unknown>

  // Required fields
  if (typeof msg.peerId !== 'string' && typeof msg.did !== 'string') {
    return null
  }

  // Extract with defaults for optional fields
  const peerId = (msg.peerId ?? msg.did) as string
  const protocolVersion =
    typeof msg.protocolVersion === 'number' ? msg.protocolVersion : CURRENT_PROTOCOL_VERSION
  const minProtocolVersion = typeof msg.minProtocolVersion === 'number' ? msg.minProtocolVersion : 1
  const packageVersion = typeof msg.packageVersion === 'string' ? msg.packageVersion : '0.0.0'

  // Parse features - accept string array
  let features: FeatureFlag[] = []
  if (Array.isArray(msg.features)) {
    // Filter to only known features
    const knownFeatures = getEnabledFeatures(protocolVersion)
    features = (msg.features as string[]).filter((f): f is FeatureFlag =>
      knownFeatures.includes(f as FeatureFlag)
    )
  } else {
    // Default to features for their protocol version
    features = getEnabledFeatures(protocolVersion)
  }

  // Parse schemas if present
  const schemas = Array.isArray(msg.schemas)
    ? (msg.schemas as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined

  return {
    peerId,
    protocolVersion,
    minProtocolVersion,
    features,
    packageVersion,
    schemas
  }
}

// ─── VersionNegotiator ───────────────────────────────────────────────────────

/**
 * Handles version negotiation between peers.
 *
 * The negotiation process:
 * 1. Find highest common protocol version
 * 2. Check version ranges overlap
 * 3. Find common feature set
 * 4. Verify required features are present
 * 5. Generate warnings for degraded functionality
 */
export class VersionNegotiator {
  /**
   * Negotiate capabilities between local and remote peers.
   *
   * @param local - Local peer's capabilities
   * @param remote - Remote peer's capabilities
   * @returns Negotiated session or failure result
   */
  negotiate(local: PeerCapabilities, remote: PeerCapabilities): NegotiationResult {
    // Step 1: Find version range overlap
    const maxVersion = Math.min(local.protocolVersion, remote.protocolVersion)
    const minVersion = Math.max(local.minProtocolVersion, remote.minProtocolVersion)

    // Step 2: Check if versions are compatible
    if (maxVersion < minVersion) {
      return this.createFailure(local, remote, maxVersion, minVersion)
    }

    // Step 3: Find common features
    const commonFeatures = intersectFeatures(local.features, remote.features)

    // Step 4: Verify required features are present
    const required = getRequiredFeatures(maxVersion)
    const missingRequired = required.filter((f) => !commonFeatures.includes(f))

    if (missingRequired.length > 0) {
      return {
        success: false,
        error: 'missing-required-features',
        message: `Missing required features: ${missingRequired.join(', ')}`,
        localVersion: local.protocolVersion,
        remoteVersion: remote.protocolVersion,
        suggestion: 'contact-support'
      }
    }

    // Step 5: Generate warnings
    const warnings = this.generateWarnings(local, remote, commonFeatures, maxVersion)

    // Step 6: Create successful session
    return {
      success: true,
      peerId: remote.peerId,
      agreedVersion: maxVersion,
      commonFeatures,
      warnings,
      canUse: (feature: FeatureFlag) => commonFeatures.includes(feature)
    }
  }

  /**
   * Validate that a set of capabilities is well-formed.
   *
   * @param capabilities - Capabilities to validate
   * @returns Validation result with errors if any
   */
  validateCapabilities(capabilities: PeerCapabilities): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if (!capabilities.peerId) {
      errors.push('Missing peerId')
    }

    if (capabilities.protocolVersion < 1) {
      errors.push('Protocol version must be at least 1')
    }

    if (capabilities.minProtocolVersion > capabilities.protocolVersion) {
      errors.push('Minimum protocol version cannot exceed protocol version')
    }

    // Validate feature set
    const featureResult = validateFeatureSet(capabilities.features, capabilities.protocolVersion)
    if (!featureResult.valid) {
      for (const error of featureResult.errors) {
        errors.push(error.message)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Create a failure result with appropriate suggestion.
   */
  private createFailure(
    local: PeerCapabilities,
    remote: PeerCapabilities,
    _maxVersion: number,
    _minVersion: number
  ): NegotiationFailure {
    let suggestion: NegotiationFailure['suggestion']

    if (local.protocolVersion < remote.minProtocolVersion) {
      // Local is too old
      suggestion = 'upgrade-client'
    } else if (remote.protocolVersion < local.minProtocolVersion) {
      // Remote is too old
      suggestion = 'upgrade-hub'
    } else {
      // Both need updates (unusual case)
      suggestion = 'upgrade-both'
    }

    return {
      success: false,
      error: 'incompatible-versions',
      message:
        `Version mismatch: local v${local.protocolVersion} ` +
        `(min ${local.minProtocolVersion}), remote v${remote.protocolVersion} ` +
        `(min ${remote.minProtocolVersion})`,
      localVersion: local.protocolVersion,
      remoteVersion: remote.protocolVersion,
      suggestion
    }
  }

  /**
   * Generate warnings about degraded functionality.
   */
  private generateWarnings(
    local: PeerCapabilities,
    remote: PeerCapabilities,
    commonFeatures: FeatureFlag[],
    agreedVersion: number
  ): NegotiationWarning[] {
    const warnings: NegotiationWarning[] = []

    // Warn about version mismatch
    if (local.protocolVersion !== remote.protocolVersion) {
      const olderPeer = local.protocolVersion < remote.protocolVersion ? 'local' : 'remote'
      warnings.push({
        type: 'version-mismatch',
        message: `${olderPeer === 'local' ? 'Local' : 'Remote'} peer using older protocol v${Math.min(local.protocolVersion, remote.protocolVersion)} (agreed on v${agreedVersion})`
      })
    }

    // Warn about features unavailable due to remote
    const missingFromRemote = diffFeatures(local.features, remote.features)
    if (missingFromRemote.length > 0) {
      warnings.push({
        type: 'degraded-features',
        message: `Features unavailable with this peer: ${missingFromRemote.join(', ')}`,
        affectedFeatures: missingFromRemote
      })
    }

    // Warn about unknown features from remote (features we don't recognize)
    const unknownFromRemote = (remote.features as string[]).filter(
      (f) => !local.features.includes(f as FeatureFlag)
    ) as FeatureFlag[]
    if (unknownFromRemote.length > 0) {
      warnings.push({
        type: 'unknown-features',
        message: `Remote advertises unknown features: ${unknownFromRemote.join(', ')}`,
        affectedFeatures: unknownFromRemote
      })
    }

    return warnings
  }
}

// ─── Default Instance ────────────────────────────────────────────────────────

/**
 * Default negotiator instance for convenience.
 */
export const defaultNegotiator = new VersionNegotiator()
