/**
 * useIdentity hook for identity access
 */
import { useXNet } from '../context'
import type { Identity } from '@xnet/identity'

/**
 * Result from useIdentity hook
 */
export interface UseIdentityResult {
  identity: Identity | null
  isAuthenticated: boolean
  did: string | null
}

/**
 * Hook for accessing current identity
 */
export function useIdentity(): UseIdentityResult {
  const { identity } = useXNet()

  return {
    identity: identity ?? null,
    isAuthenticated: !!identity,
    did: identity?.did ?? null
  }
}
