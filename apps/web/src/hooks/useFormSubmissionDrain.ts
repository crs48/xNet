/**
 * Form submission drain agent (exploration 0278) — thin React host for the
 * drain core in `../lib/form-drain`: runs it on connect and every minute,
 * and exposes pending/rejected totals for the status-bar chip.
 */

import { useNodeStore, useXNet } from '@xnetjs/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { drainFormInboxes, type DrainResult } from '../lib/form-drain'
import { hubApiFetch, normalizeHubHttpUrl } from '../lib/share-links'

const DRAIN_INTERVAL_MS = 60_000

export function useFormSubmissionDrain(): DrainResult {
  const { hubUrl, getHubAuthToken } = useXNet()
  const { store, isReady } = useNodeStore()
  const [totals, setTotals] = useState<DrainResult>({ pendingTotal: 0, rejectedTotal: 0 })
  const drainingRef = useRef(false)

  const ready = Boolean(hubUrl && getHubAuthToken && store && isReady)

  const drain = useCallback(async (): Promise<void> => {
    if (drainingRef.current || !ready) return
    drainingRef.current = true
    try {
      const hubHttpUrl = normalizeHubHttpUrl(hubUrl!)
      const token = await getHubAuthToken!()
      setTotals(
        await drainFormInboxes(store!, (path, init) => hubApiFetch(hubHttpUrl, token, path, init))
      )
    } catch {
      // Offline or hub unreachable — the inbox is durable; try again next tick.
    } finally {
      drainingRef.current = false
    }
  }, [ready, hubUrl, getHubAuthToken, store])

  useEffect(() => {
    if (!ready) return
    void drain()
    const timer = setInterval(() => {
      void drain()
    }, DRAIN_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ready, drain])

  return totals
}
