/**
 * Hook for the Abuse panel.
 *
 * Rebuilds abuse-moderation state from DevTools event history and subscribes to
 * live policy decision, label, queue, and peer score events.
 */

import type {
  AbuseLabelEvent,
  AbusePeerScoresEvent,
  AbusePolicyDecisionEvent,
  AbuseQueueSnapshot,
  AbuseQueueStateEvent,
  AbuseUsageSummaryEvent,
  AbuseUsageSummarySnapshot,
  DevToolsEvent,
  PeerScoreSnapshot,
  TelemetryPeerScoresEvent
} from '../../core/types'
import { useEffect, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'

// ─── Types ─────────────────────────────────────────────────

export type AbuseSubTab = 'decisions' | 'peers' | 'labels' | 'queues' | 'usage'

export type PolicyDecisionEntry = {
  id: string
  timestamp: number
  surface: string
  subjectId?: string
  actorDid?: string
  peerId?: string
  peerScore?: number
  scope?: string
  policyId?: string
  admission: string
  visibility: string
  reach: string
  resource: string
  reasons: string[]
  evidenceRefs: string[]
  includeInCounters: boolean
  includeInSearch: boolean
  reviewQueue?: string
  reviewPriority?: number
  labelsToEmit: AbusePolicyDecisionEvent['labelsToEmit']
}

export type LabelEntry = {
  id: string
  timestamp: number
  subjectId: string
  value: string
  action: AbuseLabelEvent['action']
  confidence: number
  sourceDid?: string
  sourceWeight?: number
  surface?: string
  reason?: string
  evidenceRefs: string[]
  expiresAt?: number
}

export type AbusePanelState = {
  decisions: PolicyDecisionEntry[]
  labels: LabelEntry[]
  peerScores: PeerScoreSnapshot[]
  queues: AbuseQueueSnapshot[]
  usageSummaries: UsageSummaryEntry[]
}

export type UsageSummaryEntry = {
  id: string
  timestamp: number
  period?: string
  hubId?: string
  workspaceId?: string
  summary: AbuseUsageSummarySnapshot
}

export type AbusePanelSummary = {
  totalDecisions: number
  accepted: number
  rejected: number
  quarantined: number
  warnedOrHidden: number
  counterExcluded: number
  searchExcluded: number
  labels: number
  pendingQueueItems: number
  riskyPeers: number
  usageSnapshots: number
  automationSavedUnits: number
  automationSavedCostMicroUsd: number
  appealLoadRatio: number
  reviewLoadRatio: number
}

const ABUSE_EVENT_TYPES = new Set<DevToolsEvent['type']>([
  'abuse:policy-decision',
  'abuse:label',
  'abuse:queue-state',
  'abuse:peer-scores',
  'abuse:usage-summary',
  'telemetry:peer-scores'
])

const MAX_DECISIONS = 500
const MAX_LABELS = 500
const MAX_USAGE_SUMMARIES = 100

const EMPTY_STATE: AbusePanelState = {
  decisions: [],
  labels: [],
  peerScores: [],
  queues: [],
  usageSummaries: []
}

// ─── Hook ──────────────────────────────────────────────────

export function useAbusePanel() {
  const { eventBus } = useDevTools()
  const [subTab, setSubTab] = useState<AbuseSubTab>('decisions')
  const [state, setState] = useState<AbusePanelState>(() =>
    rebuildAbusePanelState(eventBus.getEvents())
  )

  useEffect(() => {
    setState(rebuildAbusePanelState(eventBus.getEvents()))
  }, [eventBus])

  useEffect(() => {
    return eventBus.subscribe((event) => {
      if (!isAbusePanelEvent(event)) return
      setState((previous) => reduceAbusePanelState(previous, event))
    })
  }, [eventBus])

  return {
    subTab,
    setSubTab,
    decisions: [...state.decisions].reverse(),
    labels: [...state.labels].reverse(),
    peerScores: state.peerScores,
    queues: state.queues,
    usageSummaries: [...state.usageSummaries].reverse(),
    summary: summarizeAbusePanelState(state)
  }
}

// ─── State Reducers ────────────────────────────────────────

export function rebuildAbusePanelState(events: readonly DevToolsEvent[]): AbusePanelState {
  return events
    .filter(isAbusePanelEvent)
    .reduce((state, event) => reduceAbusePanelState(state, event), EMPTY_STATE)
}

export function reduceAbusePanelState(
  state: AbusePanelState,
  event: AbusePanelEvent
): AbusePanelState {
  switch (event.type) {
    case 'abuse:policy-decision':
      return {
        ...state,
        decisions: trim(
          [
            ...state.decisions,
            {
              id: event.id,
              timestamp: event.wallTime,
              surface: event.surface,
              subjectId: event.subjectId,
              actorDid: event.actorDid,
              peerId: event.peerId,
              peerScore: event.peerScore,
              scope: event.scope,
              policyId: event.policyId,
              admission: event.admission,
              visibility: event.visibility,
              reach: event.reach,
              resource: event.resource,
              reasons: [...event.reasons],
              evidenceRefs: [...event.evidenceRefs],
              includeInCounters: event.includeInCounters,
              includeInSearch: event.includeInSearch,
              reviewQueue: event.reviewQueue,
              reviewPriority: event.reviewPriority,
              labelsToEmit: event.labelsToEmit.map((label) => ({
                ...label,
                evidenceRefs: [...label.evidenceRefs]
              }))
            }
          ],
          MAX_DECISIONS
        )
      }
    case 'abuse:label':
      return {
        ...state,
        labels: trim(
          [
            ...state.labels,
            {
              id: event.id,
              timestamp: event.wallTime,
              subjectId: event.subjectId,
              value: event.value,
              action: event.action,
              confidence: event.confidence,
              sourceDid: event.sourceDid,
              sourceWeight: event.sourceWeight,
              surface: event.surface,
              reason: event.reason,
              evidenceRefs: [...event.evidenceRefs],
              expiresAt: event.expiresAt
            }
          ],
          MAX_LABELS
        )
      }
    case 'abuse:queue-state':
      return {
        ...state,
        queues: event.queues.map((queue) => ({
          ...queue,
          sampleSubjectIds: queue.sampleSubjectIds ? [...queue.sampleSubjectIds] : undefined
        }))
      }
    case 'abuse:peer-scores':
    case 'telemetry:peer-scores':
      return {
        ...state,
        peerScores: event.scores.map((score) => ({ ...score }))
      }
    case 'abuse:usage-summary':
      return {
        ...state,
        usageSummaries: trim(
          [
            ...state.usageSummaries,
            {
              id: event.id,
              timestamp: event.wallTime,
              period: event.period,
              hubId: event.hubId,
              workspaceId: event.workspaceId,
              summary: cloneUsageSummary(event.summary)
            }
          ],
          MAX_USAGE_SUMMARIES
        )
      }
  }
}

export function summarizeAbusePanelState(state: AbusePanelState): AbusePanelSummary {
  const latestUsage = state.usageSummaries.at(-1)?.summary

  return {
    totalDecisions: state.decisions.length,
    accepted: state.decisions.filter((decision) => decision.admission === 'accept').length,
    rejected: state.decisions.filter((decision) => decision.admission === 'reject').length,
    quarantined: state.decisions.filter((decision) => decision.admission === 'quarantine').length,
    warnedOrHidden: state.decisions.filter((decision) =>
      ['warn', 'blur', 'hide'].includes(decision.visibility)
    ).length,
    counterExcluded: state.decisions.filter((decision) => !decision.includeInCounters).length,
    searchExcluded: state.decisions.filter((decision) => !decision.includeInSearch).length,
    labels: state.labels.length,
    pendingQueueItems: state.queues.reduce((total, queue) => total + queue.pending, 0),
    riskyPeers: state.peerScores.filter((peer) => peer.score <= 30).length,
    usageSnapshots: state.usageSummaries.length,
    automationSavedUnits: latestUsage?.automationSavedUnits ?? 0,
    automationSavedCostMicroUsd: latestUsage?.automationSavedCostMicroUsd ?? 0,
    appealLoadRatio: latestUsage?.appealLoadRatio ?? 0,
    reviewLoadRatio: latestUsage?.reviewLoadRatio ?? 0
  }
}

export function isAbusePanelEvent(event: DevToolsEvent): event is AbusePanelEvent {
  return ABUSE_EVENT_TYPES.has(event.type)
}

type AbusePanelEvent =
  | AbusePolicyDecisionEvent
  | AbuseLabelEvent
  | AbuseQueueStateEvent
  | AbusePeerScoresEvent
  | AbuseUsageSummaryEvent
  | TelemetryPeerScoresEvent

function trim<T>(items: T[], maxLength: number): T[] {
  return items.length > maxLength ? items.slice(-maxLength) : items
}

function cloneUsageSummary(summary: AbuseUsageSummarySnapshot): AbuseUsageSummarySnapshot {
  return {
    ...summary,
    kindCounts: summary.kindCounts ? { ...summary.kindCounts } : undefined,
    settlementCounts: summary.settlementCounts ? { ...summary.settlementCounts } : undefined,
    unitsByKind: summary.unitsByKind ? { ...summary.unitsByKind } : undefined,
    unitsBySettlement: summary.unitsBySettlement ? { ...summary.unitsBySettlement } : undefined,
    eventsBySurface: summary.eventsBySurface ? { ...summary.eventsBySurface } : undefined,
    eventsByWorkType: summary.eventsByWorkType ? { ...summary.eventsByWorkType } : undefined
  }
}
