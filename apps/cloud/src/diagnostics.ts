/**
 * First-party debug-report ingest (exploration 0315 P1).
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
 * Trust properties:
 *  - allowlist normalization: unknown fields are dropped, known fields are
 *    length-bounded, and everything is re-scrubbed server-side as defense in
 *    depth (clients scrub first; Signal's redaction bugs say never trust one
 *    layer);
 *  - lane `auto` dedupes by fingerprint — repeat crashes bump `occurrences`
 *    instead of flooding storage;
 *  - the raw body is hard-capped at 8 KB (mirrors the hub's forwarder bound)
 *    and the public surface is rate-limited per client IP;
 *  - no unique identifiers: lane `auto`/`user` carry no DID at all; the hub
 *    lane carries only the hub-salted `didHash` it already computes.
 */

import type { Logger } from './logger'
import { createHash, randomBytes } from 'node:crypto'
import { scrubTelemetryData } from '@xnetjs/telemetry'
import { Hono } from 'hono'

// ─── Record + store ─────────────────────────────────────────────────────────

export type DebugReportLane = 'auto' | 'user' | 'hub'
export type DebugReportStatus = 'pending' | 'drained'

export interface DebugReportRecord {
  /** `dr_<fingerprint>` for lane `auto` (dedupe key); `dr_u_<random>` otherwise. */
  id: string
  lane: DebugReportLane
  fingerprint: string
  errorName: string
  message: string
  stack?: string
  release?: string
  surface: 'web' | 'electron' | 'hub' | 'cloud' | 'unknown'
  bootStage?: string
  uaFamily?: string
  userDescription?: string
  /** Lane `user` only: scrubbed recent log lines from the devtools ring (0275). */
  breadcrumbs?: string[]
  /** Hub lane only: the hub-salted sender hash (never a raw DID). */
  didHash?: string
  occurrences: number
  status: DebugReportStatus
  firstSeenMs: number
  lastSeenMs: number
}

export interface DebugReportStore {
  get(id: string): Promise<DebugReportRecord | null>
  put(record: DebugReportRecord): Promise<void>
  /** Pending reports, oldest first (the drain's work list). */
  listPending(limit?: number): Promise<DebugReportRecord[]>
  /** Mark drained; unknown ids are ignored. Returns how many changed. */
  ack(ids: string[]): Promise<number>
  /** Drop drained records not seen for `keepMs` (retention). Returns removed count. */
  prune(keepMs: number, nowMs: number): Promise<number>
}

/** Default store — dev/tests. Production injects a Firestore-backed impl. */
export class MemoryDebugReportStore implements DebugReportStore {
  private records = new Map<string, DebugReportRecord>()

  async get(id: string): Promise<DebugReportRecord | null> {
    const found = this.records.get(id)
    return found ? structuredClone(found) : null
  }

  async put(record: DebugReportRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record))
  }

  async listPending(limit = 100): Promise<DebugReportRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.status === 'pending')
      .sort((a, b) => a.firstSeenMs - b.firstSeenMs)
      .slice(0, limit)
      .map((r) => structuredClone(r))
  }

  async ack(ids: string[]): Promise<number> {
    let changed = 0
    for (const id of ids) {
      const record = this.records.get(id)
      if (record && record.status !== 'drained') {
        record.status = 'drained'
        changed++
      }
    }
    return changed
  }

  async prune(keepMs: number, nowMs: number): Promise<number> {
    let removed = 0
    for (const [id, record] of this.records) {
      if (record.status === 'drained' && record.lastSeenMs < nowMs - keepMs) {
        this.records.delete(id)
        removed++
      }
    }
    return removed
  }
}

// ─── Normalization (allowlist, never blocklist) ─────────────────────────────

/** Hard bound on an ingest body — mirrors the hub forwarder's MAX_REPORT_BYTES. */
export const MAX_REPORT_BYTES = 8_000
/** Drained records are pruned this long after last being seen (retention). */
export const DRAINED_KEEP_MS = 30 * 24 * 60 * 60 * 1000

const SURFACES = new Set(['web', 'electron', 'hub', 'cloud'])
const MAX_BREADCRUMBS = 50
const MAX_BREADCRUMB_CHARS = 300

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The allowlisted, length-bounded fields a client may submit. */
export interface IncomingReport {
  lane: 'auto' | 'user'
  errorName: string
  message: string
  stack?: string
  release?: string
  surface: DebugReportRecord['surface']
  bootStage?: string
  uaFamily?: string
  userDescription?: string
  breadcrumbs?: string[]
}

/** Parse + allowlist an ingest body. Unknown keys are dropped, not echoed. */
export function parseIncomingReport(body: unknown): IncomingReport | null {
  if (!isRecord(body)) return null
  const lane = body.lane === 'user' ? 'user' : body.lane === 'auto' ? 'auto' : null
  if (!lane) return null
  const errorName = str(body.errorName, 120)
  const message = str(body.message, 500)
  if (!errorName || !message) return null

  const breadcrumbs = Array.isArray(body.breadcrumbs)
    ? body.breadcrumbs
        .filter((line): line is string => typeof line === 'string')
        .slice(-MAX_BREADCRUMBS)
        .map((line) => line.slice(0, MAX_BREADCRUMB_CHARS))
    : undefined

  return {
    lane,
    errorName,
    message,
    stack: str(body.stack, 6_000),
    release: str(body.release, 64),
    surface: SURFACES.has(body.surface as string)
      ? (body.surface as IncomingReport['surface'])
      : 'unknown',
    bootStage: str(body.bootStage, 64),
    uaFamily: str(body.uaFamily, 64),
    userDescription: lane === 'user' ? str(body.userDescription, 2_000) : undefined,
    breadcrumbs: lane === 'user' ? breadcrumbs : undefined
  }
}

/**
 * Grouping key: error name + normalized top stack frame + release. The frame
 * keeps its path and line/col but drops the origin, so the same build crashing
 * at the same spot groups regardless of which deployment host served it.
 */
export function fingerprintOf(report: {
  errorName: string
  stack?: string
  release?: string
}): string {
  const topFrame =
    report.stack
      ?.split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at ') || /\S+:\d+:\d+/.test(line))
      ?.replace(/https?:\/\/[^/]+/g, '') ?? ''
  return createHash('sha256')
    .update(`${report.errorName}|${topFrame}|${report.release ?? ''}`)
    .digest('hex')
    .slice(0, 24)
}

/** Short operator-facing handle, quotable in a GitHub issue ("XR-7F3A2B"). */
export const shortId = (id: string): string =>
  `XR-${createHash('sha256').update(id).digest('hex').slice(0, 6).toUpperCase()}`

// ─── Rate limiting (form-inbox sliding-window pattern) ──────────────────────

interface Window {
  maxAttempts: number
  windowMs: number
}

const makeLimiter = (window: Window, nowMs: () => number) => {
  const attempts = new Map<string, number[]>()
  return (key: string): boolean => {
    const now = nowMs()
    const recent = (attempts.get(key) ?? []).filter((at) => at > now - window.windowMs)
    if (recent.length >= window.maxAttempts) {
      attempts.set(key, recent)
      return true
    }
    recent.push(now)
    attempts.set(key, recent)
    if (attempts.size > 10_000) {
      for (const [k, v] of attempts) {
        if (v.every((at) => at <= now - window.windowMs)) attempts.delete(k)
      }
    }
    return false
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
  ingestRateLimit?: Window
}

const clientIp = (c: { req: { header: (name: string) => string | undefined } }): string =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown'

export function createDiagnosticsRoutes(deps: DiagnosticsRoutesDeps): Hono {
  const app = new Hono()
  const now = deps.nowMs ?? Date.now
  const limited = makeLimiter(deps.ingestRateLimit ?? { maxAttempts: 10, windowMs: 60_000 }, now)
  const requireInternal = (c: { req: { header: (k: string) => string | undefined } }): boolean =>
    Boolean(deps.internalSecret) && c.req.header('x-internal-secret') === deps.internalSecret

  /** Scrub, fingerprint, and upsert one normalized report. */
  const ingest = async (
    incoming: IncomingReport,
    extra: { lane?: DebugReportLane; didHash?: string }
  ): Promise<DebugReportRecord> => {
    // Server-side re-scrub as defense in depth — clients scrub first, but a
    // single redaction layer is exactly what leaked for Signal.
    const scrubbed = scrubTelemetryData({
      message: incoming.message,
      stack: incoming.stack,
      userDescription: incoming.userDescription,
      breadcrumbs: incoming.breadcrumbs
    })

    const lane = extra.lane ?? incoming.lane
    const fingerprint = fingerprintOf(incoming)
    const id = lane === 'auto' ? `dr_${fingerprint}` : `dr_u_${randomBytes(9).toString('hex')}`
    const at = now()

    const existing = lane === 'auto' ? await deps.store.get(id) : null
    const record: DebugReportRecord = existing
      ? {
          ...existing,
          occurrences: existing.occurrences + 1,
          lastSeenMs: at,
          // A recurrence after draining must resurface: the drain re-upserts
          // the same deterministic node id, so the workspace row just updates.
          status: 'pending'
        }
      : {
          id,
          lane,
          fingerprint,
          errorName: incoming.errorName,
          message: scrubbed.message ?? incoming.errorName,
          stack: scrubbed.stack,
          release: incoming.release,
          surface: extra.lane === 'hub' ? 'hub' : incoming.surface,
          bootStage: incoming.bootStage,
          uaFamily: incoming.uaFamily,
          userDescription: scrubbed.userDescription,
          breadcrumbs: scrubbed.breadcrumbs,
          didHash: extra.didHash,
          occurrences: 1,
          status: 'pending',
          firstSeenMs: at,
          lastSeenMs: at
        }

    await deps.store.put(record)
    if (!existing) {
      try {
        deps.onFirstSeen?.(record)
      } catch {
        // alerting must never fail ingest
      }
    }
    // Opportunistic retention: drop long-drained records as new ones arrive.
    void deps.store.prune(DRAINED_KEEP_MS, at).catch(() => {})
    return record
  }

  // ── Public ingest: app crash pings (auto) + user-triggered reports ────────
  app.post('/diagnostics/ingest', async (c) => {
    if (limited(clientIp(c))) return c.json({ error: 'rate_limited' }, 429)
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

    const record = await ingest(incoming, {})
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
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
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
    const record = await ingest(incoming, { lane: 'hub', didHash })
    deps.log.info('diagnostics-hub-report', { fingerprint: record.fingerprint })
    return c.json({ id: record.id, shortId: shortId(record.id) }, 202)
  })

  // ── Internal drain surface (the operator's signing client) ────────────────
  app.get('/internal/diagnostics/reports', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    const limitParam = Number(c.req.query('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100
    return c.json({ reports: await deps.store.listPending(limit) })
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
