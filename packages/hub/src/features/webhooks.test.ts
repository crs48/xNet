import type { Env } from './broker'
import { createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { mountWebhook, type DeclarativeWebhook } from './webhooks'

const sign = (body: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const webhook: DeclarativeWebhook = {
  path: '/hook',
  secretRef: 'SECRET',
  verify: (raw, headers, secret) => headers['x-sig'] === sign(raw, secret),
  normalize: (headers, payload) => (headers['x-event'] === 'go' ? [payload] : [])
}

function mount(env: Env, wh: DeclarativeWebhook = webhook): Hono {
  const app = new Hono()
  mountWebhook(app, wh, env)
  return app
}

describe('mountWebhook', () => {
  it('answers 503 when the secret is not granted', async () => {
    const res = await mount({}).request('/hook', { method: 'POST', body: '{}' })
    expect(res.status).toBe(503)
  })

  it('answers 401 on a bad signature', async () => {
    const res = await mount({ SECRET: 's' }).request('/hook', {
      method: 'POST',
      body: '{}',
      headers: { 'x-sig': 'sha256=wrong' }
    })
    expect(res.status).toBe(401)
  })

  it('answers 400 on bad JSON (valid signature)', async () => {
    const body = 'not json'
    const res = await mount({ SECRET: 's' }).request('/hook', {
      method: 'POST',
      body,
      headers: { 'x-sig': sign(body, 's') }
    })
    expect(res.status).toBe(400)
  })

  it('answers 200 with the action count and applies the actions', async () => {
    const applied: unknown[][] = []
    const app = mount(
      { SECRET: 's' },
      {
        ...webhook,
        apply: async (actions) => {
          applied.push(actions)
        }
      }
    )
    const body = JSON.stringify({ n: 1 })
    const res = await app.request('/hook', {
      method: 'POST',
      body,
      headers: { 'x-sig': sign(body, 's'), 'x-event': 'go' }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, actions: 1 })
    expect(applied).toEqual([[{ n: 1 }]])
  })

  it('does NOT call apply when normalize yields zero actions', async () => {
    let applyCalls = 0
    const app = mount(
      { SECRET: 's' },
      {
        ...webhook,
        apply: async () => {
          applyCalls++
        }
      }
    )
    const body = JSON.stringify({ n: 1 })
    // No 'x-event: go' header → normalize returns [] → apply must be skipped.
    const res = await app.request('/hook', {
      method: 'POST',
      body,
      headers: { 'x-sig': sign(body, 's') }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, actions: 0 })
    expect(applyCalls).toBe(0)
  })

  it('skips the secret gate when no secretRef is declared', async () => {
    const open: DeclarativeWebhook = { path: '/open', verify: () => true, normalize: () => [] }
    const res = await mount({}, open).request('/open', { method: 'POST', body: '{}' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, actions: 0 })
  })
})
