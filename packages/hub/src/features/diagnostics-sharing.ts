/**
 * @xnetjs/hub — opt-in diagnostics-sharing feature (exploration 0210).
 *
 * Lets a hub owner *choose* to forward scrubbed, content-free crash reports to
 * xNet so we can help debug their hub — without us surveilling their workspace.
 * OFF BY DEFAULT: `configFromEnv` returns null unless BOTH `XNET_DIAGNOSTICS_URL`
 * and `XNET_DIAGNOSTICS_SECRET` are set, so a self-hosted hub mounts only the
 * boolean `/diagnostics/health` probe (reporting `sharing:false`) and the
 * `/diagnostics/report` route simply does not exist. Modeled on
 * `aiForwarderFeature`: broker-scoped env, generic over an injected `fetch`, no
 * `@xnetjs/cloud` edge.
 *
 * What leaves the hub when enabled: the sender's DID hashed (pseudonymous, never
 * raw) and a length-bounded crash report. Document content is never forwarded —
 * the report is the client's already-scrubbed crash payload, re-bounded here as
 * defense in depth.
 */

import type { Env } from './broker'
import type { HubFeature } from './types'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { clipJson, hashDid } from '../telemetry/normalize'

export interface DiagnosticsSharingOptions {
  /** Injected fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

interface DiagnosticsConfig {
  /** Upstream diagnostics sink, e.g. `https://cloud.xnet.app`. */
  upstream: string
  /** Shared secret the sink checks (`x-internal-secret`); doubles as the hash salt. */
  secret: string
}

/** Max serialized report bytes forwarded — a hard bound on what can leave the hub. */
const MAX_REPORT_BYTES = 8_000

/** Resolve the config from the broker-scoped env, or null when unconfigured (off). */
function configFromEnv(env: Env): DiagnosticsConfig | null {
  const upstream = env.XNET_DIAGNOSTICS_URL
  const secret = env.XNET_DIAGNOSTICS_SECRET
  if (!upstream || !secret) return null
  return { upstream: upstream.replace(/\/+$/, ''), secret }
}

/**
 * Build the diagnostics-sharing `HubFeature`. Mounts:
 *  - `GET /diagnostics/health` — boolean probe (`{ ok, sharing }`), always present.
 *  - `POST /diagnostics/report` — authed; forwards a scrubbed report upstream.
 *    Mounted ONLY when sharing is configured.
 */
export function diagnosticsSharingFeature(options: DiagnosticsSharingOptions = {}): HubFeature {
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    id: 'fyi.xnet.diagnostics',
    secrets: ['XNET_DIAGNOSTICS_URL', 'XNET_DIAGNOSTICS_SECRET'],
    mount({ app, env, requireAuth }) {
      const config = configFromEnv(env as Env)
      const diag = new Hono()
      // Booleans only — safe to leave unauthenticated, like the AI probe.
      diag.get('/health', (c) => c.json({ ok: true, sharing: config !== null }))
      if (config) {
        diag.use('/report', requireAuth)
        diag.post('/report', (c) => forwardReport(c, config, fetchImpl))
      }
      app.route('/diagnostics', diag)
    }
  }
}

/** Scrub + bound the report and forward it to the configured sink. */
async function forwardReport(
  c: Context,
  config: DiagnosticsConfig,
  fetchImpl: typeof fetch
): Promise<Response> {
  const auth = c.get('auth') as { did?: string } | undefined
  const did = auth?.did
  // Pseudonymous: hash the DID with the shared secret as salt; never forward raw.
  // Anonymous senders carry no identity (mirrors the telemetry ingest route).
  const didHash = did && did !== 'did:key:anonymous' ? hashDid(did, config.secret) : null

  let parsed: unknown
  try {
    parsed = await c.req.json()
  } catch {
    parsed = null
  }
  const report = clipJson(parsed, MAX_REPORT_BYTES)

  try {
    const upstream = await fetchImpl(`${config.upstream}/diagnostics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': config.secret },
      body: JSON.stringify({ didHash, report })
    })
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }
    })
  } catch {
    return c.json({ error: 'diagnostics_unreachable' }, 502)
  }
}
