/**
 * @xnetjs/hub — connector sync feature (exploration 0196).
 *
 * The server-side half of a Connector. It is **generic over an injected `run`**
 * so the hub stays free of any `@xnetjs/plugins` edge: the app wires `run` to
 * call the connector's `runConnectorSync` with a real NodeStore. The broker
 * scopes `env` to the connector's declared `secrets` before `mount` (see
 * `mountFeatures`), so the connector's token never escapes the hub — the agent
 * only ever sees the synced, policy-evaluated nodes.
 *
 * Mounts an authed `POST /x/<id>.sync/run` that runs one sync pass; the target
 * Space comes from the request body (DID comes from the session, never the body).
 */

import type { Env } from './broker'
import type { HubFeature } from './types'
import type { AuthContext } from '../auth/ucan'
import { Hono } from 'hono'
import { isRecord } from '../utils/validation'

type HonoEnv = { Variables: { auth: AuthContext } }

export interface ConnectorSyncRunInput {
  /** Broker-scoped env — only the connector's declared secrets. */
  env: Env
  /** The authenticated caller's DID (from the session, never the request body). */
  subject: string
  /** Target Space id from the request (null = unscoped, if the connector allows). */
  space: string | null
}

export interface ConnectorSyncFeatureOptions {
  /** The connector module id; the feature mounts at `/x/<id>.sync`. */
  id: string
  /** Secrets the connector's sync may read (scoped by the broker at mount). */
  secrets?: string[]
  /** Run one sync pass with the scoped env. Returns a JSON-able summary. */
  run: (input: ConnectorSyncRunInput) => Promise<unknown>
}

/**
 * Build the `HubFeature` for a connector's sync half. Mounts an authed
 * `POST /x/<id>.sync/run` that runs one sync pass with the broker-scoped env.
 */
export function connectorSyncFeature(options: ConnectorSyncFeatureOptions): HubFeature {
  const base = `/x/${options.id}.sync`
  return {
    id: `${options.id}.sync`,
    ...(options.secrets ? { secrets: options.secrets } : {}),
    mount({ app, env, requireAuth }) {
      const routes = new Hono<HonoEnv>()
      routes.use('*', requireAuth)
      routes.post('/run', async (c) => {
        const auth = c.get('auth') as AuthContext | undefined
        if (!auth) return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
        const body: unknown = await c.req.json().catch(() => ({}))
        const space = isRecord(body) && typeof body.space === 'string' ? body.space : null
        try {
          const result = await options.run({ env: env as Env, subject: auth.did, space })
          return c.json({ ok: true, result })
        } catch (err) {
          return c.json(
            { ok: false, error: err instanceof Error ? err.message : 'connector sync failed' },
            400
          )
        }
      })
      app.route(base, routes)
    }
  }
}
