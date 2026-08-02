/**
 * @xnetjs/hub — managed-AI forwarder feature (exploration 0208).
 *
 * The hub-side hop for **managed** AI. The client's `ManagedProvider` posts to the
 * hub's `/ai/chat` (carrying no key); this feature forwards it to the xNet Cloud
 * control plane's metered gateway, **injecting the per-tenant credential**
 * (`x-internal-secret` + `x-tenant-id`) server-side. So the client never holds a
 * provider key and the hub never re-implements metering — it's a thin, authed proxy.
 *
 * Generic over an injected `fetch` (tests) and configured entirely from the
 * broker-scoped env, mirroring `connectorSyncFeature`: the hub stays free of any
 * `@xnetjs/cloud` edge. Unconfigured (self-host, no control plane) → `/ai/health`
 * reports `managed:false` and the chat route is never mounted, so BYO stays the
 * OSS path and the client's `managed` tier simply hides.
 */

import type { Env } from './broker'
import type { HubFeature } from './types'
import type { Context } from 'hono'
import { Hono } from 'hono'

export interface AiForwarderOptions {
  /** Injected fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

interface ForwarderConfig {
  /** Control-plane base URL, e.g. `https://cloud.xnet.app`. */
  upstream: string
  /**
   * This hub's **per-tenant** gateway token (`XNET_CLOUD_GATEWAY_TOKEN`), sent
   * as a bearer. Self-identifying, so the control plane reads the tenant out of
   * the credential instead of trusting a header we send alongside it — the hole
   * exploration 0436 closed. A hub holding this cannot act as another tenant.
   */
  token: string
}

/**
 * Resolve the forwarder config from the broker-scoped env, or null when
 * unconfigured.
 *
 * Only the per-tenant token is accepted. The previous shape — a fleet-wide
 * `XNET_CLOUD_INTERNAL_SECRET` plus an `XNET_TENANT_ID` header — is deliberately
 * NOT read as a fallback: leaving it in place would mean a hub that failed to
 * re-key silently kept using the fleet master, which is exactly the state the
 * `HUB_PLAN_KID` stamp exists to make visible. An un-re-keyed hub reports
 * `managed:false` and the managed tier hides, which is loud and recoverable.
 */
function configFromEnv(env: Env): ForwarderConfig | null {
  const upstream = env.XNET_CLOUD_URL
  const token = env.XNET_CLOUD_GATEWAY_TOKEN
  if (!upstream || !token) return null
  return { upstream: upstream.replace(/\/+$/, ''), token }
}

/**
 * Build the `HubFeature` for managed AI. Mounts:
 *  - `GET /ai/health` — availability probe (booleans only; the client's connector
 *    detection reads `{ ok, managed }`); answers even when unconfigured.
 *  - `POST /ai/chat` — authed; forwards to the control plane with the tenant creds.
 *  - `GET /ai/models` — authed; forwards the plan-gated model catalog.
 */
export function aiForwarderFeature(options: AiForwarderOptions = {}): HubFeature {
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    id: 'fyi.xnet.ai',
    secrets: ['XNET_CLOUD_URL', 'XNET_CLOUD_GATEWAY_TOKEN', 'XNET_TENANT_ID'],
    mount({ app, env, requireAuth }) {
      const config = configFromEnv(env as Env)
      const ai = new Hono()
      // Booleans only — no tenant data — so the probe can be unauthenticated, like
      // the bridge `/health`. Per-tenant `aiEnabled` is enforced upstream (401).
      ai.get('/health', (c) => c.json({ ok: true, managed: config !== null }))
      if (config) {
        ai.use('/chat', requireAuth)
        ai.use('/models', requireAuth)
        ai.post('/chat', (c) => forward(c, config, fetchImpl, 'POST', '/ai/chat'))
        ai.get('/models', (c) => forward(c, config, fetchImpl, 'GET', '/ai/models'))
      }
      app.route('/ai', ai)
    }
  }
}

/** Proxy one request upstream, injecting the tenant credential. */
async function forward(
  c: Context,
  config: ForwarderConfig,
  fetchImpl: typeof fetch,
  method: 'GET' | 'POST',
  path: string
): Promise<Response> {
  try {
    const upstream = await fetchImpl(`${config.upstream}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.token}`
      },
      ...(method === 'POST' ? { body: await c.req.text() } : {})
    })
    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }
    })
  } catch {
    return c.json({ error: 'managed_ai_unreachable' }, 502)
  }
}
