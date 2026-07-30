/**
 * Per-report escalation to the vendor (exploration 0341 P4) — the FIRST of the
 * three escalation switches, and the only one that ships payload content.
 *
 * Lane-2 semantics throughout: the operator sees the EXACT payload the hub
 * will forward (byte-for-byte — the caller renders `composeEscalationPayload`'s
 * return verbatim in the preview) and the explicit send is the consent. The
 * send goes through the hub's existing `diagnostics-sharing` forwarder
 * (0210) — authed, 8 KB-bounded, salted-DID — so nothing here talks to the
 * vendor directly; if the deployment hasn't configured sharing, the route
 * simply does not exist and escalation is impossible by construction.
 *
 * Pure over its two ports (workspace `store`, hub `request`).
 */

import type { NodeStore } from '@xnetjs/data'
import type { IngestRequest } from './debug-report-drain'

/** The allowlisted slice of a debug-report node that may leave the deployment. */
export interface EscalationPayload {
  lane: 'user'
  errorName: string
  message: string
  stack?: string
  release?: string
  surface: string
  bootStage?: string
  uaFamily?: string
  userDescription?: string
  breadcrumbs?: string[]
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined

/**
 * Compose the forward payload from a `debug-report` node's properties —
 * allowlisted fields only, exactly what the preview shows and the hub sends.
 */
export function composeEscalationPayload(
  properties: Record<string, unknown>
): EscalationPayload | null {
  const errorName = str(properties.errorName)
  if (!errorName) return null
  return {
    lane: 'user',
    errorName,
    message: str(properties.message) ?? errorName,
    stack: str(properties.stack),
    release: str(properties.release),
    surface: str(properties.surface) ?? 'unknown',
    bootStage: str(properties.bootStage),
    uaFamily: str(properties.uaFamily),
    userDescription: str(properties.userDescription),
    breadcrumbs: Array.isArray(properties.breadcrumbs)
      ? properties.breadcrumbs.filter((line): line is string => typeof line === 'string')
      : undefined
  }
}

export interface EscalationResult {
  /** The vendor-side quotable handle ("XR-…"), stamped onto the node. */
  shortId: string
}

/**
 * Send a previously-previewed payload through the hub forwarder and stamp the
 * node with the returned XR-… handle. Throws with a readable message on any
 * failure (the dialog surfaces it); never sends anything but `payload`.
 */
export async function escalateDebugReport(
  store: NodeStore,
  request: IngestRequest,
  nodeId: string,
  payload: EscalationPayload
): Promise<EscalationResult> {
  const response = (await request('/diagnostics/report', {
    method: 'POST',
    body: payload
  })) as { shortId?: unknown; error?: unknown } | null
  const shortId = typeof response?.shortId === 'string' ? response.shortId : null
  if (!shortId) {
    throw new Error(
      typeof response?.error === 'string'
        ? `Escalation failed: ${response.error}`
        : 'Escalation failed: the hub did not return a report handle'
    )
  }
  await store.update(nodeId, { properties: { escalatedId: shortId } })
  return { shortId }
}
