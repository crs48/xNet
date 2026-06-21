/**
 * Tests for the opt-in diagnostics-sharing feature (exploration 0210).
 *
 * Mounted on a bare Hono app with an injected `fetch` and an auth stub that sets
 * the sender DID. We assert (a) the boolean probe, (b) that the report route is
 * absent when unconfigured (off by default), (c) that an enabled report is
 * forwarded with the internal secret, the DID hashed (never raw), and the body
 * bounded, and (d) graceful 502 when the sink is unreachable.
 */

import type { MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { diagnosticsSharingFeature } from './diagnostics-sharing'

const authAs =
  (did: string): MiddlewareHandler =>
  async (c, next) => {
    c.set('auth', { did })
    await next()
  }

const CONFIGURED = {
  XNET_DIAGNOSTICS_URL: 'https://cloud.example/',
  XNET_DIAGNOSTICS_SECRET: 'shh'
}

function mount(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  did = 'did:key:alice'
) {
  const app = new Hono()
  diagnosticsSharingFeature({ fetchImpl }).mount?.({
    app,
    env,
    requireAuth: authAs(did),
    storage: 'memory',
    dataDir: '/tmp',
    appUrl: 'https://app.example'
  })
  return app
}

const upstreamOk = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('diagnosticsSharingFeature', () => {
  it('reports sharing:false and mounts no report route when unconfigured', async () => {
    const app = mount({}, upstreamOk({}))
    expect(await (await app.request('/diagnostics/health')).json()).toEqual({
      ok: true,
      sharing: false
    })
    const report = await app.request('/diagnostics/report', { method: 'POST', body: '{}' })
    expect(report.status).toBe(404)
  })

  it('reports sharing:true when configured', async () => {
    const app = mount(CONFIGURED, upstreamOk({}))
    expect(await (await app.request('/diagnostics/health')).json()).toEqual({
      ok: true,
      sharing: true
    })
  })

  it('forwards a scrubbed report with a hashed DID and the internal secret', async () => {
    const fetchImpl = upstreamOk({ accepted: true })
    const app = mount(CONFIGURED, fetchImpl)
    const res = await app.request('/diagnostics/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ exceptionType: 'Error', exceptionMessage: 'boom' })
    })
    expect(res.status).toBe(200)

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://cloud.example/diagnostics') // trailing slash trimmed
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['x-internal-secret']).toBe('shh')

    const sent = JSON.parse((init as RequestInit).body as string)
    // The raw DID must never be forwarded — only a hash.
    expect(sent.didHash).toBeTruthy()
    expect(sent.didHash).not.toContain('did:key:alice')
    expect(JSON.parse(sent.report).exceptionMessage).toBe('boom')
  })

  it('forwards no DID hash for an anonymous sender', async () => {
    const fetchImpl = upstreamOk({ accepted: true })
    const app = mount(CONFIGURED, fetchImpl, 'did:key:anonymous')
    await app.request('/diagnostics/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ exceptionType: 'Error', exceptionMessage: 'x' })
    })
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string).didHash).toBeNull()
  })

  it('returns 502 when the sink is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const app = mount(CONFIGURED, fetchImpl)
    const res = await app.request('/diagnostics/report', { method: 'POST', body: '{}' })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('diagnostics_unreachable')
  })
})
