/**
 * @xnetjs/telemetry/inbox — the tenant-neutral diagnostics-inbox core
 * (exploration 0341, extracted from `apps/cloud/src/diagnostics.ts` / 0315).
 *
 * Everything a deployment needs to quarantine crash/debug reports first-party:
 * the allowlist normalizer, the fingerprint grouping key, the dedupe/upsert
 * ingest step, the quarantine store contract (+ in-memory impl), and the
 * sliding-window rate limiter. The hub's `diagnostics-inbox` feature and the
 * cloud's `/diagnostics` routes are thin HTTP shells over this module, so
 * self-hosted, managed, and vendor deployments run the same code path.
 *
 * SERVER-ONLY: this module uses `node:crypto` and is exported via the
 * `@xnetjs/telemetry/inbox` subpath precisely so the browser-safe root barrel
 * never pulls it in. Do not re-export it from `src/index.ts`.
 *
 * Trust properties (unchanged from 0315):
 *  - allowlist normalization: unknown fields are dropped, known fields are
 *    length-bounded, and everything is re-scrubbed server-side as defense in
 *    depth (clients scrub first; Signal's redaction bugs say never trust one
 *    layer);
 *  - lane `auto` dedupes by fingerprint — repeat crashes bump `occurrences`
 *    instead of flooding storage;
 *  - no unique identifiers: lanes `auto`/`user` carry no DID at all; the hub
 *    lane carries only a hub-salted `didHash`.
 */

import { createHash, randomBytes } from 'node:crypto'
import { scrubTelemetryData } from '../collection/scrubbing'

// ─── Record + store contract ────────────────────────────────────────────────

export type DebugReportLane = 'auto' | 'user' | 'hub'
export type DebugReportStatus = 'pending' | 'drained'
export type DebugReportSurface = 'web' | 'electron' | 'hub' | 'cloud' | 'unknown'

export interface DebugReportRecord {
  /** `dr_<fingerprint>` for lane `auto` (dedupe key); `dr_u_<random>` otherwise. */
  id: string
  lane: DebugReportLane
  fingerprint: string
  /**
   * Cross-release grouping key: `fingerprint` without the release component,
   * so "did 1.42 fix it?" splits per release while the console can still
   * group one issue's whole history (exploration 0341). Optional only because
   * records quarantined before 0341 lack it; every new ingest sets it.
   */
  issueKey?: string
  errorName: string
  message: string
  stack?: string
  release?: string
  surface: DebugReportSurface
  bootStage?: string
  uaFamily?: string
  userDescription?: string
  /** Lane `user` only: scrubbed recent log lines from the devtools ring (0275). */
  breadcrumbs?: string[]
  /** Hub lane only: the hub-salted sender hash (never a raw DID). */
  didHash?: string
  /**
   * Vendor-cloud only: which deployment escalated this report (resolved from
   * the forwarding hub's provisioned secret, never self-asserted). Absent on
   * deployment-local hub quarantines — a hub has exactly one tenant: itself.
   */
  tenantId?: string
  occurrences: number
  status: DebugReportStatus
  firstSeenMs: number
  lastSeenMs: number
}

/** Content-free per-issue line for the operator/tenant summary surfaces. */
export interface DiagnosticsSummaryIssue {
  fingerprint: string
  shortId: string
  errorName: string
  lane: DebugReportLane
  surface: DebugReportSurface
  release?: string
  occurrences: number
  status: DebugReportStatus
  firstSeenMs: number
  lastSeenMs: number
}

/** Coarse inbox state for dashboards: counts + top issues, never payloads. */
export interface DiagnosticsSummary {
  pending: number
  drained: number
  total: number
  lastSeenMs: number | null
  topIssues: DiagnosticsSummaryIssue[]
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
  /**
   * Counts + top issues for dashboard cards. Optional: stores that predate the
   * summary surface (e.g. the cloud's Firestore store) may not implement it.
   */
  summary?(topN?: number): Promise<DiagnosticsSummary>
  /** Pending-row count — the quarantine-full backpressure signal. Optional. */
  pendingCount?(): Promise<number>
  /**
   * Most-recent records regardless of status (newest last-seen first) — the
   * fleet view's read. Optional: stores that predate it may not implement it.
   */
  listRecent?(limit?: number): Promise<DebugReportRecord[]>
}

export const toSummaryIssue = (record: DebugReportRecord): DiagnosticsSummaryIssue => ({
  fingerprint: record.fingerprint,
  shortId: shortId(record.id),
  errorName: record.errorName,
  lane: record.lane,
  surface: record.surface,
  release: record.release,
  occurrences: record.occurrences,
  status: record.status,
  firstSeenMs: record.firstSeenMs,
  lastSeenMs: record.lastSeenMs
})

/** Default store — dev/tests. Durable deployments inject SQLite/Firestore impls. */
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

  async summary(topN = 5): Promise<DiagnosticsSummary> {
    const all = [...this.records.values()]
    const pending = all.filter((r) => r.status === 'pending')
    return {
      pending: pending.length,
      drained: all.length - pending.length,
      total: all.length,
      lastSeenMs: all.length ? Math.max(...all.map((r) => r.lastSeenMs)) : null,
      topIssues: [...all]
        .sort((a, b) => b.occurrences - a.occurrences || b.lastSeenMs - a.lastSeenMs)
        .slice(0, topN)
        .map(toSummaryIssue)
    }
  }

  async pendingCount(): Promise<number> {
    return [...this.records.values()].filter((r) => r.status === 'pending').length
  }

  async listRecent(limit = 500): Promise<DebugReportRecord[]> {
    return [...this.records.values()]
      .sort((a, b) => b.lastSeenMs - a.lastSeenMs)
      .slice(0, limit)
      .map((r) => structuredClone(r))
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

export const isRecord = (v: unknown): v is Record<string, unknown> =>
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

/** The top stack frame, kept path + line/col but stripped of its origin. */
const normalizedTopFrame = (stack?: string): string =>
  stack
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at ') || /\S+:\d+:\d+/.test(line))
    ?.replace(/https?:\/\/[^/]+/g, '') ?? ''

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
  return createHash('sha256')
    .update(`${report.errorName}|${normalizedTopFrame(report.stack)}|${report.release ?? ''}`)
    .digest('hex')
    .slice(0, 24)
}

/**
 * Release-independent issue identity: the fingerprint minus the release
 * component. Never hashes line-varying content like raw messages (grouping
 * stability — the Sentry lesson), and `TaggedError` names (`_tag.code`) make
 * the best inputs because they survive re-bundling.
 */
export function issueKeyOf(report: { errorName: string; stack?: string }): string {
  return createHash('sha256')
    .update(`${report.errorName}|${normalizedTopFrame(report.stack)}`)
    .digest('hex')
    .slice(0, 24)
}

/** Short operator-facing handle, quotable in a GitHub issue ("XR-7F3A2B"). */
export const shortId = (id: string): string =>
  `XR-${createHash('sha256').update(id).digest('hex').slice(0, 6).toUpperCase()}`

// ─── The shared ingest step (scrub → fingerprint → dedupe/upsert → prune) ───

export interface IngestExtras {
  /** Override the lane (the hub forwarder lane); defaults to the report's own. */
  lane?: DebugReportLane
  /** Hub lane only: the hub-salted sender hash. */
  didHash?: string
  /** Vendor cloud only: the verified escalating deployment. */
  tenantId?: string
}

export interface IngestOptions {
  nowMs?: () => number
  /** Fired the first time a fingerprint is seen (the 0315 P4 alert seam). */
  onFirstSeen?: (record: DebugReportRecord) => void
}

/**
 * Scrub, fingerprint, and upsert one normalized report into the quarantine.
 * Lane `auto` dedupes by fingerprint (repeat crashes bump `occurrences` and
 * resurface a drained record as `pending`); other lanes always insert.
 */
export async function ingestReport(
  store: DebugReportStore,
  incoming: IncomingReport,
  extra: IngestExtras = {},
  opts: IngestOptions = {}
): Promise<DebugReportRecord> {
  const now = opts.nowMs ?? Date.now
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
  const issueKey = issueKeyOf(incoming)
  const id = lane === 'auto' ? `dr_${fingerprint}` : `dr_u_${randomBytes(9).toString('hex')}`
  const at = now()

  const existing = lane === 'auto' ? await store.get(id) : null
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
        issueKey,
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
        tenantId: extra.tenantId,
        occurrences: 1,
        status: 'pending',
        firstSeenMs: at,
        lastSeenMs: at
      }

  await store.put(record)
  if (!existing) {
    try {
      opts.onFirstSeen?.(record)
    } catch {
      // alerting must never fail ingest
    }
  }
  // Opportunistic retention: drop long-drained records as new ones arrive.
  void store.prune(DRAINED_KEEP_MS, at).catch(() => {})
  return record
}

// ─── Rate limiting (form-inbox sliding-window pattern) ──────────────────────

export interface RateWindow {
  maxAttempts: number
  windowMs: number
}

/** Sliding-window limiter; the returned function reports "is this key limited?". */
export function createSlidingWindowLimiter(
  window: RateWindow,
  nowMs: () => number
): (key: string) => boolean {
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

/** Best-effort client key for rate limiting, from proxy-aware headers. */
export const clientIpOf = (header: (name: string) => string | undefined): string =>
  header('x-forwarded-for')?.split(',')[0]?.trim() ?? header('x-real-ip') ?? 'unknown'
