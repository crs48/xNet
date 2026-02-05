/**
 * useSyncManager - Access the Background Sync Manager from context
 *
 * Returns null if SyncManager is not available (disabled, not initialized,
 * or when running outside XNetProvider).
 */
import type { SyncManager } from '../sync/sync-manager'
import { useContext } from 'react'
import { XNetContext } from '../context'

export function useSyncManager(): SyncManager | null {
  const context = useContext(XNetContext)
  return context?.syncManager ?? null
}
