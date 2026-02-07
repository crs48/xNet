/**
 * useEditLock Hook
 *
 * Manages edit locks for canvas nodes, preventing concurrent editing.
 */

import type { SelectionLockManager, SelectionLock } from '../presence/selection-lock'
import { useCallback, useEffect, useRef } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseEditLockOptions {
  /** Selection lock manager instance */
  lockManager: SelectionLockManager
  /** Node ID to auto-acquire lock for (null to not auto-acquire) */
  nodeId: string | null
  /** Callback when lock acquisition fails */
  onLockFailed?: (lockedBy: { name: string; color: string }) => void
}

export interface UseEditLockReturn {
  /** Try to acquire a lock on a node */
  acquireLock: (id: string) => boolean
  /** Release the currently held lock */
  releaseLock: () => void
  /** Check if a node is locked by someone else */
  isLockedByOther: (id: string) => SelectionLock | null
  /** Check if we currently hold the lock for a node */
  isLockedByMe: (id: string) => boolean
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useEditLock({
  lockManager,
  nodeId,
  onLockFailed
}: UseEditLockOptions): UseEditLockReturn {
  const currentLockRef = useRef<string | null>(null)

  const acquireLock = useCallback(
    (id: string): boolean => {
      const lock = lockManager.isLockedByOther(id)

      if (lock) {
        onLockFailed?.({ name: lock.ownerName, color: lock.ownerColor })
        return false
      }

      const acquired = lockManager.tryAcquireLock(id)

      if (acquired) {
        currentLockRef.current = id
      }

      return acquired
    },
    [lockManager, onLockFailed]
  )

  const releaseLock = useCallback(() => {
    if (currentLockRef.current) {
      lockManager.releaseLock(currentLockRef.current)
      currentLockRef.current = null
    }
  }, [lockManager])

  const isLockedByOther = useCallback(
    (id: string): SelectionLock | null => {
      return lockManager.isLockedByOther(id)
    },
    [lockManager]
  )

  const isLockedByMe = useCallback(
    (id: string): boolean => {
      return lockManager.isLockedByMe(id)
    },
    [lockManager]
  )

  // Release lock on unmount
  useEffect(() => {
    return () => {
      if (currentLockRef.current) {
        lockManager.releaseLock(currentLockRef.current)
        currentLockRef.current = null
      }
    }
  }, [lockManager])

  // Auto-acquire lock when nodeId provided
  useEffect(() => {
    if (nodeId) {
      acquireLock(nodeId)
    } else {
      releaseLock()
    }

    // Release on nodeId change
    return () => {
      if (nodeId && currentLockRef.current === nodeId) {
        releaseLock()
      }
    }
  }, [nodeId, acquireLock, releaseLock])

  return {
    acquireLock,
    releaseLock,
    isLockedByOther,
    isLockedByMe
  }
}
