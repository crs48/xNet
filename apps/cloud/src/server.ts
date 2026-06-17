/**
 * xNet Cloud — HTTP control-plane API + dashboard (Hono).
 *
 * Three surfaces over the {@link ControlPlane}:
 *   - Public auth + checkout funnel: `/auth/start`, `/auth/callback`, `/checkout`,
 *     `/portal`, `/webhook` — the signup → pay → provision spine (exploration 0192).
 *   - The authenticated dashboard: `/dashboard`, `/logout`, `/account/delete-data`,
 *     served same-origin so the sealed session cookie is read without CORS.
 *   - Internal routes (`/internal/*`) driven by admin tooling, gated by a shared secret.
 *
 * Kept framework-light and synchronous-to-test: exercise it with `app.request(...)`.
 */

import type { ControlPlane } from './control-plane'
import type { BillingIdentityProvider, DidChallenge } from '@xnetjs/cloud/identity'
import type { PlanId } from '@xnetjs/entitlements'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { WebhookSignatureError, type TenantBillingGateway } from './billing-gateway'
import { renderClaimForm, renderClaimResult, renderDashboard } from './dashboard'
import { MemoryDeviceGrantStore, isExpired, type DeviceGrantStore } from './device-grant'
import { fleetSummary, tenantSli, type HealthSampleStore } from './observability/health'
import { SESSION_COOKIE, readSession, sealSession, type SessionData } from './session'

export interface ControlPlaneAppDeps {
  controlPlane: ControlPlane
  billing: BillingIdentityProvider
  /** Plan-subscription gateway (Stripe/fake). If unset, checkout/portal/webhook are 503. */
  payments?: TenantBillingGateway
  /** Device-grant store for the "claim your hub" flow. Defaults to in-memory. */
  deviceGrants?: DeviceGrantStore
  /** Fleet health samples (Phase 1 observability). If set, exposes /internal/fleet/health. */
  health?: HealthSampleStore
  /** Secret used to sign session cookies. If unset, the dashboard + auth callback are disabled. */
  sessionSecret?: string
  /** Absolute origin for building checkout success/cancel URLs (e.g. https://cloud.xnet.fyi). */
  baseUrl?: string
  /** Where to send the user after sign-out (the marketing site). */
  marketingUrl?: string
  /** Shared secret for internal routes; if unset, internal routes are disabled. */
  internalSecret?: string
  /** Injectable clock for deterministic tests. */
  nowMs?: () => number
}

interface ProvisionBody {
  tenantId?: string
  plan?: string
  billingUserId?: string
  challenge?: DidChallenge
  overrides?: Record<string, unknown>
  region?: string
}

/** Plans offered for self-serve checkout (free demo + contract enterprise excluded). */
const CHECKOUT_PLANS: { id: PlanId; label: string; price: string }[] = [
  { id: 'personal', label: 'Personal', price: '$5/mo' },
  { id: 'family', label: 'Family', price: '$15/mo' },
  { id: 'team', label: 'Team', price: '$12/seat/mo' }
]

export function createControlPlaneApp(deps: ControlPlaneAppDeps): Hono {
  const app = new Hono()
  const now = (): number => (deps.nowMs ? deps.nowMs() : Date.now())
  const base = deps.baseUrl ?? ''
  const devices = deps.deviceGrants ?? new MemoryDeviceGrantStore()

  /** Read + verify the session cookie, or null. */
  const session = (c: Context): SessionData | null => {
    if (!deps.sessionSecret) return null
    return readSession(deps.sessionSecret, getCookie(c, SESSION_COOKIE), { nowMs: now() })
  }

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'xnet-cloud', substrate: deps.controlPlane ? 'ready' : 'init' })
  )

  // ── Auth funnel ───────────────────────────────────────────────────────────

  // Start a WorkOS AuthKit sign-in. The marketing CTA passes `?plan=…`, which we
  // round-trip through `state` so the callback can land the user on checkout.
  app.get('/auth/start', (c) => {
    const state = c.req.query('plan') ?? c.req.query('state')
    const url = deps.billing.getAuthorizationUrl({
      screenHint: 'sign-in',
      ...(state ? { state } : {})
    })
    return c.redirect(url)
  })

  // Exchange the WorkOS code for a user and seal a session cookie (the hole 0180
  // flagged at server.ts:38). Lands on the dashboard, carrying any chosen plan.
  app.get('/auth/callback', async (c) => {
    if (!deps.sessionSecret) return c.json({ error: 'auth_not_configured' }, 503)
    const code = c.req.query('code')
    if (!code) return c.json({ error: 'missing_code' }, 400)
    let user
    try {
      const result = await deps.billing.authenticateWithCode(code)
      user = result.user
    } catch {
      return c.json({ error: 'invalid_code' }, 401)
    }
    const token = sealSession(deps.sessionSecret, {
      billingUserId: user.id,
      ...(user.email ? { email: user.email } : {}),
      issuedAtMs: now()
    })
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60
    })
    const plan = c.req.query('state')
    return c.redirect(
      plan ? `${base}/dashboard?plan=${encodeURIComponent(plan)}` : `${base}/dashboard`
    )
  })

  app.get('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.redirect(deps.marketingUrl ?? '/')
  })

  // ── Dashboard ───────────────────────────────────────────────────────────────

  app.get('/dashboard', async (c) => {
    const s = session(c)
    if (!s) return c.redirect('/auth/start')
    const tenant = await deps.controlPlane.getTenantForBilling(s.billingUserId)
    return c.html(
      renderDashboard({
        billingUserId: s.billingUserId,
        ...(s.email ? { email: s.email } : {}),
        tenant,
        checkoutPlans: CHECKOUT_PLANS,
        billingEnabled: Boolean(deps.payments)
      })
    )
  })

  // ── Checkout + portal + webhook ──────────────────────────────────────────────

  app.post('/checkout', async (c) => {
    const s = session(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    if (!deps.payments) return c.json({ error: 'billing_not_configured' }, 503)
    const body = await c.req.parseBody()
    const plan = String(body.plan ?? '')
    if (!CHECKOUT_PLANS.some((p) => p.id === plan)) return c.json({ error: 'bad_plan' }, 400)
    const out = await deps.payments.createCheckout({
      customerRef: s.billingUserId,
      plan: plan as PlanId,
      successUrl: `${base}/dashboard?provisioning=1`,
      cancelUrl: `${base}/dashboard`,
      ...(s.email ? { email: s.email } : {})
    })
    return c.redirect(out.url)
  })

  app.post('/portal', async (c) => {
    const s = session(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    if (!deps.payments) return c.json({ error: 'billing_not_configured' }, 503)
    const out = await deps.payments.createPortal({
      customerRef: s.billingUserId,
      returnUrl: `${base}/dashboard`
    })
    return c.redirect(out.url)
  })

  // Provider webhook — unauthenticated, verified by the gateway's signature check.
  // `checkout.completed` provisions a hub; `subscription.canceled` suspends it.
  app.post('/webhook', async (c) => {
    if (!deps.payments) return c.json({ error: 'billing_not_configured' }, 503)
    const raw = await c.req.text()
    const headers: Record<string, string> = {}
    c.req.raw.headers.forEach((v, k) => (headers[k] = v))
    let event
    try {
      event = await deps.payments.parseWebhook(raw, headers)
    } catch (err) {
      if (err instanceof WebhookSignatureError) return c.json({ error: 'bad_signature' }, 401)
      return c.json({ error: 'bad_webhook' }, 400)
    }
    if (event.type === 'checkout.completed') {
      await deps.controlPlane.provisionForBilling({
        plan: event.plan,
        billingUserId: event.customerRef
      })
    } else if (event.type === 'subscription.canceled') {
      const tenant = await deps.controlPlane.getTenantForBilling(event.customerRef)
      if (tenant) await deps.controlPlane.suspendTenant(tenant.tenantId)
    }
    return c.json({ received: true })
  })

  // ── Account management ────────────────────────────────────────────────────────

  app.post('/account/delete-data', async (c) => {
    const s = session(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    const tenant = await deps.controlPlane.getTenantForBilling(s.billingUserId)
    if (tenant) await deps.controlPlane.deleteTenant(tenant.tenantId)
    return c.redirect('/dashboard')
  })

  // ── Device-grant "claim your hub" flow (RFC 8628 shaped) ─────────────────────

  // The app (no WorkOS) starts a grant with its locally-created DID, then polls.
  app.post('/device/start', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { did?: string }
    if (!body.did) return c.json({ error: 'missing_did' }, 400)
    const grant = devices.start(body.did, now())
    return c.json({
      deviceCode: grant.deviceCode,
      userCode: grant.userCode,
      verificationUri: `${base}/claim`,
      intervalSec: 2,
      expiresInSec: 600
    })
  })

  // The app polls here with a DID challenge until the user approves the code.
  app.post('/device/token', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      deviceCode?: string
      challenge?: DidChallenge
    }
    if (!body.deviceCode || !body.challenge) return c.json({ error: 'bad_request' }, 400)
    const grant = devices.getByDeviceCode(body.deviceCode)
    if (!grant) return c.json({ error: 'invalid_grant' }, 400)
    if (isExpired(grant, now())) return c.json({ error: 'expired_token' }, 400)
    // The polled DID must be the one the grant was started with (and was shown).
    if (body.challenge.did !== grant.did) return c.json({ error: 'did_mismatch' }, 400)
    if (grant.status === 'pending') return c.json({ status: 'pending' })
    if (!grant.approvedBy) return c.json({ status: 'pending' })
    try {
      const tenant = await deps.controlPlane.bindDataIdentity({
        billingUserId: grant.approvedBy,
        challenge: body.challenge
      })
      devices.markClaimed(grant.deviceCode)
      return c.json({ status: 'complete', hubUrl: tenant.hubUrl })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 422)
    }
  })

  // The dashboard side: the signed-in user approves a device code (proves billing).
  app.get('/claim', (c) => {
    const s = session(c)
    if (!s) return c.redirect('/auth/start')
    return c.html(
      renderClaimForm({
        who: s.email ?? s.billingUserId,
        ...(c.req.query('code') ? { prefill: c.req.query('code') as string } : {})
      })
    )
  })

  app.post('/claim', async (c) => {
    const s = session(c)
    if (!s) return c.redirect('/auth/start')
    const body = await c.req.parseBody()
    const userCode = String(body.userCode ?? '')
    const grant = devices.approve(userCode, s.billingUserId)
    return c.html(renderClaimResult({ who: s.email ?? s.billingUserId, ok: Boolean(grant) }))
  })

  app.get('/tenants/:id', async (c) => {
    const record = await deps.controlPlane.getTenant(c.req.param('id'))
    if (!record) return c.json({ error: 'not_found' }, 404)
    return c.json(record)
  })

  // ── Internal routes (admin tooling) ──────────────────────────────────────────
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

  // Fleet observability — per-tenant SLIs + an aggregate (exploration 0193).
  app.get('/internal/fleet/health', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    if (!deps.health) return c.json({ error: 'observability_not_configured' }, 503)
    const tenants = await deps.controlPlane.listTenants()
    const live = tenants.filter((t) => t.dataTier === 'hot' && t.hubUrl)
    const slis = live.map((t) =>
      tenantSli(deps.health!, { tenantId: t.tenantId, plan: t.plan, hubUrl: t.hubUrl }, now())
    )
    return c.json({
      fleet: fleetSummary(slis),
      cold: tenants.length - live.length,
      tenants: slis
    })
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
