/**
 * "What we know about you" — the app-side wiring (Charter §Consent, 0234).
 *
 * Composes the merged `@xnetjs/telemetry` mirror over the app's single local
 * telemetry collector. Because xNet keeps no behavioral surplus, this is the
 * whole truth: there is no profile, no ad graph, no fourth category. The hook
 * hydrates the durable buffer first so anything queued from a previous session
 * is included, then returns a purgeable inventory.
 */
import {
  describeWhatWeKnow,
  telemetryDerivedSource,
  type DerivedDataSource,
  type DerivedItem
} from '@xnetjs/telemetry'
import { useCallback, useEffect, useState } from 'react'
import { getTelemetryCollector } from './error-reporter'

/** Every derived-data source the app can surface. Telemetry today; vectors/brain join here. */
export function derivedDataSources(): DerivedDataSource[] {
  return [telemetryDerivedSource(getTelemetryCollector())]
}

export interface DerivedDataController {
  items: DerivedItem[]
  loading: boolean
  refresh: () => Promise<void>
  purge: (item: DerivedItem) => Promise<void>
  purgeAll: () => Promise<void>
}

export function useDerivedData(): DerivedDataController {
  const [items, setItems] = useState<DerivedItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    // Pull any durably-buffered records into the working set so the mirror is
    // complete — never lie by omission.
    await getTelemetryCollector()
      .hydrate()
      .catch(() => {})
    setItems(await describeWhatWeKnow(derivedDataSources()))
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const purge = useCallback(
    async (item: DerivedItem) => {
      await item.purge()
      await refresh()
    },
    [refresh]
  )

  const purgeAll = useCallback(async () => {
    const current = await describeWhatWeKnow(derivedDataSources())
    await Promise.all(current.map((item) => item.purge()))
    await refresh()
  }, [refresh])

  return { items, loading, refresh, purge, purgeAll }
}
