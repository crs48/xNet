/**
 * Security policy for operation-based security level selection.
 *
 * Different operations may warrant different security levels:
 * - High-frequency, low-value ops (cursors) → Level 0 (fast)
 * - Regular data ops → Level 1 (hybrid)
 * - Critical ops (key rotation) → Level 2 (maximum)
 */

import type { SecurityLevel } from '@xnet/crypto'
import { DEFAULT_SECURITY_LEVEL } from '@xnet/crypto'

// ─── Types ────────────────────────────────────────────────────────

/**
 * Security policy configuration.
 */
export interface SecurityPolicy {
  /** Default level for operations not explicitly configured */
  default: SecurityLevel

  /** Per-operation type overrides */
  overrides: Record<string, SecurityLevel>
}

/**
 * Common operation types for security level selection.
 */
export type OperationType =
  // High-frequency, ephemeral (Level 0)
  | 'cursor-update'
  | 'presence-update'
  | 'typing-indicator'
  | 'viewport-update'
  | 'awareness-update'
  // Regular operations (Level 1)
  | 'node-create'
  | 'node-update'
  | 'node-delete'
  | 'yjs-update'
  | 'comment-add'
  // Critical operations (Level 2)
  | 'key-rotation'
  | 'permission-grant'
  | 'permission-revoke'
  | 'identity-recovery'
  | 'share-create'

// ─── Default Policy ───────────────────────────────────────────────

/**
 * Default security policy.
 *
 * Uses Level 0 (Ed25519-only) by default for performance.
 * High-frequency ephemeral operations use Level 0.
 * Regular operations inherit the default.
 * Critical operations can be configured to use Level 1 or 2.
 */
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  default: DEFAULT_SECURITY_LEVEL,

  overrides: {
    // High-frequency, ephemeral operations - fast Ed25519
    'cursor-update': 0,
    'presence-update': 0,
    'typing-indicator': 0,
    'viewport-update': 0,
    'awareness-update': 0

    // Regular operations - use default (currently Level 0)
    // When we upgrade to Level 1 default, these will automatically use hybrid
    // 'node-create': 1,
    // 'node-update': 1,
    // 'node-delete': 1,

    // Critical operations - can be upgraded to Level 1/2 when PQ is enabled
    // 'key-rotation': 2,
    // 'permission-grant': 1,
    // 'permission-revoke': 2,
    // 'identity-recovery': 2,
  }
}

/**
 * Hybrid security policy for when PQ protection is desired.
 *
 * Uses Level 1 (hybrid) for regular operations.
 * Still uses Level 0 for high-frequency ephemeral ops.
 * Critical ops use Level 2 (PQ-only).
 */
export const HYBRID_SECURITY_POLICY: SecurityPolicy = {
  default: 1,

  overrides: {
    // High-frequency, ephemeral operations - fast Ed25519
    'cursor-update': 0,
    'presence-update': 0,
    'typing-indicator': 0,
    'viewport-update': 0,
    'awareness-update': 0,

    // Regular operations - hybrid signatures
    'node-create': 1,
    'node-update': 1,
    'node-delete': 1,
    'yjs-update': 1,
    'comment-add': 1,

    // Critical operations - maximum security
    'key-rotation': 2,
    'permission-grant': 1,
    'permission-revoke': 2,
    'identity-recovery': 2,
    'share-create': 1
  }
}

/**
 * Maximum security policy for high-security environments.
 *
 * Uses Level 2 (PQ-only) for everything except ephemeral ops.
 */
export const MAX_SECURITY_POLICY: SecurityPolicy = {
  default: 2,

  overrides: {
    // High-frequency, ephemeral operations - still fast
    'cursor-update': 0,
    'presence-update': 0,
    'typing-indicator': 0,
    'viewport-update': 0,
    'awareness-update': 0
  }
}

// ─── Functions ────────────────────────────────────────────────────

/**
 * Get the security level for an operation type.
 *
 * @param operationType - The type of operation
 * @param policy - Security policy to use (default: DEFAULT_SECURITY_POLICY)
 * @returns The appropriate security level
 *
 * @example
 * ```typescript
 * // Get level for a cursor update (fast)
 * const level = getSecurityLevel('cursor-update')  // 0
 *
 * // Get level for a node creation
 * const level = getSecurityLevel('node-create')  // uses policy default
 *
 * // Use hybrid policy for PQ protection
 * const level = getSecurityLevel('node-create', HYBRID_SECURITY_POLICY)  // 1
 * ```
 */
export function getSecurityLevel(
  operationType: string,
  policy: SecurityPolicy = DEFAULT_SECURITY_POLICY
): SecurityLevel {
  const override = policy.overrides[operationType]
  return override !== undefined ? override : policy.default
}

/**
 * Check if an operation type is ephemeral (high-frequency, low-value).
 *
 * Ephemeral operations typically use Level 0 for performance.
 */
export function isEphemeralOperation(operationType: string): boolean {
  const ephemeralOps = [
    'cursor-update',
    'presence-update',
    'typing-indicator',
    'viewport-update',
    'awareness-update'
  ]
  return ephemeralOps.includes(operationType)
}

/**
 * Check if an operation type is critical (requires high security).
 */
export function isCriticalOperation(operationType: string): boolean {
  const criticalOps = ['key-rotation', 'permission-revoke', 'identity-recovery']
  return criticalOps.includes(operationType)
}

/**
 * Create a custom security policy.
 *
 * @example
 * ```typescript
 * const myPolicy = createSecurityPolicy({
 *   default: 1,
 *   overrides: {
 *     'cursor-update': 0,
 *     'key-rotation': 2
 *   }
 * })
 * ```
 */
export function createSecurityPolicy(options: Partial<SecurityPolicy> = {}): SecurityPolicy {
  return {
    default: options.default ?? DEFAULT_SECURITY_LEVEL,
    overrides: {
      ...DEFAULT_SECURITY_POLICY.overrides,
      ...options.overrides
    }
  }
}

/**
 * Merge policies, with later policies taking precedence.
 */
export function mergeSecurityPolicies(...policies: Partial<SecurityPolicy>[]): SecurityPolicy {
  const merged: SecurityPolicy = {
    default: DEFAULT_SECURITY_LEVEL,
    overrides: {}
  }

  for (const policy of policies) {
    if (policy.default !== undefined) {
      merged.default = policy.default
    }
    if (policy.overrides) {
      merged.overrides = { ...merged.overrides, ...policy.overrides }
    }
  }

  return merged
}
