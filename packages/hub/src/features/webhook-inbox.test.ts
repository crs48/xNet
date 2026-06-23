import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import {
  webhookInboxFeature,
  type WebhookInboxDelivery,
  type WebhookInboxRoute
} from './webhook-inbox'

function mount(ports: Parameters<typeof webhookInboxFeature>[0]): Hono {
  const app = new Hono()
  const feature = webhookInboxFeature(ports)
  feature.mount?.({
    app,
    env: {},
    requireAuth: (async (_c: unknown, next: () => Promise<void>) => next()) as never,
    storage: 'memory',
    dataDir: '/tmp',
    appUrl: 'http://localhost'
  })
  return app
}

const route: WebhookInboxRoute = { space: 'space-1', label: 'zapier' }

describe('webhookInboxFeature', () => {
  it('delivers a JSON payload for a known token', async () => {
    const delivered: WebhookInboxDelivery[] = []
    const app = mount({
      resolveToken: (token) => (token === 'good' ? route : null),
      deliver: async (d) => {
        delivered.push(d)
      }
    })
    const res = await app.request('/hooks/good', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'content-type': 'application/json' }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(delivered).toEqual([{ token: 'good', route, payload: { hello: 'world' } }])
  })

  it('404s an unknown/revoked token without calling deliver', async () => {
    const deliver = vi.fn()
    const app = mount({ resolveToken: () => null, deliver })
    const res = await app.request('/hooks/revoked', { method: 'POST', body: '{}' })
    expect(res.status).toBe(404)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('400s a non-JSON body for a known token', async () => {
    const deliver = vi.fn()
    const app = mount({ resolveToken: () => route, deliver })
    const res = await app.request('/hooks/good', { method: 'POST', body: 'not json' })
    expect(res.status).toBe(400)
    expect(deliver).not.toHaveBeenCalled()
  })
})
