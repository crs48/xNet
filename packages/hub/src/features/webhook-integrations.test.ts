import { createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { mountWebhook } from './webhooks'
import {
  normalizePagerDutyEvent,
  normalizeSentryEvent,
  normalizeStripeEvent,
  pagerdutyFeature,
  sentryFeature,
  stripeFeature,
  type IntegrationWebhookAction
} from './webhook-integrations'

describe('normalizeStripeEvent', () => {
  it('maps an event onto an ExternalItem-shaped action', () => {
    const actions = normalizeStripeEvent({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { status: 'succeeded' } }
    })
    expect(actions).toEqual([
      {
        source: 'stripe',
        kind: 'payment_intent.succeeded',
        externalId: 'evt_1',
        title: 'Stripe payment_intent.succeeded',
        status: 'succeeded'
      }
    ])
  })
  it('ignores malformed payloads', () => {
    expect(normalizeStripeEvent(null)).toEqual([])
    expect(normalizeStripeEvent({ type: 'x' })).toEqual([])
  })
})

describe('normalizeSentryEvent', () => {
  it('maps an issue alert onto an action', () => {
    const actions = normalizeSentryEvent({
      action: 'created',
      data: {
        issue: {
          id: '42',
          title: 'TypeError: boom',
          permalink: 'https://x/issues/42',
          level: 'error'
        }
      }
    })
    expect(actions).toEqual([
      {
        source: 'sentry',
        kind: 'issue.created',
        externalId: '42',
        title: 'TypeError: boom',
        url: 'https://x/issues/42',
        status: 'error'
      }
    ])
  })
  it('ignores payloads without an issue', () => {
    expect(normalizeSentryEvent({ action: 'created', data: {} })).toEqual([])
  })
})

describe('normalizePagerDutyEvent', () => {
  it('maps an incident event onto an action', () => {
    const actions = normalizePagerDutyEvent({
      event: {
        event_type: 'incident.triggered',
        data: { id: 'PINC1', title: 'DB down', status: 'triggered', html_url: 'https://pd/PINC1' }
      }
    })
    expect(actions).toEqual([
      {
        source: 'pagerduty',
        kind: 'incident.triggered',
        externalId: 'PINC1',
        title: 'DB down',
        url: 'https://pd/PINC1',
        status: 'triggered'
      }
    ])
  })
  it('ignores payloads without an event', () => {
    expect(normalizePagerDutyEvent({})).toEqual([])
  })
})

describe('stripeFeature webhook (end to end through mountWebhook)', () => {
  const secret = 'whsec_test'
  const body = JSON.stringify({ id: 'evt_9', type: 'charge.refunded', data: { object: {} } })
  const now = Math.floor(Date.now() / 1000)
  const sig = `t=${now},v1=${createHmac('sha256', secret).update(`${now}.${body}`).digest('hex')}`

  function mountStripe(apply?: (a: IntegrationWebhookAction[]) => Promise<void>): Hono {
    const app = new Hono()
    const feature = stripeFeature(apply)
    mountWebhook(app, feature.webhooks![0], { STRIPE_WEBHOOK_SECRET: secret })
    return app
  }

  it('503s when the secret is not configured', async () => {
    const app = new Hono()
    mountWebhook(app, stripeFeature().webhooks![0], {})
    const res = await app.request('/integrations/stripe/webhook', { method: 'POST', body })
    expect(res.status).toBe(503)
  })

  it('401s a bad signature', async () => {
    const app = mountStripe()
    const res = await app.request('/integrations/stripe/webhook', {
      method: 'POST',
      body,
      headers: { 'stripe-signature': 't=1,v1=bad' }
    })
    expect(res.status).toBe(401)
  })

  it('200s and applies a valid signed delivery', async () => {
    const applied: IntegrationWebhookAction[][] = []
    const app = mountStripe(async (a) => {
      applied.push(a)
    })
    const res = await app.request('/integrations/stripe/webhook', {
      method: 'POST',
      body,
      headers: { 'stripe-signature': sig }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, actions: 1 })
    expect(applied[0][0]).toMatchObject({ source: 'stripe', kind: 'charge.refunded' })
  })
})

describe('sentry + pagerduty features are well-formed', () => {
  it('declare their secret + a single webhook each', () => {
    for (const f of [sentryFeature(), pagerdutyFeature()]) {
      expect(f.secrets?.length).toBe(1)
      expect(f.webhooks?.length).toBe(1)
    }
  })
})
