/**
 * Hook for the /analytics telemetry dashboard (exploration 0187).
 *
 * Reads pre-aggregated rollups from the connected hub's admin-gated
 * `GET /telemetry/summary`. The endpoint returns 403 for non-admin identities,
 * so the dashboard is only useful to a hub operator — the client just surfaces
 * whatever the hub authorizes.
 */

import { useXNet } from '@xnetjs/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { hubApiFetch, normalizeHubHttpUrl } from '../lib/share-links'

export type TelemetryKindCount = { kind: string; count: number }
export type TelemetryNameCount = { kind: string; name: string; count: number }
export type TelemetryBucketPoint = { bucket: number; count: number }

export type TelemetrySummary = {
  window: { sinceMs: number; untilMs: number }
  total: number
  kinds: TelemetryKindCount[]
  topNames: TelemetryNameCount[]
  timeseries: TelemetryBucketPoint[]
}

export type TelemetryAnalytics = {
  /** Whether the dashboard feature flag is enabled. */
  enabled: boolean
  /** Whether a hub connection + auth is available. */
  ready: boolean
  summary: TelemetrySummary | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/** The dashboard is opt-in to avoid bloating the default app. */
export const isTelemetryDashboardEnabled = (): boolean =>
  import.meta.env.VITE_TELEMETRY_DASHBOARD === '1'

const isSummary = (data: unknown): data is TelemetrySummary =>
  typeof data === 'object' && data !== null && 'kinds' in data && 'timeseries' in data

const toMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Failed to load telemetry'

/** Fetch + validate the admin telemetry summary. Throws if unauthenticated. */
export async function fetchTelemetrySummary(
  hubHttpUrl: string,
  getToken: () => Promise<string | null> | string | null,
  sinceMs: number
): Promise<TelemetrySummary | null> {
  const token = await getToken()
  if (!token) throw new Error('Not authenticated with the hub')
  const data = await hubApiFetch(hubHttpUrl, token, `/telemetry/summary?sinceMs=${sinceMs}`)
  return isSummary(data) ? data : null
}

export function useTelemetryAnalytics(windowMs = 7 * 24 * 60 * 60 * 1000): TelemetryAnalytics {
  const { hubUrl, getHubAuthToken } = useXNet()
  const enabled = isTelemetryDashboardEnabled()
  const hubHttpUrl = useMemo(() => (hubUrl ? normalizeHubHttpUrl(hubUrl) : null), [hubUrl])
  const ready = Boolean(enabled && hubHttpUrl && getHubAuthToken)

  const [summary, setSummary] = useState<TelemetrySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!ready || !hubHttpUrl || !getHubAuthToken) return
    let cancelled = false
    const apply = (fn: () => void) => {
      if (!cancelled) fn()
    }
    setLoading(true)
    setError(null)
    fetchTelemetrySummary(hubHttpUrl, getHubAuthToken, Date.now() - windowMs)
      .then((s) => apply(() => setSummary(s)))
      .catch((err) => apply(() => setError(toMessage(err))))
      .finally(() => apply(() => setLoading(false)))
    return () => {
      cancelled = true
    }
  }, [ready, hubHttpUrl, getHubAuthToken, windowMs, tick])

  return { enabled, ready, summary, loading, error, refresh }
}
