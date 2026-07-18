/**
 * First-party debug-report ingest (exploration 0315 P1; core extracted to
 * `@xnetjs/telemetry/inbox` by exploration 0341).
 *
 * The missing socket: the hub's opt-in diagnostics-sharing feature (0210 P4)
 * has always forwarded scrubbed reports to `${upstream}/diagnostics` — a route
 * that never existed. This module adds it, plus the public ingest the web/
 * Electron clients use for consent-gated crash pings (lane `auto`) and
 * user-triggered debug reports (lane `user`).
 *
 * Reports land in a durable QUARANTINE, not the operator's workspace: the
 * server never writes workspace nodes (the 0278 form-inbox invariant). The
 * operator's signing client drains pending reports into `debug-report` nodes
 * with deterministic ids (LWW upsert) and acks them here.
 *
 * The normalizer, fingerprint, dedupe/upsert step, store contract, and rate
 * limiter live in `@xnetjs/telemetry/inbox` (MIT core) so every hub runs the
 * same quarantine first-party (0341); this file keeps only what is genuinely
 * the vendor cloud's: the HTTP shell, the hub-lane socket, and the webhook
 * alerter. Types and helpers are re-exported for existing importers.
 */

import type { Logger } from './logger'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { validateExternalUrl } from '@xnetjs/core'
import {
  clientIpOf,
  createSlidingWindowLimiter,
  ingestReport,
  isRecord,
  MAX_REPORT_BYTES,
  parseIncomingReport,
  shortId,
  type DebugReportRecord,
  type DebugReportStore,
  type RateWindow
} from '@xnetjs/telemetry/inbox'
import { Hono } from 'hono'

export {
  DRAINED_KEEP_MS,
  fingerprintOf,
  MAX_REPORT_BYTES,
  MemoryDebugReportStore,
  parseIncomingReport,
  shortId
} from '@xnetjs/telemetry/inbox'
export type {
  DebugReportLane,
  DebugReportRecord,
  DebugReportStatus,
  DebugReportStore,
  IncomingReport
} from '@xnetjs/telemetry/inbox'

// ─── Per-tenant diagnostics secrets (exploration 0341 P3) ────────────────────

const hmacHex = (masterSecret: string, message: string): string =>
  createHmac('sha256', masterSecret).update(message).digest('hex')

/**
 * The diagnostics secret a managed hub is provisioned with. Self-identifying
 * (`<tenantId>.<hmac>`) so the escalation lane can attribute a report to its
 * deployment in O(1) — verified against the control plane's master secret,
 * never trusted from the payload. The same value authenticates the dashboard's
 * summary read against the tenant hub: one secret, one trust relationship,
 * both directions.
 */
export function diagnosticsSecretFor(masterSecret: string, tenantId: string): string {
  return `${tenantId}.${hmacHex(masterSecret, `diag:${tenantId}`).slice(0, 32)}`
}

/** Verify a presented secret; returns its tenantId, or null when invalid. */
export function tenantFromDiagnosticsSecret(
  masterSecret: string,
  presented: string | undefined
): string | null {
  if (!presented) return null
  const dot = presented.lastIndexOf('.')
  if (dot <= 0) return null
  const tenantId = presented.slice(0, dot)
  const expected = diagnosticsSecretFor(masterSecret, tenantId)
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b) ? tenantId : null
}

// ─── First-seen alert webhook (exploration 0315 P4) ─────────────────────────

/**
 * Build an `onFirstSeen` handler that POSTs a compact, content-free alert to a
 * webhook the first time a fingerprint appears. The URL is SSRF-guarded (0213)
 * so a misconfigured operator can't point it at cloud metadata or an internal
 * host, and delivery is fire-and-forget so alerting never blocks or breaks
 * ingest. Returns undefined (no alerter) if the URL is missing or unsafe.
 */
export function createWebhookAlerter(
  webhookUrl: string | undefined,
  log: Logger,
  fetchImpl: typeof fetch = fetch
): ((record: DebugReportRecord) => void) | undefined {
  if (!webhookUrl) return undefined
  const check = validateExternalUrl(webhookUrl)
  if (!check.valid) {
    log.warn('diagnostics-alert-url-rejected', { error: check.error })
    return undefined
  }
  return (record: DebugReportRecord): void => {
    // Content-free: only the grouping identity + coarse context, never the
    // scrubbed message/stack/breadcrumbs.
    void fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'debug_report.first_seen',
        shortId: shortId(record.id),
        fingerprint: record.fingerprint,
        errorName: record.errorName,
        surface: record.surface,
        release: record.release,
        lane: record.lane
      })
    }).catch((err) => {
      log.warn('diagnostics-alert-failed', {
        error: err instanceof Error ? err.message : String(err)
      })
    })
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export interface DiagnosticsRoutesDeps {
  store: DebugReportStore
  log: Logger
  /** Shared secret for the hub lane + the internal drain surface. */
  internalSecret?: string
  /** Fired the first time a fingerprint is seen (the 0315 P4 alert seam). */
  onFirstSeen?: (record: DebugReportRecord) => void
  nowMs?: () => number
  /** Public-ingest rate window per client IP (default 10/min). */
  ingestRateLimit?: RateWindow
}

export function createDiagnosticsRoutes(deps: DiagnosticsRoutesDeps): Hono {
  const app = new Hono()
  const now = deps.nowMs ?? Date.now
  const limited = createSlidingWindowLimiter(
    deps.ingestRateLimit ?? { maxAttempts: 10, windowMs: 60_000 },
    now
  )
  const requireInternal = (c: { req: { header: (k: string) => string | undefined } }): boolean =>
    Boolean(deps.internalSecret) && c.req.header('x-internal-secret') === deps.internalSecret
  /**
   * The hub lane admits the master secret (our own hubs, pre-0341 configs) or
   * a tenant-derived secret — which also attributes the report (0341 P3).
   */
  const hubLaneAuth = (c: {
    req: { header: (k: string) => string | undefined }
  }): { ok: boolean; tenantId?: string } => {
    if (requireInternal(c)) return { ok: true }
    if (!deps.internalSecret) return { ok: false }
    const tenantId = tenantFromDiagnosticsSecret(
      deps.internalSecret,
      c.req.header('x-internal-secret')
    )
    return tenantId ? { ok: true, tenantId } : { ok: false }
  }
  const ingestOpts = { nowMs: now, onFirstSeen: deps.onFirstSeen }

  // ── Public ingest: app crash pings (auto) + user-triggered reports ────────
  app.post('/diagnostics/ingest', async (c) => {
    if (limited(clientIpOf((name) => c.req.header(name)))) {
      return c.json({ error: 'rate_limited' }, 429)
    }
    const raw = await c.req.text()
    if (raw.length > MAX_REPORT_BYTES) return c.json({ error: 'too_large' }, 413)
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }
    const incoming = parseIncomingReport(body)
    if (!incoming) return c.json({ error: 'invalid_report' }, 400)

    const record = await ingestReport(deps.store, incoming, {}, ingestOpts)
    deps.log.info('diagnostics-ingest', {
      lane: record.lane,
      fingerprint: record.fingerprint,
      occurrences: record.occurrences
    })
    return c.json({ id: record.id, shortId: shortId(record.id) }, 202)
  })

  // ── Hub lane: the socket diagnostics-sharing has always POSTed to ─────────
  // Body: `{ didHash, report }` (packages/hub/src/features/diagnostics-sharing.ts).
  app.post('/diagnostics', async (c) => {
    const auth = hubLaneAuth(c)
    if (!auth.ok) return c.json({ error: 'forbidden' }, 403)
    const raw = await c.req.text()
    if (raw.length > MAX_REPORT_BYTES) return c.json({ error: 'too_large' }, 413)
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }
    if (!isRecord(body)) return c.json({ error: 'invalid_report' }, 400)
    // The forwarded report is the hub client's own payload; normalize it through
    // the same allowlist. A report that doesn't parse still gets recorded as a
    // minimal envelope so an enabled hub's signal is never dropped silently.
    const incoming = parseIncomingReport(body.report) ?? {
      lane: 'auto' as const,
      errorName: 'HubDiagnosticsReport',
      message: JSON.stringify(body.report ?? null).slice(0, 500),
      surface: 'hub' as const
    }
    const didHash = typeof body.didHash === 'string' ? body.didHash.slice(0, 128) : undefined
    const record = await ingestReport(
      deps.store,
      incoming,
      { lane: 'hub', didHash, tenantId: auth.tenantId },
      ingestOpts
    )
    deps.log.info('diagnostics-hub-report', {
      fingerprint: record.fingerprint,
      tenantId: auth.tenantId
    })
    return c.json({ id: record.id, shortId: shortId(record.id) }, 202)
  })

  // ── Internal drain surface (the operator's signing client) ────────────────
  app.get('/internal/diagnostics/reports', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    const limitParam = Number(c.req.query('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100
    return c.json({ reports: await deps.store.listPending(limit) })
  })

  // ── Fleet view (0341 P3): escalations + counts grouped by deployment ──────
  app.get('/internal/diagnostics/fleet', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    const records = await deps.store.listRecent?.(1000)
    if (!records) return c.json({ error: 'unsupported' }, 501)
    const byTenant = new Map<string, DebugReportRecord[]>()
    for (const record of records) {
      const key = record.tenantId ?? '(unattributed)'
      const bucket = byTenant.get(key)
      if (bucket) bucket.push(record)
      else byTenant.set(key, [record])
    }
    const tenants = [...byTenant.entries()]
      .map(([tenantId, reports]) => ({
        tenantId,
        reports: reports.length,
        occurrences: reports.reduce((sum, r) => sum + r.occurrences, 0),
        lastSeenMs: Math.max(...reports.map((r) => r.lastSeenMs)),
        topIssues: [...reports]
          .sort((a, b) => b.occurrences - a.occurrences)
          .slice(0, 5)
          .map((r) => ({
            shortId: shortId(r.id),
            fingerprint: r.fingerprint,
            errorName: r.errorName,
            lane: r.lane,
            occurrences: r.occurrences,
            lastSeenMs: r.lastSeenMs
          }))
      }))
      .sort((a, b) => b.lastSeenMs - a.lastSeenMs)
    return c.json({ tenants })
  })

  app.post('/internal/diagnostics/ack', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown }
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string')
      : []
    if (ids.length === 0) return c.json({ error: 'ids_required' }, 400)
    return c.json({ ok: true, acked: await deps.store.ack(ids) })
  })

  return app
}
