/**
 * useRestoringFromHub (exploration 0204).
 *
 * True while the local cache looked evicted at boot AND a hub is configured
 * AND the hub hasn't reconnected yet — i.e. we expect data, it's just still
 * re-syncing. Views use this to show a "restoring" affordance instead of a
 * misleading "No documents yet" empty state or a blank screen. Flips false
 * once the hub connects, after which whatever synced (or a genuine empty
 * state) is shown.
 */
import { useHubStatus } from '@xnetjs/react'
import { getColdStartProbe, shouldOfferRestore } from './store-cold-start'

export function useRestoringFromHub(): boolean {
  const hubStatus = useHubStatus()
  const probe = getColdStartProbe()
  if (!probe || !shouldOfferRestore(probe)) return false
  return hubStatus !== 'connected'
}
