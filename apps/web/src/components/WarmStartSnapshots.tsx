/**
 * Warm-start snapshot wiring (exploration 0264, Wave 3).
 *
 * On mount (provider level, before routes): seed persisted query snapshots
 * into the bridge cache as stale entries — the landing surface paints from
 * them instantly while its live query revalidates. Once the boot settles,
 * persist the now-live working set for the NEXT boot. Renders nothing.
 *
 * Only the main-thread bridge exposes the snapshot seam today; other
 * runtimes no-op harmlessly.
 */
import { useDataBridge } from '@xnetjs/react'
import { useEffect, type ReactElement } from 'react'
import { runWhenBootSettled } from '../lib/boot-timeline'
import { loadWarmStartSnapshots, saveWarmStartSnapshots } from '../lib/warm-start-snapshots'

interface SnapshotCapableBridge {
  seedQuerySnapshots: (entries: unknown[]) => number
  exportQuerySnapshots: () => unknown[]
}

function supportsSnapshots(bridge: unknown): bridge is SnapshotCapableBridge {
  return (
    typeof (bridge as SnapshotCapableBridge | null)?.seedQuerySnapshots === 'function' &&
    typeof (bridge as SnapshotCapableBridge | null)?.exportQuerySnapshots === 'function'
  )
}

export function WarmStartSnapshots({ did }: { did: string }): ReactElement | null {
  const bridge = useDataBridge()

  useEffect(() => {
    if (!bridge || !supportsSnapshots(bridge)) return

    const entries = loadWarmStartSnapshots(did)
    if (entries.length > 0) {
      const seeded = bridge.seedQuerySnapshots(entries)
      if (seeded > 0) {
        // eslint-disable-next-line no-console
        console.info('[xNet] warm-start snapshots seeded', { seeded })
      }
    }

    runWhenBootSettled(() => {
      const exported = bridge.exportQuerySnapshots()
      saveWarmStartSnapshots(did, exported as never)
    })
  }, [bridge, did])

  return null
}
