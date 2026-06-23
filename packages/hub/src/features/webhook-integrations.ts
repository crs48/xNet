/**
 * @xnetjs/hub — signed integration webhooks: Stripe, Sentry, PagerDuty
 * (exploration 0213).
 *
 * Each is a {@link DeclarativeWebhook}: verify the provider's HMAC signature,
 * then a *pure* normalizer turns the delivery into `IntegrationWebhookAction[]`
 * — provenance-tagged descriptors that map one-to-one onto the `ExternalItem`
 * schema (source / kind / externalId / title / url / status). Applying those
 * actions to nodes needs the server-authoritative write path the hub defers
 * (see `tasksFeature`), so the `apply` callback stays an injected seam: when an
 * app provides it, normalized actions materialize; otherwise they are reported
 * and discarded (`{ ok, actions }`), exactly like the GitHub webhook today.
 *
 * The normalizers are pure and exported so they can be unit-tested with captured
 * payloads without standing up a hub.
 */

import type { HubFeature } from './types'
import {
  verifyPagerDutySignature,
  verifySentrySignature,
  verifyStripeSignature
} from './webhook-verify'

/** A provenance-tagged action mapping onto the `ExternalItem` schema. */
export interface IntegrationWebhookAction {
  source: 'stripe' | 'sentry' | 'pagerduty'
  /** Provider event/object kind, e.g. `payment_intent.succeeded`, `incident.triggered`. */
  kind: string
  /** Stable id in the source system (event or object id). */
  externalId: string
  /** Human-readable one-line summary. */
  title: string
  /** Link back to the source object, when the payload carries one. */
  url?: string
  /** Free-form status string from the source. */
  status?: string
}

type ApplyActions = (actions: IntegrationWebhookAction[]) => Promise<void>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

/** Normalize a Stripe `Event` (`{ id, type, data: { object } }`). */
export function normalizeStripeEvent(payload: unknown): IntegrationWebhookAction[] {
  if (!isRecord(payload)) return []
  const type = str(payload.type)
  const id = str(payload.id)
  if (!type || !id) return []
  const object = isRecord(payload.data) && isRecord(payload.data.object) ? payload.data.object : {}
  return [
    {
      source: 'stripe',
      kind: type,
      externalId: id,
      title: `Stripe ${type}`,
      ...(str(object.status) ? { status: str(object.status) } : {})
    }
  ]
}

/**
 * Stripe webhook. Verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`.
 * 503 when the secret is unset.
 */
export function stripeFeature(apply?: ApplyActions): HubFeature {
  return {
    id: 'fyi.xnet.stripe',
    secrets: ['STRIPE_WEBHOOK_SECRET'],
    webhooks: [
      {
        path: '/integrations/stripe/webhook',
        secretRef: 'STRIPE_WEBHOOK_SECRET',
        notConfiguredMessage: 'Stripe integration is not configured',
        verify: (rawBody, headers, secret) =>
          verifyStripeSignature({
            secret,
            rawBody,
            signatureHeader: headers['stripe-signature']
          }),
        normalize: (_headers, payload) => normalizeStripeEvent(payload),
        ...(apply ? { apply: (actions) => apply(actions as IntegrationWebhookAction[]) } : {})
      }
    ]
  }
}

// ─── Sentry ──────────────────────────────────────────────────────────────────

/** Normalize a Sentry issue-alert webhook (`{ action, data: { issue } }`). */
export function normalizeSentryEvent(payload: unknown): IntegrationWebhookAction[] {
  if (!isRecord(payload)) return []
  const data = isRecord(payload.data) ? payload.data : {}
  const issue = isRecord(data.issue) ? data.issue : undefined
  if (!issue) return []
  const id = str(issue.id)
  const title = str(issue.title)
  if (!id || !title) return []
  const action = str(payload.action) ?? 'event'
  return [
    {
      source: 'sentry',
      kind: `issue.${action}`,
      externalId: id,
      title,
      ...(str(issue.permalink) ? { url: str(issue.permalink) } : {}),
      ...(str(issue.level) ? { status: str(issue.level) } : {})
    }
  ]
}

/**
 * Sentry webhook. Verifies `Sentry-Hook-Signature` against
 * `SENTRY_WEBHOOK_SECRET`. 503 when the secret is unset.
 */
export function sentryFeature(apply?: ApplyActions): HubFeature {
  return {
    id: 'fyi.xnet.sentry',
    secrets: ['SENTRY_WEBHOOK_SECRET'],
    webhooks: [
      {
        path: '/integrations/sentry/webhook',
        secretRef: 'SENTRY_WEBHOOK_SECRET',
        notConfiguredMessage: 'Sentry integration is not configured',
        verify: (rawBody, headers, secret) =>
          verifySentrySignature(secret, rawBody, headers['sentry-hook-signature']),
        normalize: (_headers, payload) => normalizeSentryEvent(payload),
        ...(apply ? { apply: (actions) => apply(actions as IntegrationWebhookAction[]) } : {})
      }
    ]
  }
}

// ─── PagerDuty ───────────────────────────────────────────────────────────────

/** Normalize a PagerDuty v3 webhook (`{ event: { event_type, data } }`). */
export function normalizePagerDutyEvent(payload: unknown): IntegrationWebhookAction[] {
  if (!isRecord(payload)) return []
  const event = isRecord(payload.event) ? payload.event : undefined
  if (!event) return []
  const kind = str(event.event_type)
  const data = isRecord(event.data) ? event.data : {}
  const id = str(data.id) ?? str(event.id)
  const title = str(data.title) ?? str(data.summary)
  if (!kind || !id || !title) return []
  return [
    {
      source: 'pagerduty',
      kind,
      externalId: id,
      title,
      ...(str(data.html_url) ? { url: str(data.html_url) } : {}),
      ...(str(data.status) ? { status: str(data.status) } : {})
    }
  ]
}

/**
 * PagerDuty webhook. Verifies `X-PagerDuty-Signature` against
 * `PAGERDUTY_WEBHOOK_SECRET`. 503 when the secret is unset.
 */
export function pagerdutyFeature(apply?: ApplyActions): HubFeature {
  return {
    id: 'fyi.xnet.pagerduty',
    secrets: ['PAGERDUTY_WEBHOOK_SECRET'],
    webhooks: [
      {
        path: '/integrations/pagerduty/webhook',
        secretRef: 'PAGERDUTY_WEBHOOK_SECRET',
        notConfiguredMessage: 'PagerDuty integration is not configured',
        verify: (rawBody, headers, secret) =>
          verifyPagerDutySignature(secret, rawBody, headers['x-pagerduty-signature']),
        normalize: (_headers, payload) => normalizePagerDutyEvent(payload),
        ...(apply ? { apply: (actions) => apply(actions as IntegrationWebhookAction[]) } : {})
      }
    ]
  }
}
