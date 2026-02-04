/**
 * useHubStatus - Access hub connection status from context.
 */
import { useContext } from 'react'
import { XNetContext } from '../context'
import type { SyncStatus } from '../sync/sync-manager'

export function useHubStatus(): SyncStatus {
  const context = useContext(XNetContext)
  return context?.hubStatus ?? 'disconnected'
}
