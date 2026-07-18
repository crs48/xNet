/**
 * Operator hook for the hub diagnostics inbox (exploration 0341 P2) — the thin
 * React host over `../lib/diagnostics-console`: reads the content-free summary
 * from the connected hub (admin-gated, so non-operators just see nothing) and
 * exposes the manual "Import reports" drain into the Diagnostics Space.
 *
 * Mirrors `useFormSubmissionDrain`'s ports (useNodeStore + hubApiFetch) but is
 * user-triggered rather than a background agent: draining materializes nodes
 * in the operator's workspace, which should be a deliberate act.
 */

import type { DiagnosticsSummary } from '@xnetjs/telemetry/inbox'
import { useIdentity, useNodeStore, useXNet } from '@xnetjs/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { importDebugReports } from '../lib/diagnostics-console'
import { hubApiFetch, normalizeHubHttpUrl } from '../lib/share-links'

export interface DiagnosticsInbox {
  /** Whether a hub + auth + store are available at all. */
  ready: boolean
  /** null until loaded; stays null for non-admin identities (403). */
  summary: DiagnosticsSummary | null
  loading: boolean
  /** Result of the last import, or null before the first. */
  imported: number | null
  importing: boolean
  error: string | null
  refresh: () => void
  importReports: () => Promise<void>
}

const isSummary = (data: unknown): data is DiagnosticsSummary =>
  typeof data === 'object' && data !== null && 'pending' in data && 'topIssues' in data

export function useDiagnosticsInbox(): DiagnosticsInbox {
  const { hubUrl, getHubAuthToken } = useXNet()
  const { did } = useIdentity()
  const { store, isReady } = useNodeStore()
  const ready = Boolean(hubUrl && getHubAuthToken && store && isReady)

  const [summary, setSummary] = useState<DiagnosticsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [imported, setImported] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const busyRef = useRef(false)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!ready || !hubUrl || !getHubAuthToken) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const token = await getHubAuthToken()
        if (!token) return
        const data = await hubApiFetch(normalizeHubHttpUrl(hubUrl), token, '/diagnostics/summary')
        if (!cancelled && isSummary(data)) setSummary(data)
      } catch {
        // Non-admin (403), older hub (404), or offline — the section simply
        // shows no counts; this is a quiet operator affordance, not an alert.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, hubUrl, getHubAuthToken, tick])

  const importReports = useCallback(async (): Promise<void> => {
    if (busyRef.current || !ready || !hubUrl || !getHubAuthToken || !store) return
    busyRef.current = true
    setImporting(true)
    setError(null)
    try {
      const token = await getHubAuthToken()
      if (!token) throw new Error('Not authenticated with the hub')
      const hubHttpUrl = normalizeHubHttpUrl(hubUrl)
      const result = await importDebugReports(
        store,
        (path, init) => hubApiFetch(hubHttpUrl, token, path, init),
        did ?? null
      )
      setImported(result.drained)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      busyRef.current = false
      setImporting(false)
    }
  }, [ready, hubUrl, getHubAuthToken, store, did, refresh])

  return { ready, summary, loading, imported, importing, error, refresh, importReports }
}
