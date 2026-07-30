/**
 * @xnetjs/hub — diagnostics inbox: every hub is its own crash console
 * (exploration 0341).
 *
 * Mounts the first-party crash/debug-report quarantine ON the deployment's own
 * hub, so clients report to the hub they already trust and nothing leaves the
 * deployment by default — the inverse of hosted-ingest error trackers. The
 * operator drains pending reports into `debug-report` workspace nodes (the
 * 0315 drain, same 0278 no-server-writes invariant) and triages them in the
 * workbench.
 *
 * Routes:
 *  - `POST /diagnostics/ingest` — the public ingest (lanes `auto`/`user`),
 *    rate-limited per client IP, 8 KB cap. Gated by `XNET_DIAGNOSTICS_INBOX`:
 *    `open` (default) | `authed` (UCAN required) | `off`.
 *  - `GET  /diagnostics/summary` — content-free counts + top issues for the
 *    operator UI and (managed hubs) the cloud dashboard card. Admin UCAN, or
 *    `x-internal-secret` matching `XNET_DIAGNOSTICS_SECRET` when the owner has
 *    configured diagnostics sharing (the same secret the cloud provisioned —
 *    the two directions of one trust relationship).
 *  - `GET  /diagnostics/pending` + `POST /diagnostics/ack` — the drain surface.
 *    Admin UCAN only (`hub/admin`): quarantined payloads are operator data.
 *
 * Backpressure: when pending rows alone reach the row cap, NEW reports get 507
 * — the store's evictor only ever removes drained rows, so an unread
 * quarantine refuses input rather than dropping triage state (0291 lesson).
 *
 * Coexists with `diagnosticsSharingFeature` (0210) under the same
 * `/diagnostics` prefix: sharing = outbound escalation to an upstream sink,
 * inbox = inbound quarantine for this deployment's own crashes.
 */

import type { AuthContext } from '../auth/ucan'
import type { Env } from './broker'
import type { HubFeature } from './types'
import {
  clientIpOf,
  createSlidingWindowLimiter,
  fingerprintOf,
  ingestReport,
  MAX_REPORT_BYTES,
  parseIncomingReport,
  shortId,
  type DebugReportRecord,
  type DebugReportStore,
  type RateWindow
} from '@xnetjs/telemetry/inbox'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { createSqliteDebugReportStore, DEFAULT_MAX_ROWS } from '../diagnostics/store'

export type DiagnosticsInboxMode = 'open' | 'authed' | 'off'

export interface DiagnosticsInboxOptions {
  /** Injected store for tests; defaults to SQLite (or memory) per hub storage. */
  store?: DebugReportStore
  /** Pending-row backpressure cap (mirrors the store's row cap). */
  maxPendingRows?: number
  /** Public-ingest rate window per client IP (default 10/min). */
  ingestRateLimit?: RateWindow
  nowMs?: () => number
  /** Fired the first time a fingerprint is seen (alert seam, 0315 P4). */
  onFirstSeen?: (record: DebugReportRecord) => void
  /** Injected fetch for the Lane-1 tee (tests); defaults to global fetch. */
  fetchImpl?: typeof fetch
}

const modeFromEnv = (env: Env): DiagnosticsInboxMode => {
  const raw = env.XNET_DIAGNOSTICS_INBOX
  return raw === 'authed' || raw === 'off' ? raw : 'open'
}

const isAdmin = (c: Context): boolean => {
  const auth = c.get('auth') as AuthContext | undefined
  return Boolean(auth?.can('hub/admin', '*'))
}

/**
 * Run the hub's UCAN gate imperatively inside a handler. Returns null when
 * authenticated (auth context is now set on `c`), else the 401 Response.
 */
async function runAuth(c: Context, requireAuth: MiddlewareHandler): Promise<Response | null> {
  let ok = false
  const res = await requireAuth(c, async () => {
    ok = true
  })
  if (ok) return null
  return res instanceof Response ? res : c.json({ error: 'unauthorized' }, 401)
}

/**
 * Build the diagnostics-inbox `HubFeature`. Default-on: an unconfigured
 * self-hosted hub quarantines its own deployment's crashes with zero env vars.
 */
export function diagnosticsInboxFeature(options: DiagnosticsInboxOptions = {}): HubFeature {
  return {
    id: 'fyi.xnet.diagnostics-inbox',
    secrets: [
      'XNET_DIAGNOSTICS_INBOX',
      'XNET_DIAGNOSTICS_SECRET',
      'XNET_DIAGNOSTICS_URL',
      'XNET_SHARE_CRASH_COUNTS'
    ],
    mount({ app, env, requireAuth, storage, dataDir }) {
      const mode = modeFromEnv(env as Env)
      if (mode === 'off') return

      const store =
        options.store ?? createSqliteDebugReportStore(storage === 'sqlite' ? dataDir : ':memory:')
      const maxPending = options.maxPendingRows ?? DEFAULT_MAX_ROWS
      const now = options.nowMs ?? Date.now
      const limited = createSlidingWindowLimiter(
        options.ingestRateLimit ?? { maxAttempts: 10, windowMs: 60_000 },
        now
      )
      const ingestOpts = { nowMs: now, onFirstSeen: options.onFirstSeen }
      // The sharing secret doubles as the cloud dashboard's summary credential:
      // a managed hub is provisioned with it, and the control plane holds the
      // same value, so "the cloud may read my counts" is exactly "I configured
      // escalation to that cloud".
      const sharedSecret = (env as Env).XNET_DIAGNOSTICS_SECRET
      const secretOk = (c: Context): boolean =>
        Boolean(sharedSecret) && c.req.header('x-internal-secret') === sharedSecret

      // Lane-1 tee (0341 P4): the SECOND of the three escalation switches.
      // Off by default; when the owner opts in (and sharing is configured),
      // each auto-lane ingest forwards FINGERPRINT-LEVEL data upstream —
      // grouping identity and counts, never the scrubbed message, stack,
      // breadcrumbs, or didHash. Fire-and-forget: the tee can never fail or
      // slow the deployment's own ingest.
      const upstream = (env as Env).XNET_DIAGNOSTICS_URL?.replace(/\/+$/, '')
      const teeEnabled = Boolean(
        (env as Env).XNET_SHARE_CRASH_COUNTS === 'on' && upstream && sharedSecret
      )
      const doFetch = options.fetchImpl ?? fetch
      const teeUpstream = (record: DebugReportRecord): void => {
        if (!teeEnabled || record.lane !== 'auto') return
        void doFetch(`${upstream}/diagnostics`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-secret': sharedSecret! },
          body: JSON.stringify({
            report: {
              lane: 'auto',
              errorName: record.errorName,
              // The upstream allowlist requires a message; the error name is
              // the only content-free value that satisfies it.
              message: record.errorName,
              release: record.release,
              surface: record.surface,
              fingerprint: record.fingerprint,
              occurrences: record.occurrences
            }
          })
        }).catch(() => {})
      }

      const inbox = new Hono()

      inbox.post('/ingest', async (c) => {
        if (mode === 'authed') {
          const denied = await runAuth(c, requireAuth)
          if (denied) return denied
        }
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

        // Backpressure: only NEW records are refused — an occurrence bump on an
        // existing auto-lane fingerprint always lands (it costs no new row).
        const wouldInsert =
          incoming.lane !== 'auto' || (await store.get(`dr_${fingerprintOf(incoming)}`)) === null
        if (wouldInsert) {
          const pending = (await store.pendingCount?.()) ?? 0
          if (pending >= maxPending) return c.json({ error: 'quarantine_full' }, 507)
        }

        const record = await ingestReport(store, incoming, {}, ingestOpts)
        teeUpstream(record)
        return c.json({ id: record.id, shortId: shortId(record.id) }, 202)
      })

      inbox.get('/summary', async (c) => {
        if (!secretOk(c)) {
          const denied = await runAuth(c, requireAuth)
          if (denied) return denied
          if (!isAdmin(c)) return c.json({ error: 'forbidden' }, 403)
        }
        const topParam = Number(c.req.query('top'))
        const topN = Number.isFinite(topParam) && topParam > 0 ? Math.min(topParam, 20) : 5
        const summary = await store.summary?.(topN)
        if (!summary) return c.json({ error: 'unsupported' }, 501)
        return c.json(summary)
      })

      inbox.use('/pending', requireAuth)
      inbox.get('/pending', async (c) => {
        if (!isAdmin(c)) return c.json({ error: 'forbidden' }, 403)
        const limitParam = Number(c.req.query('limit'))
        const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100
        return c.json({ reports: await store.listPending(limit) })
      })

      inbox.use('/ack', requireAuth)
      inbox.post('/ack', async (c) => {
        if (!isAdmin(c)) return c.json({ error: 'forbidden' }, 403)
        const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown }
        const ids = Array.isArray(body.ids)
          ? body.ids.filter((id): id is string => typeof id === 'string')
          : []
        if (ids.length === 0) return c.json({ error: 'ids_required' }, 400)
        return c.json({ ok: true, acked: await store.ack(ids) })
      })

      app.route('/diagnostics', inbox)
    }
  }
}
