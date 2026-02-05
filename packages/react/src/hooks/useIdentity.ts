/**
 * useIdentity hook for identity access
 */
import type { Identity } from '@xnet/identity'
import { useXNet } from '../context'

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
  const { identity, authorDID } = useXNet()

  return {
    identity: identity ?? null,
    isAuthenticated: !!identity || !!authorDID,
    did: identity?.did ?? authorDID ?? null
  }
}
