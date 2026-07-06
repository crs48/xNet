/**
 * useWidgetData - Execute one widget's data request reactively.
 *
 * Interpolates dashboard variables into the widget's descriptor, executes it
 * through useSavedView (the existing SavedViewDescriptor execution path —
 * bridge subscription, planner gate, client-side residual filtering,
 * loaded-snapshot aggregates), and adapts the result to the WidgetData shape
 * renderers consume.
 *
 * Refresh policy: 'live' (default) and 'on-open' both ride the bridge's push
 * subscription; { intervalMs } additionally re-resolves preset time ranges
 * and reloads on a timer so relative ranges advance.
 */

import type { WidgetData, WidgetDataRequest } from '../types'
import { useSavedView } from '@xnetjs/react'
import { useEffect, useMemo, useState } from 'react'
import { interpolateDescriptor, resolveVariables } from '../variables'
import { useDashboardRuntime } from './context'

const EMPTY_DATA: WidgetData = {
  rows: [],
  aggregates: null,
  queries: {},
  loading: false,
  error: null
}

export function useWidgetData(request: WidgetDataRequest | undefined): {
  data: WidgetData
  variables: Readonly<Record<string, unknown>>
} {
  const { schemas, variables, suspended } = useDashboardRuntime()
  const intervalMs =
    typeof request?.refresh === 'object' && request.refresh !== null
      ? request.refresh.intervalMs
      : null
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!intervalMs) return
    const timer = setInterval(() => setTick((current) => current + 1), Math.max(1000, intervalMs))
    return () => clearInterval(timer)
  }, [intervalMs])

  const variablesKey = JSON.stringify(variables ?? null)
  const descriptor = useMemo(
    () =>
      request ? interpolateDescriptor(request.descriptor, variables, request.timeField) : null,
    // variablesKey is the canonical identity of the variables state; tick
    // re-resolves relative time ranges on interval refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request, variablesKey, tick]
  )
  const resolvedVariables = useMemo(
    () => resolveVariables(variables),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variablesKey, tick]
  )

  // A suspended runtime (culled/off-viewport host, 0273) passes no descriptor,
  // so the bridge subscription is torn down instead of left streaming.
  const result = useSavedView(suspended ? null : descriptor, schemas)

  const data = useMemo<WidgetData>(() => {
    if (!descriptor || suspended) return EMPTY_DATA

    return {
      rows: result.primary?.data ?? [],
      aggregates: result.primary?.aggregates ?? null,
      queries: Object.fromEntries(
        Object.entries(result.queries).map(([queryId, query]) => [queryId, query.data])
      ),
      loading: result.loading,
      error: result.error
    }
  }, [descriptor, suspended, result.primary, result.queries, result.loading, result.error])

  return { data, variables: resolvedVariables }
}
