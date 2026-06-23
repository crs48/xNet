/**
 * @xnetjs/hub — generic inbound webhook inbox (exploration 0213).
 *
 * "Anyone can POST a webhook into xNet and have it do something." This is the
 * escape hatch that bridges Zapier / Make / n8n / IFTTT and the long tail of
 * services: a per-workspace URL `POST /hooks/:token` where the path token *is*
 * the credential (the Slack/Discord incoming-webhook model). The feature is
 * generic over an injected sink — like `slackCompatFeature` and the GitHub
 * webhook, the hub has no opinion on how the delivery becomes a node; an app
 * wires `resolveToken` (validate + route) and `deliver` (materialize).
 *
 * Tokens should be high-entropy and revocable (resolveToken returns null for a
 * revoked/unknown token → 404). The route is intentionally unauthenticated
 * (the token authenticates it) so external senders need no xNet session.
 */

import type { HubFeature } from './types'
import { Hono } from 'hono'

/** Where a resolved inbox token routes a delivery. */
export interface WebhookInboxRoute {
  /** Target Space id every materialized node is stamped with (the cascade boundary). */
  space: string
  /** Schema IRI to materialize (default `ExternalItem`). */
  schema?: string
  /** Optional free-form label the app set when minting the token. */
  label?: string
}

/** A verified, routed delivery handed to the sink. */
export interface WebhookInboxDelivery {
  token: string
  route: WebhookInboxRoute
  payload: unknown
}

export interface WebhookInboxPorts {
  /** Validate the path token → routing context, or null to 404 (unknown/revoked). */
  resolveToken: (token: string) => Promise<WebhookInboxRoute | null> | WebhookInboxRoute | null
  /** Materialize the delivery (deferred seam — the app wires node writes). */
  deliver: (delivery: WebhookInboxDelivery) => Promise<void>
}

export const WEBHOOK_INBOX_FEATURE_ID = 'fyi.xnet.webhook-inbox'

/**
 * Build the generic webhook-inbox feature. Mounts `POST /hooks/:token`:
 * - 404 when the token is unknown/revoked,
 * - 400 on a non-JSON body,
 * - 200 `{ ok: true }` once the delivery is handed to the sink.
 */
export function webhookInboxFeature(ports: WebhookInboxPorts): HubFeature {
  return {
    id: WEBHOOK_INBOX_FEATURE_ID,
    mount({ app }) {
      const routes = new Hono()
      routes.post('/:token', async (c) => {
        const token = c.req.param('token')
        const route = await ports.resolveToken(token)
        if (!route) return c.json({ error: 'Unknown webhook token', code: 'UNKNOWN_HOOK' }, 404)

        const payload: unknown = await c.req.json().catch(() => undefined)
        if (payload === undefined) {
          return c.json({ error: 'Invalid JSON payload', code: 'INVALID_INPUT' }, 400)
        }

        await ports.deliver({ token, route, payload })
        return c.json({ ok: true })
      })
      app.route('/hooks', routes)
    }
  }
}
