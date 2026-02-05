/**
 * useHubStatus - Access hub connection status from context.
 */
import type { SyncStatus } from '../sync/sync-manager'
import { useContext } from 'react'
import { XNetContext } from '../context'

export function useHubStatus(): SyncStatus {
  const context = useContext(XNetContext)
  return context?.hubStatus ?? 'disconnected'
}
