/**
 * Hook for the Telemetry Panel
 *
 * Rebuilds telemetry state from event bus history and subscribes to live events.
 * Provides security events, performance metrics, consent state, and peer scores.
 */

import { useState, useEffect } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import type {
  DevToolsEvent,
  TelemetrySecurityEvent,
  TelemetryPerformanceEvent,
  TelemetryCrashEvent,
  TelemetryUsageEvent,
  TelemetryConsentEvent,
  TelemetryPeerScoresEvent,
  PeerScoreSnapshot
} from '../../core/types'

// ─── Types ─────────────────────────────────────────────────

export type SubTab = 'security' | 'performance' | 'consent'

export interface SecurityEntry {
  id: string
  eventType: string
  severity: string
  actionTaken: string
  timestamp: number
}

export interface PerformanceEntry {
  id: string
  metric: string
  bucket: string
  timestamp: number
}

export interface CrashEntry {
  id: string
  errorType: string
  errorMessage: string
  component?: string
  timestamp: number
}

export interface UsageEntry {
  id: string
  metric: string
  bucket: string
  period: string
  timestamp: number
}

export interface ConsentState {
  tier: string
  previousTier: string | null
  lastChanged: number | null
}

export interface PerformanceGroup {
  metric: string
  buckets: Map<string, number>
  total: number
}

export interface NetworkHealth {
  score: number
  recentEventCount: number
  criticalCount: number
  highCount: number
}

// ─── Constants ─────────────────────────────────────────────

export type { PeerScoreSnapshot } from '../../core/types'

const TELEMETRY_EVENT_TYPES = new Set([
  'telemetry:security',
  'telemetry:performance',
  'telemetry:crash',
  'telemetry:usage',
  'telemetry:consent-change',
  'telemetry:peer-scores'
])

const MAX_ENTRIES = 500
const HEALTH_WINDOW_MS = 3_600_000 // 1 hour

// ─── Hook ──────────────────────────────────────────────────

export function useTelemetryPanel() {
  const { eventBus } = useDevTools()
  const [subTab, setSubTab] = useState<SubTab>('security')
  const [securityEvents, setSecurityEvents] = useState<SecurityEntry[]>([])
  const [performanceEvents, setPerformanceEvents] = useState<PerformanceEntry[]>([])
  const [crashEvents, setCrashEvents] = useState<CrashEntry[]>([])
  const [usageEvents, setUsageEvents] = useState<UsageEntry[]>([])
  const [peerScores, setPeerScores] = useState<PeerScoreSnapshot[]>([])
  const [consent, setConsent] = useState<ConsentState>({
    tier: 'off',
    previousTier: null,
    lastChanged: null
  })

  // Rebuild from existing events on mount
  useEffect(() => {
    const allEvents = eventBus.getEvents().filter((e) => TELEMETRY_EVENT_TYPES.has(e.type))
    const security: SecurityEntry[] = []
    const perf: PerformanceEntry[] = []
    const crashes: CrashEntry[] = []
    const usage: UsageEntry[] = []
    let latestPeerScores: PeerScoreSnapshot[] = []
    let consentState: ConsentState = { tier: 'off', previousTier: null, lastChanged: null }

    for (const event of allEvents) {
      switch (event.type) {
        case 'telemetry:security': {
          const e = event as TelemetrySecurityEvent
          security.push({
            id: e.id,
            eventType: e.eventType,
            severity: e.severity,
            actionTaken: e.actionTaken,
            timestamp: e.wallTime
          })
          break
        }
        case 'telemetry:performance': {
          const e = event as TelemetryPerformanceEvent
          perf.push({
            id: e.id,
            metric: e.metric,
            bucket: e.bucket,
            timestamp: e.wallTime
          })
          break
        }
        case 'telemetry:crash': {
          const e = event as TelemetryCrashEvent
          crashes.push({
            id: e.id,
            errorType: e.errorType,
            errorMessage: e.errorMessage,
            component: e.component,
            timestamp: e.wallTime
          })
          break
        }
        case 'telemetry:usage': {
          const e = event as TelemetryUsageEvent
          usage.push({
            id: e.id,
            metric: e.metric,
            bucket: e.bucket,
            period: e.period,
            timestamp: e.wallTime
          })
          break
        }
        case 'telemetry:consent-change': {
          const e = event as TelemetryConsentEvent
          consentState = {
            tier: e.tier,
            previousTier: e.previousTier,
            lastChanged: e.wallTime
          }
          break
        }
        case 'telemetry:peer-scores': {
          const e = event as TelemetryPeerScoresEvent
          latestPeerScores = e.scores
          break
        }
      }
    }

    setSecurityEvents(security.slice(-MAX_ENTRIES))
    setPerformanceEvents(perf.slice(-MAX_ENTRIES))
    setCrashEvents(crashes.slice(-MAX_ENTRIES))
    setUsageEvents(usage.slice(-MAX_ENTRIES))
    setPeerScores(latestPeerScores)
    setConsent(consentState)
  }, [eventBus])

  // Subscribe to live events
  useEffect(() => {
    const unsub = eventBus.subscribe((event: DevToolsEvent) => {
      if (!TELEMETRY_EVENT_TYPES.has(event.type)) return

      switch (event.type) {
        case 'telemetry:security': {
          const e = event as TelemetrySecurityEvent
          setSecurityEvents((prev) => {
            const next = [
              ...prev,
              {
                id: e.id,
                eventType: e.eventType,
                severity: e.severity,
                actionTaken: e.actionTaken,
                timestamp: e.wallTime
              }
            ]
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
          })
          break
        }
        case 'telemetry:performance': {
          const e = event as TelemetryPerformanceEvent
          setPerformanceEvents((prev) => {
            const next = [
              ...prev,
              { id: e.id, metric: e.metric, bucket: e.bucket, timestamp: e.wallTime }
            ]
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
          })
          break
        }
        case 'telemetry:crash': {
          const e = event as TelemetryCrashEvent
          setCrashEvents((prev) => {
            const next = [
              ...prev,
              {
                id: e.id,
                errorType: e.errorType,
                errorMessage: e.errorMessage,
                component: e.component,
                timestamp: e.wallTime
              }
            ]
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
          })
          break
        }
        case 'telemetry:usage': {
          const e = event as TelemetryUsageEvent
          setUsageEvents((prev) => {
            const next = [
              ...prev,
              {
                id: e.id,
                metric: e.metric,
                bucket: e.bucket,
                period: e.period,
                timestamp: e.wallTime
              }
            ]
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
          })
          break
        }
        case 'telemetry:consent-change': {
          const e = event as TelemetryConsentEvent
          setConsent({
            tier: e.tier,
            previousTier: e.previousTier,
            lastChanged: e.wallTime
          })
          break
        }
        case 'telemetry:peer-scores': {
          const e = event as TelemetryPeerScoresEvent
          setPeerScores(e.scores)
          break
        }
      }
    })
    return unsub
  }, [eventBus])

  // Computed: network health
  const networkHealth = computeNetworkHealth(securityEvents)

  // Computed: performance groups
  const performanceGroups = computePerformanceGroups(performanceEvents)

  return {
    subTab,
    setSubTab,
    securityEvents: securityEvents.slice().reverse(), // newest first
    performanceEvents,
    crashEvents: crashEvents.slice().reverse(),
    usageEvents,
    peerScores,
    consent,
    networkHealth,
    performanceGroups
  }
}

// ─── Helpers ───────────────────────────────────────────────

function computeNetworkHealth(events: SecurityEntry[]): NetworkHealth {
  const now = Date.now()
  const recentEvents = events.filter((e) => now - e.timestamp < HEALTH_WINDOW_MS)
  const criticalCount = recentEvents.filter((e) => e.severity === 'critical').length
  const highCount = recentEvents.filter((e) => e.severity === 'high').length
  const score = Math.max(0, 100 - criticalCount * 30 - highCount * 10)

  return { score, recentEventCount: recentEvents.length, criticalCount, highCount }
}

function computePerformanceGroups(events: PerformanceEntry[]): PerformanceGroup[] {
  const groups = new Map<string, { buckets: Map<string, number>; total: number }>()

  for (const entry of events) {
    let group = groups.get(entry.metric)
    if (!group) {
      group = { buckets: new Map(), total: 0 }
      groups.set(entry.metric, group)
    }
    group.buckets.set(entry.bucket, (group.buckets.get(entry.bucket) ?? 0) + 1)
    group.total++
  }

  return Array.from(groups.entries()).map(([metric, data]) => ({
    metric,
    buckets: data.buckets,
    total: data.total
  }))
}
