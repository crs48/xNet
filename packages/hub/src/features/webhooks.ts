/**
 * @xnetjs/hub - Declarative feature webhooks (exploration 0189, the "v2" shape).
 *
 * A `HubFeature` can declare signature-verified webhooks instead of hand-writing
 * a Hono route. `mountWebhook` generalises the bespoke GitHub webhook handler:
 * read the raw body, gate on the broker-scoped secret, verify the signature,
 * parse, normalize → actions, optionally apply. This is what lets the GitHub
 * integration become a declarative module rather than a custom route.
 */

import type { Env } from './broker'
import type { Hono } from 'hono'

export interface DeclarativeWebhook {
  /** Full mount path on the hub app, e.g. `'/tasks/github/webhook'`. */
  path: string
  /** Env key holding the signing secret; the route answers 503 when it's unset. */
  secretRef?: string
  /** Human message for the 503 when `secretRef` is unset (defaults to a generic one). */
  notConfiguredMessage?: string
  /** Verify the raw body against the secret + headers. Return false → 401. */
  verify: (rawBody: string, headers: Record<string, string>, secret: string) => boolean
  /** Pure: turn the verified, parsed delivery into actions (an opaque list). */
  normalize: (headers: Record<string, string>, payload: unknown) => unknown[]
  /** Optionally apply the actions (e.g. mutate Task nodes). */
  apply?: (actions: unknown[]) => Promise<void>
}

/**
 * Mount one declarative webhook. Status codes match the previous hand-written
 * GitHub handler exactly: 503 (no secret), 401 (bad signature), 400 (bad JSON),
 * 200 `{ ok, actions }`.
 */
export function mountWebhook(app: Hono, webhook: DeclarativeWebhook, env: Env): void {
  app.post(webhook.path, async (c) => {
    const secret = webhook.secretRef ? env[webhook.secretRef] : ''
    if (webhook.secretRef && !secret) {
      const error = webhook.notConfiguredMessage ?? 'Webhook is not configured'
      return c.json({ error, code: 'NOT_CONFIGURED' }, 503)
    }
    const rawBody = await c.req.text()
    const headers = c.req.header() as Record<string, string>
    if (!webhook.verify(rawBody, headers, secret ?? '')) {
      return c.json({ error: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' }, 401)
    }
    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Invalid JSON payload', code: 'INVALID_INPUT' }, 400)
    }
    const actions = webhook.normalize(headers, payload)
    if (actions.length > 0 && webhook.apply) await webhook.apply(actions)
    return c.json({ ok: true, actions: actions.length })
  })
}
