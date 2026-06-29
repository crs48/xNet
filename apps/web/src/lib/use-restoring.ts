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
import { useSyncExternalStore } from 'react'
import { getColdStartProbe, shouldOfferRestore, subscribeColdStartProbe } from './store-cold-start'

export function useRestoringFromHub(): boolean {
  const hubStatus = useHubStatus()
  // The probe is recorded asynchronously now (exploration 0249 took the cold
  // COUNT(*) off the awaited boot path), so subscribe rather than read once —
  // otherwise the "restoring" affordance would never appear when the probe
  // resolves after first render.
  const probe = useSyncExternalStore(subscribeColdStartProbe, getColdStartProbe, getColdStartProbe)
  if (!probe || !shouldOfferRestore(probe)) return false
  return hubStatus !== 'connected'
}
