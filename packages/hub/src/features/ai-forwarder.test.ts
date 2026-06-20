/**
 * Tests for the managed-AI forwarder feature (exploration 0208).
 *
 * The feature is mounted onto a bare Hono app with a permissive `requireAuth`
 * stub and an injected `fetch`, so we assert (a) the availability probe, (b) that
 * the tenant credential is injected upstream and never required of the caller, and
 * (c) graceful degradation when the control plane is unconfigured/unreachable.
 */

import type { MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { aiForwarderFeature } from './ai-forwarder'

const passAuth: MiddlewareHandler = async (_c, next) => {
  await next()
}

const CONFIGURED = {
  XNET_CLOUD_URL: 'https://cloud.example/',
  XNET_CLOUD_INTERNAL_SECRET: 'shh',
  XNET_TENANT_ID: 't-123'
}

function mount(env: Record<string, string | undefined>, fetchImpl: typeof fetch) {
  const app = new Hono()
  aiForwarderFeature({ fetchImpl }).mount?.({
    app,
    env,
    requireAuth: passAuth,
    storage: 'memory',
    dataDir: '/tmp',
    appUrl: 'https://app.example'
  })
  return app
}

const upstreamOk = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('aiForwarderFeature', () => {
  it('reports managed:true on /ai/health when configured', async () => {
    const app = mount(CONFIGURED, upstreamOk({}))
    const res = await app.request('/ai/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, managed: true })
  })

  it('reports managed:false when the control plane is not configured', async () => {
    const app = mount({}, upstreamOk({}))
    expect(await (await app.request('/ai/health')).json()).toEqual({ ok: true, managed: false })
    // ...and the chat route is never mounted (404, not a forward).
    const chat = await app.request('/ai/chat', { method: 'POST', body: '{}' })
    expect(chat.status).toBe(404)
  })

  it('forwards /ai/chat upstream with the injected tenant credential', async () => {
    const fetchImpl = upstreamOk({ text: 'hi', model: 'm', spendThisPeriodUsd: 1 })
    const app = mount(CONFIGURED, fetchImpl)
    const res = await app.request('/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'anthropic/claude-sonnet-4-6', messages: [] })
    })
    expect(res.status).toBe(200)
    expect((await res.json()).text).toBe('hi')

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://cloud.example/ai/chat') // trailing slash trimmed
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['x-internal-secret']).toBe('shh')
    expect(headers['x-tenant-id']).toBe('t-123')
    expect(JSON.parse((init as RequestInit).body as string).model).toBe(
      'anthropic/claude-sonnet-4-6'
    )
  })

  it('passes the upstream status through (e.g. a 402 budget stop)', async () => {
    const app = mount(CONFIGURED, upstreamOk({ error: 'ai_budget_exceeded' }, 402))
    const res = await app.request('/ai/chat', { method: 'POST', body: '{}' })
    expect(res.status).toBe(402)
    expect((await res.json()).error).toBe('ai_budget_exceeded')
  })

  it('returns 502 when the control plane is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const app = mount(CONFIGURED, fetchImpl)
    const res = await app.request('/ai/chat', { method: 'POST', body: '{}' })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('managed_ai_unreachable')
  })

  it('forwards /ai/models as a GET upstream', async () => {
    const fetchImpl = upstreamOk({ models: [{ id: 'anthropic/claude-sonnet-4-6' }] })
    const app = mount(CONFIGURED, fetchImpl)
    const res = await app.request('/ai/models')
    expect(res.status).toBe(200)
    expect((await res.json()).models).toHaveLength(1)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://cloud.example/ai/models')
    expect((init as RequestInit).method).toBe('GET')
  })
})
