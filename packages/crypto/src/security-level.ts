/**
 * Security level definitions for multi-level cryptography.
 *
 * xNet supports three security levels:
 * - Level 0 (Fast): Ed25519 only - zero overhead, classical security
 * - Level 1 (Hybrid): Ed25519 + ML-DSA-65 - both classical and quantum security
 * - Level 2 (PQ-Only): ML-DSA-65 only - maximum quantum security
 *
 * Strategy: "Implement now, default to Level 0"
 * All infrastructure is in place, and upgrading is just changing DEFAULT_SECURITY_LEVEL.
 */

// ─── Security Level Type ─────────────────────────────────────────

/**
 * Security levels for cryptographic operations.
 * - Level 0 (Fast): Ed25519 only - for high-frequency, low-value operations
 * - Level 1 (Hybrid): Ed25519 + ML-DSA - DEFAULT when quantum threats emerge
 * - Level 2 (PQ-Only): ML-DSA only - maximum quantum security
 */
export type SecurityLevel = 0 | 1 | 2

/**
 * Configuration for each security level.
 */
export interface SecurityLevelConfig {
  /** Numeric level identifier */
  level: SecurityLevel

  /** Human-readable name */
  name: string

  /** Description of use case */
  description: string

  /** Algorithms used at this level */
  algorithms: {
    signing: readonly ('ed25519' | 'ml-dsa-65')[]
    keyExchange: readonly ('x25519' | 'ml-kem-768')[]
  }

  /** Approximate signature size in bytes */
  signatureSize: number

  /** Verification policy: all signatures must verify */
  verificationRequired: 'all'
}

// ─── Security Level Configuration ────────────────────────────────

/**
 * Configuration map for all security levels.
 */
export const SECURITY_LEVELS: Readonly<Record<SecurityLevel, SecurityLevelConfig>> = {
  0: {
    level: 0,
    name: 'Fast',
    description: 'Ed25519 only - zero overhead, classical security',
    algorithms: {
      signing: ['ed25519'] as const,
      keyExchange: ['x25519'] as const
    },
    signatureSize: 64,
    verificationRequired: 'all'
  },
  1: {
    level: 1,
    name: 'Hybrid',
    description: 'Ed25519 + ML-DSA-65 - both classical and quantum security',
    algorithms: {
      signing: ['ed25519', 'ml-dsa-65'] as const,
      keyExchange: ['x25519', 'ml-kem-768'] as const
    },
    signatureSize: 64 + 3309, // ~3.4KB
    verificationRequired: 'all'
  },
  2: {
    level: 2,
    name: 'Post-Quantum',
    description: 'ML-DSA-65 only - maximum quantum security, no classical fallback',
    algorithms: {
      signing: ['ml-dsa-65'] as const,
      keyExchange: ['ml-kem-768'] as const
    },
    signatureSize: 3309,
    verificationRequired: 'all'
  }
} as const

/**
 * Default security level for new operations.
 *
 * Currently Level 0 (Ed25519 only) for zero overhead.
 * When quantum threats emerge, change to Level 1 (Hybrid).
 */
export const DEFAULT_SECURITY_LEVEL: SecurityLevel = 0

// ─── Type Guards ─────────────────────────────────────────────────

/**
 * Type guard for SecurityLevel.
 */
export function isSecurityLevel(value: unknown): value is SecurityLevel {
  return value === 0 || value === 1 || value === 2
}

/**
 * Get the configuration for a security level.
 */
export function getSecurityLevelConfig(level: SecurityLevel): SecurityLevelConfig {
  return SECURITY_LEVELS[level]
}

/**
 * Check if a security level requires Ed25519.
 */
export function requiresEd25519(level: SecurityLevel): boolean {
  return level === 0 || level === 1
}

/**
 * Check if a security level requires ML-DSA.
 */
export function requiresMlDsa(level: SecurityLevel): boolean {
  return level === 1 || level === 2
}
