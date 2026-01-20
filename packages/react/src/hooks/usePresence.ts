/**
 * usePresence hook for presence awareness
 */
import { useEffect, useState, useCallback } from 'react'
import { useXNet } from '../context'

/**
 * User presence state
 */
export interface UserPresence {
  did: string
  name: string
  color: string
  cursor?: { x: number; y: number }
  selection?: { start: number; end: number }
}

/**
 * Result from usePresence hook
 */
export interface UsePresenceResult {
  localPresence: UserPresence | null
  remotePresences: UserPresence[]
  setPresence: (presence: Partial<UserPresence>) => void
}

/**
 * Generate a consistent color from a DID
 */
function generateColor(did: string): string {
  let hash = 0
  for (let i = 0; i < did.length; i++) {
    hash = did.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 70%, 50%)`
}

/**
 * Hook for managing presence in a document
 */
export function usePresence(docId: string): UsePresenceResult {
  const { identity } = useXNet()

  const [localPresence, setLocalPresence] = useState<UserPresence | null>(null)
  const [remotePresences, setRemotePresences] = useState<UserPresence[]>([])

  useEffect(() => {
    if (identity) {
      setLocalPresence({
        did: identity.did,
        name: 'User', // Would come from profile
        color: generateColor(identity.did)
      })
    }
  }, [identity])

  const setPresence = useCallback((update: Partial<UserPresence>) => {
    setLocalPresence(prev => prev ? { ...prev, ...update } : null)
    // In real implementation, would broadcast to awareness
  }, [])

  // In real implementation, would subscribe to awareness updates
  // for remote presences

  return {
    localPresence,
    remotePresences,
    setPresence
  }
}
