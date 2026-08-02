/**
 * xNet Cloud — the tier-2 audit publisher (exploration 0433, ADR-31).
 *
 * Republishes each tier-1 audit entry to the ops hub as a node authored by the
 * operator's `did:key`, so the hub's signed, hash-chained change log becomes the
 * verifiable audit trail — readable back through the hub's existing
 * `GET /audit/authors/:did/changes` (`packages/hub/src/routes/audit.ts`).
 *
 * Two properties this must have, and one it must not:
 *
 *  - It **must not** be on the critical path. A publish failure queues; the action
 *    already happened and was already recorded in tier 1.
 *  - It **must** fail loudly rather than silently succeed. A non-2xx is thrown so
 *    the entry stays queued and the depth metric rises; swallowing it would make
 *    an unreachable hub indistinguishable from a healthy one.
 *  - It carries **no tenant content** — only operator, action, opaque tenant id,
 *    reason and outcome, matching the tier-1 schema.
 */

import type { AuditEntry, AuditPublisher } from './audit'

export interface OpsHubPublisherConfig {
  /** Base URL of the ops hub (its own GCP project, outside the fleet provisioner). */
  hubUrl: string
  /** Bearer token authorising the control plane to write as the ops workspace. */
  token: string
  /** Space the operator log lives in. */
  spaceId?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** The node an audit entry becomes on the ops hub. */
export interface AuditNodePayload {
  nodeType: 'ops-audit-entry'
  spaceId: string
  properties: {
    entryId: string
    atMs: number
    operator: string
    operatorDid?: string
    action: string
    tenantId: string
    reason?: string
    outcome: string
    parentId?: string
  }
}

export const DEFAULT_OPS_SPACE = 'ops-audit'

/** Map a tier-1 entry to its tier-2 node. Content-free by construction. */
export function toAuditNode(entry: AuditEntry, spaceId = DEFAULT_OPS_SPACE): AuditNodePayload {
  return {
    nodeType: 'ops-audit-entry',
    spaceId,
    properties: {
      entryId: entry.entryId,
      atMs: entry.atMs,
      operator: entry.operator,
      ...(entry.operatorDid ? { operatorDid: entry.operatorDid } : {}),
      action: entry.action,
      tenantId: entry.tenantId,
      ...(entry.reason ? { reason: entry.reason } : {}),
      outcome: entry.outcome,
      ...(entry.parentId ? { parentId: entry.parentId } : {})
    }
  }
}

/** Publishes audit entries to a real ops hub over HTTP. */
export function opsHubPublisher(config: OpsHubPublisherConfig): AuditPublisher {
  const fetchImpl = config.fetchImpl ?? fetch
  const timeoutMs = config.timeoutMs ?? 10_000
  const base = config.hubUrl.replace(/\/$/, '')
  return {
    async publish(entry: AuditEntry): Promise<void> {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${base}/nodes`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.token}`
          },
          body: JSON.stringify(toAuditNode(entry, config.spaceId ?? DEFAULT_OPS_SPACE)),
          signal: ctrl.signal
        })
        // Throw, don't swallow: the caller queues on rejection, and a queue that
        // never drains is the visible signal that tier 2 has stopped.
        if (!res.ok) throw new Error(`ops hub rejected audit entry: ${res.status}`)
      } finally {
        clearTimeout(timer)
      }
    }
  }
}

/**
 * Build a publisher from the environment, or `null` when the ops hub is not
 * configured.
 *
 * `null` is meaningful: the {@link AuditLog} then queues every entry and reports a
 * rising pending count, which reads as "tier 2 is not wired" rather than as
 * "everything is published". A control plane that silently ran with no verifiable
 * audit trail is the state this whole design exists to end.
 */
export function opsHubPublisherFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AuditPublisher | null {
  const hubUrl = env.XNET_OPS_HUB_URL
  const token = env.XNET_OPS_HUB_TOKEN
  if (!hubUrl || !token) return null
  return opsHubPublisher({
    hubUrl,
    token,
    ...(env.XNET_OPS_HUB_SPACE ? { spaceId: env.XNET_OPS_HUB_SPACE } : {})
  })
}
