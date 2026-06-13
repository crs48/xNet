/**
 * xNet Cloud — HTTP control-plane API (Hono).
 *
 * A thin JSON surface over the {@link ControlPlane}. The provisioning/plan/recovery
 * routes are "internal" (driven by Stripe webhooks + authenticated sessions in
 * production) and gated by a shared secret in this initial cut; `/auth/start` shows
 * the WorkOS AuthKit hand-off. Kept framework-light and synchronous-to-test:
 * exercise it with `app.request(...)` — no real socket needed.
 */

import type { ControlPlane } from './control-plane'
import type { BillingIdentityProvider, DidChallenge } from '@xnetjs/cloud-identity'
import { Hono } from 'hono'

export interface ControlPlaneAppDeps {
  controlPlane: ControlPlane
  billing: BillingIdentityProvider
  /** Shared secret for internal routes; if unset, internal routes are disabled. */
  internalSecret?: string
}

interface ProvisionBody {
  tenantId?: string
  plan?: string
  billingUserId?: string
  challenge?: DidChallenge
  overrides?: Record<string, unknown>
  region?: string
}

export function createControlPlaneApp(deps: ControlPlaneAppDeps): Hono {
  const app = new Hono()

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'xnet-cloud', substrate: deps.controlPlane ? 'ready' : 'init' })
  )

  // Start a WorkOS AuthKit sign-in; the callback (not built here) exchanges the
  // code via billing.authenticateWithCode and seals a session.
  app.get('/auth/start', (c) => {
    const state = c.req.query('state')
    const url = deps.billing.getAuthorizationUrl({
      screenHint: 'sign-in',
      ...(state ? { state } : {})
    })
    return c.redirect(url)
  })

  app.get('/tenants/:id', async (c) => {
    const record = await deps.controlPlane.getTenant(c.req.param('id'))
    if (!record) return c.json({ error: 'not_found' }, 404)
    return c.json(record)
  })

  // ── Internal routes (Stripe webhook / admin) ─────────────────────────────
  const requireInternal = (c: { req: { header: (k: string) => string | undefined } }): boolean =>
    Boolean(deps.internalSecret) && c.req.header('x-internal-secret') === deps.internalSecret

  app.post('/internal/tenants', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as ProvisionBody
    if (!body.tenantId || !body.plan || !body.billingUserId || !body.challenge) {
      return c.json({ error: 'bad_request' }, 400)
    }
    try {
      const record = await deps.controlPlane.provisionTenant({
        tenantId: body.tenantId,
        plan: body.plan as never,
        billingUserId: body.billingUserId,
        challenge: body.challenge,
        ...(body.overrides ? { overrides: body.overrides as never } : {}),
        ...(body.region ? { region: body.region } : {})
      })
      return c.json(record, 201)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 422)
    }
  })

  app.post('/internal/tenants/:id/plan', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as {
      plan?: string
      overrides?: Record<string, unknown>
    }
    if (!body.plan) return c.json({ error: 'bad_request' }, 400)
    try {
      const result = await deps.controlPlane.changePlan(
        c.req.param('id'),
        body.plan as never,
        (body.overrides ?? {}) as never
      )
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 422)
    }
  })

  app.post('/internal/account/recover', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { billingUserId?: string }
    if (!body.billingUserId) return c.json({ error: 'bad_request' }, 400)
    try {
      const result = await deps.controlPlane.recoverAccount(body.billingUserId)
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 422)
    }
  })

  return app
}
