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
import type { UsageLedger } from '@xnetjs/cloud/billing'
import type { BillingIdentityProvider, DidChallenge } from '@xnetjs/cloud/identity'
import type { PlanId } from '@xnetjs/entitlements'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { parseAiBudgetForm } from './ai/budget-form'
import { createAiRoute, type AiChatDeps } from './ai/route'
import { WebhookSignatureError, type TenantBillingGateway } from './billing-gateway'
import { currentPeriodStartMs } from './control-plane'
import {
  renderClaimForm,
  renderClaimResult,
  renderDashboard,
  renderOverQuotaNotice,
  renderPlanChangeNotice,
  renderRecoverConfirm,
  renderRecoverResult
} from './dashboard'
import { MemoryDeviceGrantStore, isExpired, type DeviceGrantStore } from './device-grant'
import {
  createDiagnosticsRoutes,
  MemoryDebugReportStore,
  type DebugReportRecord,
  type DebugReportStore
} from './diagnostics'
import { composeDashboardLive, fetchHubHealth } from './hub-status'
import { createLogger, type Logger } from './logger'
import {
  collectUsage,
  httpHubUsageProbe,
  type HubUsageProbe,
  type StorageUsageReader
} from './metrics/usage'
import { MemoryNonceStore, type NonceStore } from './nonce'
import { fleetSummary, tenantSli, type HealthSampleStore } from './observability/health'
import { publicStatus } from './observability/status'
import { reportToSentry } from './sentry'
import { SESSION_COOKIE, readSession, sealSession, type SessionData } from './session'

export interface ControlPlaneAppDeps {
  controlPlane: ControlPlane
  billing: BillingIdentityProvider
  /** Plan-subscription gateway (Stripe/fake). If unset, checkout/portal/webhook are 503. */
  payments?: TenantBillingGateway
  /** Device-grant store for the "claim your hub" flow. Defaults to in-memory. */
  deviceGrants?: DeviceGrantStore
  /** Single-use challenge nonces for the device-claim flow (0243). Defaults to in-memory. */
  nonces?: NonceStore
  /** Fleet health samples (Phase 1 observability). If set, exposes /internal/fleet/health. */
  health?: HealthSampleStore
  /** Whether per-hub backups (Litestream→R2) are configured; surfaced on /status.json. */
  backupsConfigured?: boolean
  /** Managed AI chat deps. If set, exposes `POST /ai/chat` (metered gateway). */
  ai?: AiChatDeps
  /** Secret used to sign session cookies. If unset, the dashboard + auth callback are disabled. */
  sessionSecret?: string
  /** Absolute origin for building checkout success/cancel URLs (e.g. https://cloud.xnet.fyi). */
  baseUrl?: string
  /** Where to send the user after sign-out (the marketing site). */
  marketingUrl?: string
  /** Base URL of the hosted web app ("Open the app"). Defaults to the marketing app. */
  appUrl?: string
  /** Shared secret for internal routes; if unset, internal routes are disabled. */
  internalSecret?: string
  /** Optional bulk-storage reader (R2) for the `/open` usage snapshot's GB-stored (Tier 1). */
  usageStorage?: StorageUsageReader
  /** Optional per-hub usage probe; defaults to GETting each hot hub's `/health`. */
  usageHubStats?: HubUsageProbe
  /** Injectable clock for deterministic tests. */
  nowMs?: () => number
  /** Structured logger; defaults to a console JSON logger (exploration 0210). */
  logger?: Logger
  /**
   * Sentry DSN. When set, the global error handler also reports unhandled
   * errors to Sentry. This is the wiring seam — capture is gated on the DSN so
   * self-host/dev builds (no DSN) never phone home (exploration 0210).
   */
  sentryDsn?: string
  /** Debug-report quarantine (exploration 0315). Defaults to in-memory. */
  diagnostics?: DebugReportStore
  /** Fired on a first-seen crash fingerprint (the 0315 P4 alert seam). */
  onDiagnosticsFirstSeen?: (record: DebugReportRecord) => void
}

interface ProvisionBody {
  tenantId?: string
  plan?: string
  billingUserId?: string
  challenge?: DidChallenge
  overrides?: Record<string, unknown>
  region?: string
}

/** Stand-in ledger when managed AI isn't configured — usage AI totals read as zero. */
const EMPTY_USAGE_LEDGER: UsageLedger = {
  async record() {
    return { recorded: false }
  },
  async totalChargeUsd() {
    return 0
  },
  async entries() {
    return []
  }
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
  const nonces = deps.nonces ?? new MemoryNonceStore()
  const log = deps.logger ?? createLogger({ base: { service: 'xnet-cloud' } })

  // One structured line per request (method/path/status/ms), logged in a
  // `finally` so requests that throw are recorded too (exploration 0210).
  app.use('*', async (c, next) => {
    const startedAt = now()
    try {
      await next()
    } finally {
      log.info('request', {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: now() - startedAt
      })
    }
  })

  // Global safety net: every route already does its own try/catch, so this only
  // fires on a genuinely uncaught throw — log it, optionally report to Sentry,
  // and return a clean 500 instead of leaking a stack to the client.
  app.onError((err, c) => {
    log.error('unhandled', {
      method: c.req.method,
      path: c.req.path,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    })
    // Sentry seam (exploration 0210): the DSN gate keeps self-host/dev builds
    // from phoning home. Capture is wired when the @sentry/node SDK is added.
    if (deps.sentryDsn) reportToSentry(deps.sentryDsn, err)
    return c.json({ error: 'internal_error' }, 500)
  })

  /** Read + verify the session cookie, or null. */
  const session = (c: Context): SessionData | null => {
    if (!deps.sessionSecret) return null
    return readSession(deps.sessionSecret, getCookie(c, SESSION_COOKIE), { nowMs: now() })
  }

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'xnet-cloud', substrate: deps.controlPlane ? 'ready' : 'init' })
  )

  // Public, aggregate-only status (exploration 0201). Unauthenticated by design —
  // it feeds the marketing site's /status page — so it must never carry anything
  // tenant-identifying. We pass only per-tenant availability *numbers* into
  // `publicStatus`, which is structurally incapable of emitting an id or hub URL.
  app.get('/status.json', async (c) => {
    const tenants = await deps.controlPlane.listTenants()
    const hot = tenants.filter((t) => t.dataTier === 'hot' && t.hubUrl)
    const slis = deps.health
      ? hot.map((t) =>
          tenantSli(deps.health!, { tenantId: t.tenantId, plan: t.plan, hubUrl: t.hubUrl }, now())
        )
      : []
    const status = publicStatus({
      nowMs: now(),
      fleet: fleetSummary(slis),
      availabilities: slis.map((s) => s.availability),
      aiConfigured: Boolean(deps.ai),
      backupsHealthy: deps.backupsConfigured ? true : null
    })
    return c.json(status)
  })

  // Managed AI: `POST /ai/chat` (metered gateway). Mounted only when configured.
  if (deps.ai) app.route('/', createAiRoute(deps.ai))

  // Debug-report ingest + drain surface (exploration 0315): the public crash/
  // debug-report ingest, the socket the hub's diagnostics-sharing feature
  // forwards to, and the internal-secret-gated quarantine the operator's
  // signing client drains into debug-report nodes.
  app.route(
    '/',
    createDiagnosticsRoutes({
      store: deps.diagnostics ?? new MemoryDebugReportStore(),
      log,
      internalSecret: deps.internalSecret,
      onFirstSeen: deps.onDiagnosticsFirstSeen,
      nowMs: deps.nowMs
    })
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
    // Surface the period's AI spend when AI is wired and the tenant has it enabled.
    let aiUsage: { usedUsd: number; includedUsd: number; budgetUsd: number } | undefined
    if (tenant?.entitlements.aiEnabled && deps.ai) {
      const usedUsd = await deps.ai.ledger.totalChargeUsd(
        tenant.tenantId,
        currentPeriodStartMs(now())
      )
      aiUsage = {
        usedUsd,
        includedUsd: tenant.entitlements.includedAiUsd,
        budgetUsd: tenant.entitlements.aiMonthlyBudgetUsd
      }
    }
    return c.html(
      renderDashboard({
        billingUserId: s.billingUserId,
        ...(s.email ? { email: s.email } : {}),
        tenant,
        checkoutPlans: CHECKOUT_PLANS,
        billingEnabled: Boolean(deps.payments),
        appUrl: deps.appUrl ?? 'https://xnet.fyi/app',
        marketingUrl: deps.marketingUrl ?? 'https://xnet.fyi/cloud',
        gettingStartedHidden: getCookie(c, 'xnet_gs_hidden') === '1',
        ...(aiUsage ? { aiUsage } : {})
      })
    )
  })

  // Live tiles for the dashboard (exploration 0207): the tenant's hub status read
  // from its public /health, joined with the rolling SLI window + AI spend. Polled
  // by the dashboard; cached briefly so rapid polls don't fan out to the hub every
  // time, and timeout-bounded so a sleeping/slow hub never hangs the page.
  let liveCache: { at: number; key: string; body: unknown } | null = null
  app.get('/dashboard/live.json', async (c) => {
    const s = session(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    const tenant = await deps.controlPlane.getTenantForBilling(s.billingUserId)
    if (!tenant) return c.json({ state: 'none', reachable: false })
    if (liveCache && liveCache.key === tenant.tenantId && now() - liveCache.at < 8000) {
      return c.json(liveCache.body as Record<string, unknown>)
    }
    const health =
      tenant.hubUrl && tenant.dataTier === 'hot'
        ? await fetchHubHealth(tenant.hubUrl, { timeoutMs: 2500 })
        : null
    const sli =
      deps.health && tenant.hubUrl
        ? tenantSli(
            deps.health,
            { tenantId: tenant.tenantId, plan: tenant.plan, hubUrl: tenant.hubUrl },
            now()
          )
        : null
    const aiUsedUsd =
      tenant.entitlements.aiEnabled && deps.ai
        ? await deps.ai.ledger.totalChargeUsd(tenant.tenantId, currentPeriodStartMs(now()))
        : null
    const body = composeDashboardLive({
      health,
      sli,
      aiUsedUsd,
      quotaBytes: tenant.entitlements.quotaBytes,
      ...(tenant.subscriptionStatus ? { subscriptionStatus: tenant.subscriptionStatus } : {}),
      dataTier: tenant.dataTier
    })
    liveCache = { at: now(), key: tenant.tenantId, body }
    return c.json(body)
  })

  // Self-serve plan change for the signed-in tenant. An in-tier change applies
  // live (entitlement flip); a tier crossing returns a migration-required notice
  // rather than silently moving data. A downgrade whose data won't fit the smaller
  // plan returns an over-quota notice (free space / wipe) rather than silently
  // shrinking the quota. (Explorations 0200 slice B, 0216.)
  app.post('/account/plan', async (c) => {
    const s = session(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    const tenant = await deps.controlPlane.getTenantForBilling(s.billingUserId)
    if (!tenant) return c.redirect('/dashboard')
    const body = await c.req.parseBody()
    const plan = String(body.plan ?? '')
    if (!CHECKOUT_PLANS.some((p) => p.id === plan)) return c.json({ error: 'bad_plan' }, 400)
    const who = s.email ?? s.billingUserId
    const result = await deps.controlPlane.changePlan(tenant.tenantId, plan as PlanId)
    if (result.kind === 'migration-required') {
      return c.html(renderPlanChangeNotice({ who, from: result.from.plan, to: result.to.plan }))
    }
    if (result.kind === 'over-quota') {
      return c.html(
        renderOverQuotaNotice({
          who,
          from: result.from.plan,
          to: result.to.plan,
          usedBytes: result.usedBytes,
          targetQuotaBytes: result.targetQuotaBytes,
          reclaimBytes: result.reclaimBytes,
          ...(deps.appUrl ? { appUrl: deps.appUrl } : {})
        })
      )
    }
    return c.redirect('/dashboard')
  })

  // Self-serve managed-AI spend cap: the user sets how much they're willing to
  // spend per week / month / rolling-N-days; the metered gateway stops calls at
  // that limit (exploration 0244). Clamped server-side to ≤ the plan cap.
  app.post('/account/ai-budget', async (c) => {
    const s = session(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    const tenant = await deps.controlPlane.getTenantForBilling(s.billingUserId)
    if (!tenant) return c.redirect('/dashboard')
    const parsed = parseAiBudgetForm(await c.req.parseBody())
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    await deps.controlPlane.setAiBudget(tenant.tenantId, parsed.budget)
    return c.redirect('/dashboard')
  })

  // Confirmed "wipe & start fresh" downgrade: only reachable from the over-quota
  // notice, requires an explicit confirm field, and destroys all data to boot an
  // empty hub at the smaller plan. The dashboard double-confirms before posting.
  app.post('/account/plan/wipe', async (c) => {
    const s = session(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    const tenant = await deps.controlPlane.getTenantForBilling(s.billingUserId)
    if (!tenant) return c.redirect('/dashboard')
    const body = await c.req.parseBody()
    const plan = String(body.plan ?? '')
    if (String(body.confirm ?? '') !== 'wipe') return c.json({ error: 'confirm_required' }, 400)
    if (!CHECKOUT_PLANS.some((p) => p.id === plan)) return c.json({ error: 'bad_plan' }, 400)
    await deps.controlPlane.wipeAndChangePlan(tenant.tenantId, plan as PlanId)
    return c.redirect('/dashboard')
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
  // Provider-scoped path so each provider gets its own endpoint + signature scheme
  // (Stripe now, e.g. BTCPay later); `/webhook` kept as a back-compat alias. Only
  // v1 snapshot events are handled — `checkout.completed` provisions a hub,
  // `subscription.canceled` suspends it. (Stripe v2 "thin" event destinations, if
  // ever adopted, would get their own endpoint — see exploration 0192 / SETUP.)
  const billingWebhook = async (c: Context): Promise<Response> => {
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
    } else if (event.type === 'payment_failed') {
      // Dunning begins (exploration 0260): open grace, keep serving while Stripe retries.
      await deps.controlPlane.recordBillingEvent(event.customerRef, { kind: 'payment_failed' })
    } else if (event.type === 'payment_recovered') {
      await deps.controlPlane.recordBillingEvent(event.customerRef, { kind: 'payment_recovered' })
    } else if (event.type === 'subscription_status') {
      await deps.controlPlane.recordBillingEvent(event.customerRef, {
        kind: 'subscription_status',
        status: event.status
      })
    }
    return c.json({ received: true })
  }
  app.post('/webhooks/stripe', billingWebhook)
  app.post('/webhook', billingWebhook) // deprecated alias for the canonical path above

  // ── Account management ────────────────────────────────────────────────────────

  app.post('/account/delete-data', async (c) => {
    const s = session(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    const tenant = await deps.controlPlane.getTenantForBilling(s.billingUserId)
    if (tenant) await deps.controlPlane.deleteTenant(tenant.tenantId)
    return c.redirect('/dashboard')
  })

  // Account recovery off the billing identity alone (exploration 0243). The signed-in
  // WorkOS session IS the proof; recovery keeps the subscription + hub, clears the bound
  // DID, and marks the binding for rebind. It does NOT recover the old encrypted data —
  // the confirmation page says so before the user commits.
  app.get('/account/recover', (c) => {
    const s = session(c)
    if (!s) return c.redirect('/auth/start')
    return c.html(renderRecoverConfirm({ who: s.email ?? s.billingUserId }))
  })

  app.post('/account/recover', async (c) => {
    const s = session(c)
    if (!s) return c.redirect('/auth/start')
    try {
      await deps.controlPlane.recoverAccount(s.billingUserId)
      return c.html(renderRecoverResult({ who: s.email ?? s.billingUserId, ok: true }))
    } catch {
      return c.html(renderRecoverResult({ who: s.email ?? s.billingUserId, ok: false }))
    }
  })

  // ── Device-grant "claim your hub" flow (RFC 8628 shaped) ─────────────────────

  // The app (no WorkOS) starts a grant with its locally-created DID, then polls.
  app.post('/device/start', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { did?: string }
    if (!body.did) return c.json({ error: 'missing_did' }, 400)
    const grant = devices.start(body.did, now())
    // Mint a single-use nonce bound to this flow; the app signs it with its DID key.
    const issued = await nonces.issue(grant.deviceCode, now())
    return c.json({
      deviceCode: grant.deviceCode,
      userCode: grant.userCode,
      nonce: issued.nonce,
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
    // Don't consume the nonce while pending — the app polls repeatedly with the same
    // signed challenge until the user approves the code.
    if (grant.status === 'pending' || !grant.approvedBy) return c.json({ status: 'pending' })
    // Single-use: the nonce must be unconsumed, unexpired, and bound to THIS flow.
    const claim = await nonces.consume(body.challenge.nonce, now())
    if (!claim || claim.deviceCode !== grant.deviceCode) {
      return c.json({ error: 'invalid_nonce' }, 400)
    }
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

  // Public usage/scale totals for the marketing `/open` dashboard (exploration 0207).
  // Aggregate-only by construction — `collectUsage` emits fleet sums, never a tenant
  // id — and the weekly publish gate re-applies the cohort floor before anything lands
  // in the committed snapshot. Probes only hot hubs (cold ones would cold-start).
  app.get('/internal/metrics/usage', async (c) => {
    if (!requireInternal(c)) return c.json({ error: 'forbidden' }, 403)
    const usage = await collectUsage({
      listTenants: () => deps.controlPlane.listTenants(),
      ledger: deps.ai?.ledger ?? EMPTY_USAGE_LEDGER,
      hubStats: deps.usageHubStats ?? httpHubUsageProbe(),
      ...(deps.usageStorage ? { storage: deps.usageStorage } : {})
    })
    return c.json(usage)
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
