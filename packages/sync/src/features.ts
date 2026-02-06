/**
 * Feature flag system for xNet protocol capabilities.
 *
 * Features are capabilities that can be negotiated between peers.
 * Each feature has a protocol version where it was introduced, and may
 * have dependencies on other features.
 *
 * Usage:
 * ```typescript
 * import { FEATURES, getEnabledFeatures, isFeatureEnabled } from '@xnet/sync'
 *
 * // Get features for a protocol version
 * const features = getEnabledFeatures(2) // ['node-changes', 'yjs-updates', ...]
 *
 * // Check if a feature is enabled in a negotiated set
 * if (isFeatureEnabled('schema-versioning', negotiatedFeatures)) {
 *   // Use schema versioning
 * }
 * ```
 */

import { CURRENT_PROTOCOL_VERSION } from './change'

// ─── Feature Definitions ─────────────────────────────────────────────────────

/**
 * All known feature flag names.
 * Defined as a union type to allow forward-references in FeatureConfig.
 */
export type FeatureFlag =
  // Core features (v1)
  | 'node-changes'
  | 'yjs-updates'
  // Protocol v1 features
  | 'signed-yjs-envelopes'
  | 'batch-changes'
  | 'lamport-ordering'
  | 'hash-chains'
  // Protocol v2 features
  | 'schema-versioning'
  | 'capability-negotiation'
  | 'peer-scoring'
  | 'schema-lenses'
  | 'unknown-preservation'
  // Protocol v3 features (future)
  | 'schema-inheritance'
  | 'federated-queries'
  | 'compressed-payloads'

/**
 * Feature configuration for a protocol capability.
 */
export interface FeatureConfig {
  /** Protocol version when this feature was introduced */
  since: number
  /** Whether this feature is required (cannot be disabled) */
  required: boolean
  /** Human-readable description */
  description: string
  /** Features this one depends on (must be enabled if this is enabled) */
  requires?: FeatureFlag[]
  /** Features that conflict with this one (cannot both be enabled) */
  conflicts?: FeatureFlag[]
}

/**
 * Registry of all supported features.
 *
 * Features are organized by when they were introduced:
 * - Protocol v1: Core sync primitives
 * - Protocol v2: Schema versioning and capability negotiation
 * - Protocol v3+: Future extensions
 */
export const FEATURES: Record<FeatureFlag, FeatureConfig> = {
  // ─── Core Features (always present since v1) ───────────────────────────────

  /** Basic node change synchronization */
  'node-changes': {
    since: 1,
    required: true,
    description: 'Basic node change synchronization'
  },

  /** Yjs CRDT document synchronization */
  'yjs-updates': {
    since: 1,
    required: true,
    description: 'Yjs CRDT document synchronization'
  },

  // ─── Protocol v1 Features ──────────────────────────────────────────────────

  /** Cryptographically signed Yjs update envelopes */
  'signed-yjs-envelopes': {
    since: 1,
    required: false,
    description: 'Cryptographically signed Yjs update envelopes',
    requires: ['yjs-updates']
  },

  /** Transaction batching for atomic multi-change operations */
  'batch-changes': {
    since: 1,
    required: false,
    description: 'Transaction batching for atomic multi-change operations',
    requires: ['node-changes']
  },

  /** Lamport clock ordering for conflict resolution */
  'lamport-ordering': {
    since: 1,
    required: false,
    description: 'Lamport clock ordering for conflict resolution'
  },

  /** Hash chain integrity verification */
  'hash-chains': {
    since: 1,
    required: false,
    description: 'Hash chain integrity verification',
    requires: ['node-changes']
  },

  // ─── Protocol v2 Features ──────────────────────────────────────────────────

  /** Schema versioning with semver */
  'schema-versioning': {
    since: 2,
    required: false,
    description: 'Schema versioning with semver'
  },

  /** Peer capability negotiation on connect */
  'capability-negotiation': {
    since: 2,
    required: false,
    description: 'Peer capability negotiation on connect'
  },

  /** Reputation-based peer scoring */
  'peer-scoring': {
    since: 2,
    required: false,
    description: 'Reputation-based peer scoring'
  },

  /** Schema lens migrations for version transformations */
  'schema-lenses': {
    since: 2,
    required: false,
    description: 'Schema lens migrations for version transformations',
    requires: ['schema-versioning']
  },

  /** Unknown property preservation (graceful degradation) */
  'unknown-preservation': {
    since: 2,
    required: false,
    description: 'Unknown property preservation for forward compatibility'
  },

  // ─── Protocol v3 Features (Future) ─────────────────────────────────────────

  /** Schema inheritance with property overrides */
  'schema-inheritance': {
    since: 3,
    required: false,
    description: 'Schema inheritance with property overrides',
    requires: ['schema-versioning']
  },

  /** Cross-document federated queries */
  'federated-queries': {
    since: 3,
    required: false,
    description: 'Cross-document federated queries'
  },

  /** Compressed change payloads */
  'compressed-payloads': {
    since: 3,
    required: false,
    description: 'Compressed change payloads for bandwidth efficiency'
  }
}

/**
 * Array of all feature flag names.
 */
export const ALL_FEATURES = Object.keys(FEATURES) as FeatureFlag[]

// ─── Feature Queries ─────────────────────────────────────────────────────────

/**
 * Get all features enabled at a given protocol version.
 *
 * @param protocolVersion - The protocol version to check
 * @returns Array of feature flags enabled at this version
 *
 * @example
 * ```typescript
 * const v1Features = getEnabledFeatures(1)
 * // ['node-changes', 'yjs-updates', 'signed-yjs-envelopes', ...]
 *
 * const v2Features = getEnabledFeatures(2)
 * // [...v1Features, 'schema-versioning', 'capability-negotiation', ...]
 * ```
 */
export function getEnabledFeatures(protocolVersion: number): FeatureFlag[] {
  return ALL_FEATURES.filter((name) => {
    const config = FEATURES[name]
    return config.since <= protocolVersion
  })
}

/**
 * Check if a feature is enabled in a negotiated feature set.
 *
 * @param feature - The feature to check
 * @param enabledFeatures - The set of enabled features (from negotiation)
 * @returns true if the feature is in the enabled set
 *
 * @example
 * ```typescript
 * const negotiated = ['node-changes', 'yjs-updates', 'schema-versioning']
 * isFeatureEnabled('schema-versioning', negotiated) // true
 * isFeatureEnabled('federated-queries', negotiated) // false
 * ```
 */
export function isFeatureEnabled(
  feature: FeatureFlag,
  enabledFeatures: readonly FeatureFlag[] | readonly string[]
): boolean {
  return enabledFeatures.includes(feature)
}

/**
 * Get required features for a protocol version.
 * These features cannot be disabled during negotiation.
 *
 * @param protocolVersion - The protocol version to check
 * @returns Array of required feature flags
 */
export function getRequiredFeatures(protocolVersion: number): FeatureFlag[] {
  return getEnabledFeatures(protocolVersion).filter((name) => FEATURES[name].required)
}

/**
 * Get optional features for a protocol version.
 * These features can be enabled or disabled during negotiation.
 *
 * @param protocolVersion - The protocol version to check
 * @returns Array of optional feature flags
 */
export function getOptionalFeatures(protocolVersion: number): FeatureFlag[] {
  return getEnabledFeatures(protocolVersion).filter((name) => !FEATURES[name].required)
}

/**
 * Get the minimum protocol version required for a feature.
 *
 * @param feature - The feature to check
 * @returns The protocol version when this feature was introduced
 */
export function getFeatureVersion(feature: FeatureFlag): number {
  return FEATURES[feature].since
}

/**
 * Check if a feature is available at a given protocol version.
 *
 * @param feature - The feature to check
 * @param protocolVersion - The protocol version
 * @returns true if the feature is available at this version
 */
export function isFeatureAvailable(feature: FeatureFlag, protocolVersion: number): boolean {
  return FEATURES[feature].since <= protocolVersion
}

// ─── Feature Dependencies ────────────────────────────────────────────────────

/**
 * Result of validating a feature set.
 */
export interface FeatureValidationResult {
  valid: boolean
  errors: FeatureValidationError[]
  warnings: FeatureValidationWarning[]
}

export interface FeatureValidationError {
  type: 'missing-dependency' | 'conflict' | 'version-mismatch' | 'missing-required'
  feature: FeatureFlag
  message: string
  relatedFeature?: FeatureFlag
}

export interface FeatureValidationWarning {
  type: 'deprecated' | 'experimental'
  feature: FeatureFlag
  message: string
}

/**
 * Get the dependencies of a feature (features it requires).
 *
 * @param feature - The feature to check
 * @returns Array of required features, or empty array if none
 */
export function getFeatureDependencies(feature: FeatureFlag): FeatureFlag[] {
  return FEATURES[feature].requires ?? []
}

/**
 * Get features that conflict with a given feature.
 *
 * @param feature - The feature to check
 * @returns Array of conflicting features, or empty array if none
 */
export function getFeatureConflicts(feature: FeatureFlag): FeatureFlag[] {
  return FEATURES[feature].conflicts ?? []
}

/**
 * Get all transitive dependencies of a feature (recursive).
 *
 * @param feature - The feature to check
 * @param visited - Set of already-visited features (for cycle detection)
 * @returns Array of all required features (direct and transitive)
 */
export function getAllDependencies(
  feature: FeatureFlag,
  visited: Set<FeatureFlag> = new Set()
): FeatureFlag[] {
  if (visited.has(feature)) {
    return [] // Cycle detected, stop recursion
  }
  visited.add(feature)

  const direct = getFeatureDependencies(feature)
  const transitive: FeatureFlag[] = []

  for (const dep of direct) {
    transitive.push(dep)
    transitive.push(...getAllDependencies(dep, visited))
  }

  // Return unique dependencies
  return [...new Set(transitive)]
}

/**
 * Validate a set of features for consistency.
 *
 * Checks for:
 * - Missing required dependencies
 * - Conflicting features
 * - Required features that are missing
 * - Version compatibility issues
 *
 * @param features - Array of features to validate
 * @param protocolVersion - The protocol version context
 * @returns Validation result with errors and warnings
 */
export function validateFeatureSet(
  features: readonly FeatureFlag[],
  protocolVersion: number = CURRENT_PROTOCOL_VERSION
): FeatureValidationResult {
  const errors: FeatureValidationError[] = []
  const warnings: FeatureValidationWarning[] = []
  const featureSet = new Set(features)

  // Check that all required features are present
  const required = getRequiredFeatures(protocolVersion)
  for (const req of required) {
    if (!featureSet.has(req)) {
      errors.push({
        type: 'missing-required',
        feature: req,
        message: `Required feature '${req}' is not in feature set`
      })
    }
  }

  for (const feature of features) {
    // Check version compatibility
    if (!isFeatureAvailable(feature, protocolVersion)) {
      errors.push({
        type: 'version-mismatch',
        feature,
        message: `Feature '${feature}' requires protocol v${FEATURES[feature].since}, but running v${protocolVersion}`
      })
    }

    // Check dependencies
    const deps = getFeatureDependencies(feature)
    for (const dep of deps) {
      if (!featureSet.has(dep)) {
        errors.push({
          type: 'missing-dependency',
          feature,
          relatedFeature: dep,
          message: `Feature '${feature}' requires '${dep}' which is not enabled`
        })
      }
    }

    // Check conflicts
    const conflicts = getFeatureConflicts(feature)
    for (const conflict of conflicts) {
      if (featureSet.has(conflict)) {
        errors.push({
          type: 'conflict',
          feature,
          relatedFeature: conflict,
          message: `Feature '${feature}' conflicts with '${conflict}'`
        })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Compute the intersection of two feature sets.
 * Used during negotiation to find common features.
 *
 * @param local - Local peer's features
 * @param remote - Remote peer's features
 * @returns Features present in both sets
 */
export function intersectFeatures(
  local: readonly FeatureFlag[],
  remote: readonly FeatureFlag[] | readonly string[]
): FeatureFlag[] {
  const remoteSet = new Set(remote)
  return local.filter((f) => remoteSet.has(f))
}

/**
 * Compute the difference between two feature sets.
 * Returns features in `a` that are not in `b`.
 *
 * @param a - First feature set
 * @param b - Second feature set
 * @returns Features in a but not in b
 */
export function diffFeatures(
  a: readonly FeatureFlag[],
  b: readonly FeatureFlag[] | readonly string[]
): FeatureFlag[] {
  const bSet = new Set(b)
  return a.filter((f) => !bSet.has(f))
}

/**
 * Add all dependencies to a feature set (closure).
 * Ensures the set is valid by including all required dependencies.
 *
 * @param features - Initial feature set
 * @returns Feature set with all dependencies included
 */
export function addDependencies(features: readonly FeatureFlag[]): FeatureFlag[] {
  const result = new Set(features)

  for (const feature of features) {
    const deps = getAllDependencies(feature)
    for (const dep of deps) {
      result.add(dep)
    }
  }

  return [...result]
}
