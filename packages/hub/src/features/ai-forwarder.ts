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
  /** Shared internal secret the control plane checks (`x-internal-secret`). */
  secret: string
  /** This hub's tenant id (`x-tenant-id`). */
  tenantId: string
}

/** Resolve the forwarder config from the broker-scoped env, or null when unconfigured. */
function configFromEnv(env: Env): ForwarderConfig | null {
  const upstream = env.XNET_CLOUD_URL
  const secret = env.XNET_CLOUD_INTERNAL_SECRET
  const tenantId = env.XNET_TENANT_ID
  if (!upstream || !secret || !tenantId) return null
  return { upstream: upstream.replace(/\/+$/, ''), secret, tenantId }
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
    secrets: ['XNET_CLOUD_URL', 'XNET_CLOUD_INTERNAL_SECRET', 'XNET_TENANT_ID'],
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
        'x-internal-secret': config.secret,
        'x-tenant-id': config.tenantId
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
