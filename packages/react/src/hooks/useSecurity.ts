/**
 * useSecurity - Hook for security-aware operations.
 *
 * Provides signing and verification functions that use the current
 * security level from the SecurityContext.
 */

import type { DID } from '@xnetjs/core'
import {
  hybridSign,
  hybridVerify,
  type SecurityLevel,
  type UnifiedSignature,
  type VerificationResult
} from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'
import { useCallback, useMemo } from 'react'
import { useSecurityContext } from '../context/security-context'

// ─── Types ────────────────────────────────────────────────────

/**
 * Options for useSecurity hook.
 */
export interface UseSecurityOptions {
  /** Override default security level for this hook instance */
  level?: SecurityLevel
}

/**
 * Return type for useSecurity hook.
 */
export interface UseSecurityResult {
  /** Current security level (from context or override) */
  level: SecurityLevel

  /** Whether the current key bundle has PQ keys */
  hasPQKeys: boolean

  /** Maximum level supported by current keys (0 if no PQ keys, 2 if PQ keys present) */
  maxLevel: SecurityLevel

  /** Sign data at current security level */
  sign: (data: Uint8Array) => UnifiedSignature

  /** Verify a signature against a DID */
  verify: (data: Uint8Array, signature: UnifiedSignature, did: DID) => Promise<VerificationResult>

  /** Set the global security level */
  setLevel: (level: SecurityLevel) => void

  /** Check if a level is supported by current keys */
  canSignAt: (level: SecurityLevel) => boolean

  /** Check if key bundle is available */
  hasKeyBundle: boolean
}

// ─── Hook ─────────────────────────────────────────────────────

/**
 * Hook for security-aware operations.
 *
 * Provides signing and verification functions that use the current
 * security level from the SecurityContext.
 *
 * @example
 * ```tsx
 * function SignedMessage() {
 *   const { sign, verify, level, hasPQKeys } = useSecurity()
 *
 *   const handleSign = async () => {
 *     const data = new TextEncoder().encode('Hello')
 *     const sig = sign(data)
 *     console.log(`Signed at Level ${sig.level}`)
 *   }
 *
 *   return (
 *     <div>
 *       <p>Security Level: {level}</p>
 *       <p>PQ Keys: {hasPQKeys ? 'Yes' : 'No'}</p>
 *       <button onClick={handleSign}>Sign</button>
 *     </div>
 *   )
 * }
 * ```
 *
 * @example Per-operation level override
 * ```tsx
 * function HighSecurityOperation() {
 *   const { sign } = useSecurity({ level: 2 }) // Force Level 2
 *
 *   const handleCritical = () => {
 *     const data = new TextEncoder().encode('Critical operation')
 *     const sig = sign(data) // Signs at Level 2
 *     console.log(sig.level) // 2
 *   }
 *
 *   return <button onClick={handleCritical}>Critical Action</button>
 * }
 * ```
 *
 * @example Fast mode for high-frequency operations
 * ```tsx
 * function CursorUpdates() {
 *   const { sign } = useSecurity({ level: 0 }) // Fast Ed25519-only
 *
 *   const handleCursor = (position: number) => {
 *     const data = new TextEncoder().encode(JSON.stringify({ position }))
 *     const sig = sign(data) // Fast signing
 *   }
 *
 *   return <canvas onMouseMove={(e) => handleCursor(e.clientX)} />
 * }
 * ```
 */
export function useSecurity(options: UseSecurityOptions = {}): UseSecurityResult {
  const context = useSecurityContext()

  const effectiveLevel = options.level ?? context.level

  const hasPQKeys = useMemo(
    () => context.keyBundle?.pqSigningKey !== undefined,
    [context.keyBundle]
  )

  const hasKeyBundle = useMemo(() => context.keyBundle !== undefined, [context.keyBundle])

  const maxLevel: SecurityLevel = useMemo(() => (hasPQKeys ? 2 : 0), [hasPQKeys])

  const canSignAt = useCallback(
    (level: SecurityLevel): boolean => {
      if (!context.keyBundle) return false
      if (level === 0) return true
      return hasPQKeys
    },
    [context.keyBundle, hasPQKeys]
  )

  const sign = useCallback(
    (data: Uint8Array): UnifiedSignature => {
      if (!context.keyBundle) {
        throw new Error(
          'No key bundle available. Ensure keyBundle is provided to SecurityProvider.'
        )
      }

      if (!canSignAt(effectiveLevel)) {
        throw new Error(
          `Cannot sign at Level ${effectiveLevel}: PQ keys required. ` +
            `Current key bundle only supports Level 0.`
        )
      }

      return hybridSign(
        data,
        {
          ed25519: context.keyBundle.signingKey,
          mlDsa: context.keyBundle.pqSigningKey
        },
        effectiveLevel
      )
    },
    [context.keyBundle, effectiveLevel, canSignAt]
  )

  const verify = useCallback(
    async (
      data: Uint8Array,
      signature: UnifiedSignature,
      did: DID
    ): Promise<VerificationResult> => {
      const ed25519PublicKey = parseDID(did)
      const pqPublicKey = await context.registry.lookup(did)

      return hybridVerify(
        data,
        signature,
        {
          ed25519: ed25519PublicKey,
          mlDsa: pqPublicKey ?? undefined
        },
        {
          minLevel: context.minVerificationLevel,
          policy: context.verificationPolicy
        }
      )
    },
    [context.registry, context.minVerificationLevel, context.verificationPolicy]
  )

  return {
    level: effectiveLevel,
    hasPQKeys,
    maxLevel,
    sign,
    verify,
    setLevel: context.setLevel,
    canSignAt,
    hasKeyBundle
  }
}
