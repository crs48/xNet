/**
 * Security context for multi-level cryptography.
 *
 * Provides global security configuration and state management for:
 * - Security level selection (0, 1, 2)
 * - Verification policy configuration
 * - PQ key registry access
 * - Key bundle management
 */

import type { SecurityLevel } from '@xnet/crypto'
import type { PQKeyRegistry, HybridKeyBundle } from '@xnet/identity'
import { DEFAULT_SECURITY_LEVEL } from '@xnet/crypto'
import { MemoryPQKeyRegistry } from '@xnet/identity'
import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────

/**
 * Security context state.
 */
export interface SecurityContextState {
  /** Current security level for new signatures */
  level: SecurityLevel

  /** Minimum level to accept during verification */
  minVerificationLevel: SecurityLevel

  /** Verification policy */
  verificationPolicy: 'strict' | 'permissive'

  /** PQ key registry */
  registry: PQKeyRegistry

  /** Current key bundle (if available) */
  keyBundle?: HybridKeyBundle
}

/**
 * Security context actions.
 */
export interface SecurityContextActions {
  /** Set the signing security level */
  setLevel: (level: SecurityLevel) => void

  /** Set the minimum verification level */
  setMinVerificationLevel: (level: SecurityLevel) => void

  /** Set the verification policy */
  setVerificationPolicy: (policy: 'strict' | 'permissive') => void

  /** Update the key bundle */
  setKeyBundle: (bundle: HybridKeyBundle | undefined) => void
}

/**
 * Combined security context value.
 */
export type SecurityContextValue = SecurityContextState & SecurityContextActions

// ─── Context ──────────────────────────────────────────────────

const SecurityContext = createContext<SecurityContextValue | null>(null)

// ─── Provider Props ───────────────────────────────────────────

/**
 * Security provider props.
 */
export interface SecurityProviderProps {
  children: ReactNode

  /** Initial security level (default: 0 for Ed25519-only) */
  level?: SecurityLevel

  /** Initial minimum verification level (default: 0) */
  minVerificationLevel?: SecurityLevel

  /** Initial verification policy (default: 'strict') */
  verificationPolicy?: 'strict' | 'permissive'

  /** PQ key registry (default: MemoryPQKeyRegistry) */
  registry?: PQKeyRegistry

  /** Initial key bundle */
  keyBundle?: HybridKeyBundle
}

// ─── Provider Component ───────────────────────────────────────

/**
 * Security provider component.
 *
 * Wraps the application with security configuration and state.
 *
 * @example
 * ```tsx
 * <SecurityProvider level={1} verificationPolicy="strict">
 *   <App />
 * </SecurityProvider>
 * ```
 */
export function SecurityProvider({
  children,
  level: initialLevel = DEFAULT_SECURITY_LEVEL,
  minVerificationLevel: initialMinLevel = 0,
  verificationPolicy: initialPolicy = 'strict',
  registry: providedRegistry,
  keyBundle: initialBundle
}: SecurityProviderProps): JSX.Element {
  const [level, setLevel] = useState<SecurityLevel>(initialLevel)
  const [minVerificationLevel, setMinVerificationLevel] = useState<SecurityLevel>(initialMinLevel)
  const [verificationPolicy, setVerificationPolicy] = useState<'strict' | 'permissive'>(
    initialPolicy
  )
  const [keyBundle, setKeyBundle] = useState<HybridKeyBundle | undefined>(initialBundle)

  // Update state when props change
  useEffect(() => {
    setLevel(initialLevel)
  }, [initialLevel])

  useEffect(() => {
    setMinVerificationLevel(initialMinLevel)
  }, [initialMinLevel])

  useEffect(() => {
    setVerificationPolicy(initialPolicy)
  }, [initialPolicy])

  useEffect(() => {
    setKeyBundle(initialBundle)
  }, [initialBundle])

  const registry = useMemo(() => providedRegistry ?? new MemoryPQKeyRegistry(), [providedRegistry])

  const value = useMemo<SecurityContextValue>(
    () => ({
      level,
      minVerificationLevel,
      verificationPolicy,
      registry,
      keyBundle,
      setLevel,
      setMinVerificationLevel,
      setVerificationPolicy,
      setKeyBundle
    }),
    [level, minVerificationLevel, verificationPolicy, registry, keyBundle]
  )

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>
}

// ─── Hook ─────────────────────────────────────────────────────

/**
 * Hook to access security context.
 *
 * @throws Error if used outside of SecurityProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { level, setLevel, registry } = useSecurityContext()
 *   // ...
 * }
 * ```
 */
export function useSecurityContext(): SecurityContextValue {
  const context = useContext(SecurityContext)
  if (!context) {
    throw new Error('useSecurityContext must be used within SecurityProvider')
  }
  return context
}

/**
 * Hook to optionally access security context.
 *
 * Returns null if used outside of SecurityProvider (no error thrown).
 */
export function useSecurityContextOptional(): SecurityContextValue | null {
  return useContext(SecurityContext)
}
