/**
 * Privacy-preserving usage events for abuse economics and operator accounting.
 */

import type {
  AbuseDecision,
  AbuseReasonCode,
  AbuseResource,
  AbuseReviewQueue,
  AbuseSurface
} from './types'
import { hashBase64 } from '@xnetjs/crypto'
import { hashAbusePeerIdentifier } from './telemetry'

// ─── Types ─────────────────────────────────────────────────

export const ABUSE_USAGE_EVENT_KINDS = [
  'blocked',
  'throttled',
  'reviewed',
  'billable',
  'sponsored',
  'reciprocal'
] as const

export const ABUSE_USAGE_SETTLEMENTS = [
  'free',
  'paid',
  'sponsored',
  'reciprocal',
  'abuse-blocked'
] as const

export type AbuseUsageEventKind = (typeof ABUSE_USAGE_EVENT_KINDS)[number]
export type AbuseUsageSettlement = (typeof ABUSE_USAGE_SETTLEMENTS)[number]

export type AbuseUsageWorkType =
  | 'public-write'
  | 'remote-mutation'
  | 'crawl'
  | 'federation-query'
  | 'classification'
  | 'moderation-label'
  | 'appeal'
  | 'storage'

export type AbuseUsageEventInput = {
  kind: AbuseUsageEventKind
  surface: AbuseSurface
  workType: AbuseUsageWorkType
  actorDID?: string
  peerId?: string
  remotePeerId?: string
  labelerDID?: string
  hubId?: string
  workspaceId?: string
  domain?: string
  route?: string
  units?: number
  costMicroUsd?: number
  sponsoredMicroUsd?: number
  reciprocalCreditUnits?: number
  settlement?: AbuseUsageSettlement
  resource?: AbuseResource
  reviewQueue?: AbuseReviewQueue
  reasonCodes?: readonly AbuseReasonCode[]
  policyId?: string
  tags?: readonly string[]
  occurredAt?: number
  eventId?: string
  identityHashSalt?: string
  eventHashSalt?: string
}

export type AbuseUsageEvent = {
  id: string
  kind: AbuseUsageEventKind
  settlement: AbuseUsageSettlement
  surface: AbuseSurface
  workType: AbuseUsageWorkType
  actorHash: string
  remotePeerHash?: string
  labelerHash?: string
  hubId?: string
  workspaceId?: string
  domain?: string
  route?: string
  units: number
  costMicroUsd: number
  billableMicroUsd: number
  sponsoredMicroUsd: number
  reciprocalCreditUnits: number
  resource?: AbuseResource
  reviewQueue?: AbuseReviewQueue
  reasonCodes: readonly AbuseReasonCode[]
  policyId?: string
  tags: readonly string[]
  occurredAt: number
}

export type AbuseDecisionUsageInput = Omit<
  AbuseUsageEventInput,
  'kind' | 'reasonCodes' | 'resource' | 'reviewQueue' | 'settlement'
> & {
  decision: AbuseDecision
}

export type AbuseUsageEventSummary = {
  totalEvents: number
  kindCounts: Record<AbuseUsageEventKind, number>
  settlementCounts: Record<AbuseUsageSettlement, number>
  unitsByKind: Record<AbuseUsageEventKind, number>
  unitsBySettlement: Record<AbuseUsageSettlement, number>
  eventsBySurface: Partial<Record<AbuseSurface, number>>
  eventsByWorkType: Partial<Record<AbuseUsageWorkType, number>>
  costMicroUsd: number
  billableMicroUsd: number
  sponsoredMicroUsd: number
  reciprocalCreditUnits: number
  blockedUnits: number
  throttledUnits: number
  reviewedUnits: number
}

type StableJson =
  | null
  | boolean
  | number
  | string
  | readonly StableJson[]
  | { readonly [key: string]: StableJson }

// ─── Public API ────────────────────────────────────────────

const DEFAULT_USAGE_EVENT_HASH_SALT = 'xnet.abuse.usage.event.v1'

export function createAbuseUsageEvent(input: AbuseUsageEventInput): AbuseUsageEvent {
  const settlement = input.settlement ?? settlementForKind(input.kind)
  const units = nonNegative(input.units ?? 1)
  const costMicroUsd = nonNegative(input.costMicroUsd ?? 0)
  const sponsoredMicroUsd = sponsoredAmount(input.sponsoredMicroUsd, costMicroUsd, settlement)
  const reciprocalCreditUnits = reciprocalUnits(input.reciprocalCreditUnits, units, settlement)

  const eventWithoutId: Omit<AbuseUsageEvent, 'id'> = {
    kind: input.kind,
    settlement,
    surface: input.surface,
    workType: input.workType,
    actorHash: hashAbusePeerIdentifier(input.peerId ?? input.actorDID, input.identityHashSalt),
    remotePeerHash: input.remotePeerId
      ? hashAbusePeerIdentifier(input.remotePeerId, input.identityHashSalt)
      : undefined,
    labelerHash: input.labelerDID
      ? hashAbusePeerIdentifier(input.labelerDID, input.identityHashSalt)
      : undefined,
    hubId: normalizedString(input.hubId),
    workspaceId: normalizedString(input.workspaceId),
    domain: normalizeDomain(input.domain),
    route: normalizeRoute(input.route),
    units,
    costMicroUsd,
    billableMicroUsd: settlement === 'paid' ? Math.max(0, costMicroUsd - sponsoredMicroUsd) : 0,
    sponsoredMicroUsd,
    reciprocalCreditUnits,
    resource: input.resource,
    reviewQueue: input.reviewQueue,
    reasonCodes: dedupe(input.reasonCodes ?? []),
    policyId: normalizedString(input.policyId),
    tags: normalizeTags(input.tags ?? []),
    occurredAt: input.occurredAt ?? Date.now()
  }

  return {
    ...eventWithoutId,
    id: input.eventId ?? createAbuseUsageEventId(eventWithoutId, input.eventHashSalt)
  }
}

export function createAbuseUsageEventsFromDecision(
  input: AbuseDecisionUsageInput
): AbuseUsageEvent[] {
  const reasonCodes = input.decision.reasons.filter(
    (reason) => reason !== 'accepted'
  ) as readonly AbuseReasonCode[]
  const baseInput = {
    surface: input.surface,
    workType: input.workType,
    actorDID: input.actorDID,
    peerId: input.peerId,
    remotePeerId: input.remotePeerId,
    labelerDID: input.labelerDID,
    hubId: input.hubId,
    workspaceId: input.workspaceId,
    domain: input.domain,
    route: input.route,
    units: input.units,
    costMicroUsd: input.costMicroUsd,
    sponsoredMicroUsd: input.sponsoredMicroUsd,
    reciprocalCreditUnits: input.reciprocalCreditUnits,
    policyId: input.policyId,
    tags: input.tags,
    occurredAt: input.occurredAt,
    identityHashSalt: input.identityHashSalt,
    eventHashSalt: input.eventHashSalt,
    reasonCodes,
    resource: input.decision.resource
  } satisfies Omit<AbuseUsageEventInput, 'kind' | 'settlement'>

  const moderationEvents = [
    isBlockedDecision(input.decision)
      ? createAbuseUsageEvent({ ...baseInput, kind: 'blocked' })
      : null,
    input.decision.resource === 'throttle'
      ? createAbuseUsageEvent({ ...baseInput, kind: 'throttled' })
      : null,
    input.decision.review.required
      ? createAbuseUsageEvent({
          ...baseInput,
          kind: 'reviewed',
          reviewQueue: input.decision.review.queue
        })
      : null
  ].filter((event): event is AbuseUsageEvent => event !== null)

  const economicKind = economicKindForDecision(input)
  const economicEvent = economicKind
    ? [createAbuseUsageEvent({ ...baseInput, kind: economicKind })]
    : []

  return [...moderationEvents, ...economicEvent]
}

export function createAbuseUsageEventId(
  event: Omit<AbuseUsageEvent, 'id'>,
  salt = DEFAULT_USAGE_EVENT_HASH_SALT
): string {
  const payload = stableStringify(toStableEventPayload(event))
  const encoded = new TextEncoder().encode(`${salt}:${payload}`)
  return `usage_${hashBase64(encoded, 'blake3').slice(0, 24)}`
}

export function summarizeAbuseUsageEvents(
  events: readonly AbuseUsageEvent[]
): AbuseUsageEventSummary {
  return {
    totalEvents: events.length,
    kindCounts: countBy(
      ABUSE_USAGE_EVENT_KINDS,
      events.map((event) => event.kind)
    ),
    settlementCounts: countBy(
      ABUSE_USAGE_SETTLEMENTS,
      events.map((event) => event.settlement)
    ),
    unitsByKind: sumByKey(ABUSE_USAGE_EVENT_KINDS, events, (event) => event.kind, 'units'),
    unitsBySettlement: sumByKey(
      ABUSE_USAGE_SETTLEMENTS,
      events,
      (event) => event.settlement,
      'units'
    ),
    eventsBySurface: countEventValues(events.map((event) => event.surface)),
    eventsByWorkType: countEventValues(events.map((event) => event.workType)),
    costMicroUsd: sumEvents(events, 'costMicroUsd'),
    billableMicroUsd: sumEvents(events, 'billableMicroUsd'),
    sponsoredMicroUsd: sumEvents(events, 'sponsoredMicroUsd'),
    reciprocalCreditUnits: sumEvents(events, 'reciprocalCreditUnits'),
    blockedUnits: sumUnitsForKind(events, 'blocked'),
    throttledUnits: sumUnitsForKind(events, 'throttled'),
    reviewedUnits: sumUnitsForKind(events, 'reviewed')
  }
}

// ─── Helpers ───────────────────────────────────────────────

function settlementForKind(kind: AbuseUsageEventKind): AbuseUsageSettlement {
  if (kind === 'blocked') return 'abuse-blocked'
  if (kind === 'billable') return 'paid'
  if (kind === 'sponsored') return 'sponsored'
  if (kind === 'reciprocal') return 'reciprocal'
  return 'free'
}

function isBlockedDecision(decision: AbuseDecision): boolean {
  return decision.admission === 'reject' || decision.resource === 'block-peer'
}

function economicKindForDecision(input: AbuseDecisionUsageInput): AbuseUsageEventKind | null {
  if (input.decision.admission !== 'accept') return null
  if (nonNegative(input.reciprocalCreditUnits ?? 0) > 0) return 'reciprocal'
  if (nonNegative(input.sponsoredMicroUsd ?? 0) > 0) return 'sponsored'
  if (nonNegative(input.costMicroUsd ?? 0) > 0) return 'billable'
  return null
}

function sponsoredAmount(
  amount: number | undefined,
  costMicroUsd: number,
  settlement: AbuseUsageSettlement
): number {
  if (settlement === 'sponsored') return nonNegative(amount ?? costMicroUsd)
  return nonNegative(amount ?? 0)
}

function reciprocalUnits(
  units: number | undefined,
  fallbackUnits: number,
  settlement: AbuseUsageSettlement
): number {
  if (settlement === 'reciprocal') return nonNegative(units ?? fallbackUnits)
  return nonNegative(units ?? 0)
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function dedupe<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)]
}

function normalizedString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : undefined
}

function normalizeDomain(domain: string | undefined): string | undefined {
  return normalizedString(domain)
    ?.toLowerCase()
    .replace(/^www\./, '')
}

function normalizeRoute(route: string | undefined): string | undefined {
  return normalizedString(route)?.replace(/\s+/g, '-').toLowerCase()
}

function normalizeTags(tags: readonly string[]): readonly string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort()
}

function countBy<T extends string>(keys: readonly T[], values: readonly T[]): Record<T, number> {
  const initial = createNumberRecord(keys)
  return values.reduce(
    (counts, value) => ({
      ...counts,
      [value]: counts[value] + 1
    }),
    initial
  )
}

function countEventValues<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
  return values.reduce<Partial<Record<T, number>>>(
    (counts, value) => ({
      ...counts,
      [value]: (counts[value] ?? 0) + 1
    }),
    {}
  )
}

function createNumberRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return keys.reduce(
    (counts, key) => ({
      ...counts,
      [key]: 0
    }),
    {} as Record<T, number>
  )
}

function sumByKey<T extends string>(
  keys: readonly T[],
  events: readonly AbuseUsageEvent[],
  getKey: (event: AbuseUsageEvent) => T,
  valueKey: 'units' | 'costMicroUsd' | 'billableMicroUsd' | 'sponsoredMicroUsd'
): Record<T, number> {
  const initial = createNumberRecord(keys)
  return events.reduce(
    (totals, event) => ({
      ...totals,
      [getKey(event)]: totals[getKey(event)] + event[valueKey]
    }),
    initial
  )
}

function sumEvents(
  events: readonly AbuseUsageEvent[],
  key: 'costMicroUsd' | 'billableMicroUsd' | 'sponsoredMicroUsd' | 'reciprocalCreditUnits'
): number {
  return events.reduce((total, event) => total + event[key], 0)
}

function sumUnitsForKind(events: readonly AbuseUsageEvent[], kind: AbuseUsageEventKind): number {
  return events
    .filter((event) => event.kind === kind)
    .reduce((total, event) => total + event.units, 0)
}

function toStableEventPayload(event: Omit<AbuseUsageEvent, 'id'>): StableJson {
  return {
    kind: event.kind,
    settlement: event.settlement,
    surface: event.surface,
    workType: event.workType,
    actorHash: event.actorHash,
    remotePeerHash: event.remotePeerHash ?? null,
    labelerHash: event.labelerHash ?? null,
    hubId: event.hubId ?? null,
    workspaceId: event.workspaceId ?? null,
    domain: event.domain ?? null,
    route: event.route ?? null,
    units: event.units,
    costMicroUsd: event.costMicroUsd,
    billableMicroUsd: event.billableMicroUsd,
    sponsoredMicroUsd: event.sponsoredMicroUsd,
    reciprocalCreditUnits: event.reciprocalCreditUnits,
    resource: event.resource ?? null,
    reviewQueue: event.reviewQueue ?? null,
    reasonCodes: event.reasonCodes,
    policyId: event.policyId ?? null,
    tags: event.tags,
    occurredAt: event.occurredAt
  }
}

function stableStringify(value: StableJson): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}
