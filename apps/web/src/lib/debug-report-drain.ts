/**
 * Debug-report drain core (exploration 0315 P1/P3).
 *
 * The materialization half of the diagnostics trust model: the cloud only
 * quarantines scrubbed reports; an operator's signing client pulls pending
 * reports and writes each as a `debug-report` node under this identity's DID,
 * then acks it off the quarantine. Node ids derive from the report id (itself
 * the fingerprint for the automatic lane), so a drain raced by another device
 * or retried after a crash LWW-upserts instead of duplicating — a recurring
 * crash updates one node's `occurrences`/`lastSeen` rather than flooding.
 *
 * The server never writes workspace nodes (the 0278 form-inbox invariant): all
 * writes happen here, signed, in the operator's own workspace. `status` is
 * preserved across re-drains so an operator's triage state (acked/fixed/…)
 * isn't clobbered by a later occurrence.
 *
 * Pure over its two ports (ingest `request`, workspace `store`) so it is
 * directly testable without React.
 */

import { DebugReportSchema, type NodeStore } from '@xnetjs/data'

export type IngestRequest = (
  path: string,
  init?: { method?: string; body?: unknown }
) => Promise<unknown>

/** One quarantined report as returned by `/internal/diagnostics/reports`. */
export interface QuarantinedReport {
  id: string
  lane: 'auto' | 'user' | 'hub'
  fingerprint: string
  errorName: string
  message?: string
  stack?: string
  release?: string
  surface: string
  bootStage?: string
  uaFamily?: string
  userDescription?: string
  breadcrumbs?: string[]
  didHash?: string
  occurrences: number
  firstSeenMs: number
  lastSeenMs: number
}

export interface DrainReportsResult {
  drained: number
}

/** Where the quarantine lives, relative to the ingest `request` base. */
export interface DrainPaths {
  list: string
  ack: string
}

/** The vendor cloud's internal-secret drain surface (0315). */
export const CLOUD_DRAIN_PATHS: DrainPaths = {
  list: '/internal/diagnostics/reports',
  ack: '/internal/diagnostics/ack'
}

/** The deployment's own hub inbox (0341) — admin-UCAN-gated. */
export const HUB_DRAIN_PATHS: DrainPaths = {
  list: '/diagnostics/pending',
  ack: '/diagnostics/ack'
}

/** Deterministic node id from the quarantine report id (LWW upsert key). */
export const debugReportNodeId = (reportId: string): string => `debugreport_${reportId}`

/**
 * Map a quarantined report to `debug-report` node properties. `space` scopes it
 * to the operator's triage workspace; `status` is only set on first insert
 * (the caller decides whether the node already exists).
 */
function reportProperties(
  report: QuarantinedReport,
  space: string,
  existing: boolean
): Record<string, unknown> {
  return {
    space,
    lane: report.lane,
    fingerprint: report.fingerprint,
    errorName: report.errorName,
    message: report.message,
    stack: report.stack,
    release: report.release,
    surface: report.surface,
    bootStage: report.bootStage,
    uaFamily: report.uaFamily,
    userDescription: report.userDescription,
    breadcrumbs: report.breadcrumbs,
    didHash: report.didHash,
    occurrences: report.occurrences,
    firstSeen: report.firstSeenMs,
    lastSeen: report.lastSeenMs,
    // New reports start in triage; a re-drain must not reset an operator's
    // hand-set status, so status is left to the existing node when present.
    ...(existing ? {} : { status: 'new' })
  }
}

/**
 * Pull every pending report and upsert it into the operator's `space`, then ack
 * the drained ids off the quarantine. Returns how many nodes were written.
 */
export async function drainDebugReports(
  store: NodeStore,
  request: IngestRequest,
  space: string,
  paths: DrainPaths = CLOUD_DRAIN_PATHS
): Promise<DrainReportsResult> {
  const { reports = [] } = (await request(paths.list)) as {
    reports?: QuarantinedReport[]
  }
  if (reports.length === 0) return { drained: 0 }

  const drainedIds: string[] = []
  for (const report of reports) {
    const nodeId = debugReportNodeId(report.id)
    const existing = await store.get(nodeId)
    await store.create({
      id: nodeId,
      schemaId: DebugReportSchema.schema['@id'],
      properties: reportProperties(report, space, existing !== null)
    })
    drainedIds.push(report.id)
  }

  if (drainedIds.length > 0) {
    await request(paths.ack, {
      method: 'POST',
      body: { ids: drainedIds }
    })
  }
  return { drained: drainedIds.length }
}
