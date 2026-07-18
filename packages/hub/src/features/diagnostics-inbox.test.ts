/**
 * Tests for the diagnostics-inbox feature (exploration 0341).
 *
 * Mounted on a bare Hono app with the in-memory store and an auth stub that
 * carries a `can()` capability check, mirroring the hub's AuthContext. Covers:
 * the public ingest (dedupe, caps, rate limit), the env-mode gate
 * (open/authed/off), the drain surface's admin gating, the summary's
 * secret-or-admin dual auth, and quarantine-full backpressure.
 */

import type { MiddlewareHandler } from 'hono'
import { MemoryDebugReportStore, type DebugReportStore } from '@xnetjs/telemetry/inbox'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { diagnosticsInboxFeature, type DiagnosticsInboxOptions } from './diagnostics-inbox'

const authAs =
  (did: string, admin: boolean): MiddlewareHandler =>
  async (c, next) => {
    c.set('auth', { did, can: (cap: string) => admin && cap === 'hub/admin' })
    await next()
  }

const deny: MiddlewareHandler = async (c) => c.json({ error: 'unauthorized' }, 401)

function mount(
  options: DiagnosticsInboxOptions & {
    env?: Record<string, string | undefined>
    auth?: MiddlewareHandler
  } = {}
) {
  const { env = {}, auth = authAs('did:key:op', true), ...featureOptions } = options
  const store = featureOptions.store ?? new MemoryDebugReportStore()
  const app = new Hono()
  diagnosticsInboxFeature({ ...featureOptions, store }).mount?.({
    app,
    env,
    requireAuth: auth,
    storage: 'memory',
    dataDir: '/tmp',
    appUrl: 'https://app.example'
  })
  return { app, store }
}

const ping = (over: Record<string, unknown> = {}) => ({
  lane: 'auto',
  errorName: 'TypeError',
  message: 'boom',
  stack: 'at explode (app.js:1:2)',
  release: 'web-1.42',
  surface: 'web',
  ...over
})

const post = (app: Hono, path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })

describe('diagnosticsInboxFeature — ingest', () => {
  it('accepts a crash ping and dedupes repeats by fingerprint', async () => {
    const { app, store } = mount()
    const first = await post(app, '/diagnostics/ingest', ping())
    expect(first.status).toBe(202)
    const { id, shortId } = await first.json()
    expect(id).toMatch(/^dr_/)
    expect(shortId).toMatch(/^XR-/)

    const second = await post(app, '/diagnostics/ingest', ping())
    expect(second.status).toBe(202)
    expect((await second.json()).id).toBe(id)

    const record = await store.get(id)
    expect(record?.occurrences).toBe(2)
    expect(record?.status).toBe('pending')
  })

  it('stamps a release-independent issueKey so releases split but issues persist', async () => {
    const { app, store } = mount()
    const a = await (await post(app, '/diagnostics/ingest', ping())).json()
    const b = await (await post(app, '/diagnostics/ingest', ping({ release: 'web-1.43' }))).json()
    expect(b.id).not.toBe(a.id) // release is part of the fingerprint…
    const [ra, rb] = [await store.get(a.id), await store.get(b.id)]
    expect(ra?.issueKey).toBeTruthy()
    expect(ra?.issueKey).toBe(rb?.issueKey) // …but not of the issue identity
  })

  it('rejects oversized (413), invalid (400), and junk-stripped payloads', async () => {
    const { app } = mount()
    const big = await post(app, '/diagnostics/ingest', {
      ...ping(),
      stack: 'x'.repeat(9_000)
    })
    expect(big.status).toBe(413)

    expect((await post(app, '/diagnostics/ingest', 'not json{')).status).toBe(400)
    expect((await post(app, '/diagnostics/ingest', { lane: 'auto' })).status).toBe(400)
  })

  it('strips unknown fields through the allowlist', async () => {
    const { app, store } = mount()
    const res = await post(app, '/diagnostics/ingest', {
      ...ping(),
      documentContent: 'SECRET WORKSPACE DATA',
      email: 'a@b.c'
    })
    const { id } = await res.json()
    const record = await store.get(id)
    expect(JSON.stringify(record)).not.toContain('SECRET WORKSPACE DATA')
  })

  it('rate-limits a flooding client IP with 429', async () => {
    const { app } = mount({ ingestRateLimit: { maxAttempts: 2, windowMs: 60_000 } })
    const from = { 'x-forwarded-for': '203.0.113.9' }
    expect((await post(app, '/diagnostics/ingest', ping(), from)).status).toBe(202)
    expect((await post(app, '/diagnostics/ingest', ping(), from)).status).toBe(202)
    expect((await post(app, '/diagnostics/ingest', ping(), from)).status).toBe(429)
  })

  it('refuses NEW reports with 507 when pending is at the cap, but still bumps occurrences', async () => {
    const { app } = mount({ maxPendingRows: 1 })
    expect((await post(app, '/diagnostics/ingest', ping())).status).toBe(202)
    // Same fingerprint: an occurrence bump, not a new row — always lands.
    expect((await post(app, '/diagnostics/ingest', ping())).status).toBe(202)
    // A different error would need a new row: quarantine is full.
    const other = await post(app, '/diagnostics/ingest', ping({ errorName: 'RangeError' }))
    expect(other.status).toBe(507)
    expect((await other.json()).error).toBe('quarantine_full')
  })
})

describe('diagnosticsInboxFeature — modes', () => {
  it('mounts nothing when XNET_DIAGNOSTICS_INBOX=off', async () => {
    const { app } = mount({ env: { XNET_DIAGNOSTICS_INBOX: 'off' } })
    expect((await post(app, '/diagnostics/ingest', ping())).status).toBe(404)
    expect((await app.request('/diagnostics/summary')).status).toBe(404)
  })

  it('requires auth for ingest in authed mode', async () => {
    const denied = mount({ env: { XNET_DIAGNOSTICS_INBOX: 'authed' }, auth: deny })
    expect((await post(denied.app, '/diagnostics/ingest', ping())).status).toBe(401)

    const allowed = mount({
      env: { XNET_DIAGNOSTICS_INBOX: 'authed' },
      auth: authAs('did:key:user', false)
    })
    expect((await post(allowed.app, '/diagnostics/ingest', ping())).status).toBe(202)
  })
})

describe('diagnosticsInboxFeature — drain surface', () => {
  it('lists pending and acks as admin; a re-crash resurfaces the record', async () => {
    const { app, store } = mount()
    await post(app, '/diagnostics/ingest', ping())

    const pending = await app.request('/diagnostics/pending')
    expect(pending.status).toBe(200)
    const { reports } = await pending.json()
    expect(reports).toHaveLength(1)

    const ack = await post(app, '/diagnostics/ack', { ids: [reports[0].id] })
    expect((await ack.json()).acked).toBe(1)
    expect(await store.listPending()).toHaveLength(0)

    // Recurrence after draining must go back to pending (0315 invariant).
    await post(app, '/diagnostics/ingest', ping())
    expect(await store.listPending()).toHaveLength(1)
  })

  it('forbids the drain surface to authenticated non-admins and the unauthenticated', async () => {
    const nonAdmin = mount({ auth: authAs('did:key:member', false) })
    expect((await nonAdmin.app.request('/diagnostics/pending')).status).toBe(403)
    expect((await post(nonAdmin.app, '/diagnostics/ack', { ids: ['x'] })).status).toBe(403)

    const unauthed = mount({ auth: deny })
    expect((await unauthed.app.request('/diagnostics/pending')).status).toBe(401)
  })
})

describe('diagnosticsInboxFeature — summary', () => {
  it('serves counts + top issues to an admin, never payload fields', async () => {
    const { app } = mount()
    await post(app, '/diagnostics/ingest', ping())
    await post(app, '/diagnostics/ingest', ping())
    await post(app, '/diagnostics/ingest', ping({ errorName: 'RangeError', lane: 'user' }))

    const res = await app.request('/diagnostics/summary')
    expect(res.status).toBe(200)
    const summary = await res.json()
    expect(summary.pending).toBe(2)
    expect(summary.total).toBe(2)
    expect(summary.topIssues[0]).toMatchObject({ errorName: 'TypeError', occurrences: 2 })
    // Content-free: the summary must not carry message/stack/breadcrumbs.
    expect(JSON.stringify(summary)).not.toContain('boom')
    expect(JSON.stringify(summary)).not.toContain('app.js')
  })

  it('accepts the provisioned sharing secret in place of admin auth', async () => {
    const { app } = mount({
      env: { XNET_DIAGNOSTICS_SECRET: 'shh' },
      auth: deny
    })
    await post(app, '/diagnostics/ingest', ping())

    expect((await app.request('/diagnostics/summary')).status).toBe(401)
    const withSecret = await app.request('/diagnostics/summary', {
      headers: { 'x-internal-secret': 'shh' }
    })
    expect(withSecret.status).toBe(200)
    expect((await withSecret.json()).pending).toBe(1)
  })

  it('forbids non-admin UCANs without the secret', async () => {
    const { app } = mount({ auth: authAs('did:key:member', false) })
    expect((await app.request('/diagnostics/summary')).status).toBe(403)
  })
})

describe('diagnosticsInboxFeature — Lane-1 tee (0341 P4)', () => {
  const TEE_ENV = {
    XNET_SHARE_CRASH_COUNTS: 'on',
    XNET_DIAGNOSTICS_URL: 'https://cloud.example/',
    XNET_DIAGNOSTICS_SECRET: 'tenant-a.s3cret'
  }
  const okFetch = () =>
    vi.fn(async () => new Response('{}', { status: 202 })) as unknown as typeof fetch

  it('forwards fingerprint-level data only — no message, stack, breadcrumbs, or didHash', async () => {
    const fetchImpl = okFetch()
    const { app } = mount({ env: TEE_ENV, fetchImpl })
    await post(app, '/diagnostics/ingest', ping({ message: 'SECRET free text' }))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ]
    expect(url).toBe('https://cloud.example/diagnostics')
    expect((init.headers as Record<string, string>)['x-internal-secret']).toBe('tenant-a.s3cret')
    const body = init.body as string
    expect(body).not.toContain('SECRET free text')
    expect(body).not.toContain('app.js') // no stack frames
    expect(body).not.toContain('breadcrumbs')
    expect(body).not.toContain('didHash')
    const sent = JSON.parse(body).report
    expect(sent).toMatchObject({ lane: 'auto', errorName: 'TypeError', release: 'web-1.42' })
    expect(sent.fingerprint).toBeTruthy()
  })

  it('stays fully local when the toggle is off, even with sharing configured', async () => {
    const fetchImpl = okFetch()
    const { app } = mount({
      env: { ...TEE_ENV, XNET_SHARE_CRASH_COUNTS: undefined },
      fetchImpl
    })
    await post(app, '/diagnostics/ingest', ping())
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never tees the user lane (previewed reports escalate per-report instead)', async () => {
    const fetchImpl = okFetch()
    const { app } = mount({ env: TEE_ENV, fetchImpl })
    await post(app, '/diagnostics/ingest', ping({ lane: 'user', userDescription: 'help' }))
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('diagnosticsInboxFeature — store injection', () => {
  it('501s summary when the injected store cannot summarize', async () => {
    const bare: DebugReportStore = {
      get: async () => null,
      put: async () => {},
      listPending: async () => [],
      ack: async () => 0,
      prune: async () => 0
    }
    const { app } = mount({ store: bare })
    expect((await app.request('/diagnostics/summary')).status).toBe(501)
  })
})
