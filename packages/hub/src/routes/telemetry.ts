/**
 * @xnetjs/hub - Telemetry ingest + analytics routes (exploration 0187).
 *
 * POST /telemetry/ingest — clients push consent-gated, pre-scrubbed batches. Any
 *   authenticated identity may submit its own telemetry (the DID is hashed with
 *   the hub salt, so the dashboard never sees a raw identity); the batch is
 *   clipped/bucketed server-side as defense-in-depth and rate-limited upstream.
 * GET  /telemetry/summary | /rollups | /events — admin-gated read surface for
 *   the analytics dashboard (sensitive: an aggregate of everyone's usage).
 */

import type { AuthContext } from '../auth/ucan'
import type { TelemetryStore, TelemetryQueryFilter } from '../telemetry/store'
import type { MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { hashDid, normalizeRecord } from '../telemetry/normalize'

type Env = { Variables: { auth: AuthContext } }

/** Hard cap on records accepted per ingest request. */
const MAX_BATCH = 500
/** Default lookback window for read endpoints: 7 days. */
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface TelemetryRoutesDeps {
  store: TelemetryStore
  /** Salt used to hash sender DIDs (config.telemetryPeerHashSalt). */
  hashSalt: string
  requireAuth: MiddlewareHandler
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const parseFilter = (c: { req: { query: (k: string) => string | undefined } }): TelemetryQueryFilter => {
  const q = c.req.query.bind(c.req)
  const sinceParam = Number(q('sinceMs'))
  const untilParam = Number(q('untilMs'))
  const limitParam = Number(q('limit'))
  return {
    kind: q('kind') || undefined,
    name: q('name') || undefined,
    sinceMs: Number.isFinite(sinceParam) && sinceParam > 0 ? sinceParam : Date.now() - DEFAULT_WINDOW_MS,
    untilMs: Number.isFinite(untilParam) && untilParam > 0 ? untilParam : undefined,
    limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined
  }
}

export const createTelemetryRoutes = ({
  store,
  hashSalt,
  requireAuth
}: TelemetryRoutesDeps): Hono<Env> => {
  const app = new Hono<Env>()
  app.use('*', requireAuth)

  // ── Ingest ───────────────────────────────────────────────
  app.post('/ingest', async (c) => {
    const auth = c.get('auth') as AuthContext
    const body = await c.req.json().catch(() => null)
    const records = isRecord(body) && Array.isArray(body.records) ? body.records : null
    if (!records) {
      return c.json({ accepted: false, processed: 0, error: 'invalid_batch' }, 400)
    }

    // Hash the sender DID so the store/dashboard only ever sees an opaque hash —
    // anonymous senders carry no hash at all.
    const didHash =
      auth.did && auth.did !== 'did:key:anonymous' ? hashDid(auth.did, hashSalt) : null

    const now = Date.now()
    const rows = records
      .slice(0, MAX_BATCH)
      .map((r) => (isRecord(r) ? normalizeRecord(r, { didHash, now }) : null))
      .filter((r): r is NonNullable<typeof r> => r !== null)

    const processed = store.appendBatch(rows)
    return c.json({ accepted: true, processed })
  })

  // ── Admin-gated reads ────────────────────────────────────
  const denyNonAdmin = (auth: AuthContext | undefined): boolean =>
    !auth || !auth.can('hub/admin', '*')

  app.get('/summary', (c) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (denyNonAdmin(auth)) return c.json({ error: 'forbidden' }, 403)
    const filter = parseFilter(c)
    return c.json({
      window: { sinceMs: filter.sinceMs, untilMs: filter.untilMs ?? Date.now() },
      total: store.count(),
      kinds: store.kindCounts(filter),
      topNames: store.topNames({ ...filter, limit: filter.limit ?? 20 }),
      timeseries: store.timeseries(filter)
    })
  })

  app.get('/rollups', (c) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (denyNonAdmin(auth)) return c.json({ error: 'forbidden' }, 403)
    return c.json({ rollups: store.rollups(parseFilter(c)) })
  })

  app.get('/events', (c) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (denyNonAdmin(auth)) return c.json({ error: 'forbidden' }, 403)
    return c.json({ events: store.recentEvents(parseFilter(c)) })
  })

  return app
}
