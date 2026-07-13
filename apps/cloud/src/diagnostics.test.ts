import { describe, expect, it, vi } from 'vitest'
import {
  createDiagnosticsRoutes,
  fingerprintOf,
  MemoryDebugReportStore,
  parseIncomingReport,
  shortId,
  MAX_REPORT_BYTES,
  type DebugReportRecord
} from './diagnostics'
import { createLogger } from './logger'

const silentLog = createLogger({ sink: () => {} })

const SECRET = 'test-internal-secret'

const makeApp = (overrides: Partial<Parameters<typeof createDiagnosticsRoutes>[0]> = {}) => {
  const store = new MemoryDebugReportStore()
  let nowMs = 1_000_000
  const app = createDiagnosticsRoutes({
    store,
    log: silentLog,
    internalSecret: SECRET,
    nowMs: () => nowMs,
    ...overrides
  })
  return { app, store, advance: (ms: number) => (nowMs += ms) }
}

const autoReport = (extra: Record<string, unknown> = {}) => ({
  lane: 'auto',
  errorName: 'TypeError',
  message: 'x is not a function',
  stack: 'TypeError: x is not a function\n    at https://xnet.fyi/app/assets/index-abc.js:1:2345',
  release: '1.42.317',
  surface: 'web',
  bootStage: 'sqlite:open',
  uaFamily: 'Chrome 137 / macOS',
  ...extra
})

const ingest = (app: ReturnType<typeof makeApp>['app'], body: unknown, ip = '1.2.3.4') =>
  app.request('/diagnostics/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body)
  })

describe('POST /diagnostics/ingest', () => {
  it('accepts a valid auto crash ping and returns an id + short handle', async () => {
    const { app, store } = makeApp()
    const res = await ingest(app, autoReport())
    expect(res.status).toBe(202)
    const body = (await res.json()) as { id: string; shortId: string }
    expect(body.id).toMatch(/^dr_[0-9a-f]{24}$/)
    expect(body.shortId).toMatch(/^XR-[0-9A-F]{6}$/)
    expect(body.shortId).toBe(shortId(body.id))

    const pending = await store.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      lane: 'auto',
      errorName: 'TypeError',
      release: '1.42.317',
      bootStage: 'sqlite:open',
      occurrences: 1,
      status: 'pending'
    })
  })

  it('dedupes repeat identical crashes into one record with occurrences++', async () => {
    const { app, store } = makeApp()
    await ingest(app, autoReport())
    await ingest(app, autoReport())
    await ingest(app, autoReport())

    const pending = await store.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.occurrences).toBe(3)
  })

  it('resurfaces a drained fingerprint as pending when it recurs', async () => {
    const { app, store } = makeApp()
    const res = await ingest(app, autoReport())
    const { id } = (await res.json()) as { id: string }
    await store.ack([id])
    expect(await store.listPending()).toHaveLength(0)

    await ingest(app, autoReport())
    const pending = await store.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.occurrences).toBe(2)
  })

  it('gives user-lane reports unique ids (no dedupe) and keeps breadcrumbs', async () => {
    const { app, store } = makeApp()
    const report = {
      ...autoReport({ lane: 'user' }),
      userDescription: 'the editor went blank',
      breadcrumbs: ['[info] boot ok', '[error] render failed']
    }
    await ingest(app, report)
    await ingest(app, report)

    const pending = await store.listPending()
    expect(pending).toHaveLength(2)
    expect(pending.map((r) => r.id)).not.toContain(pending[0]?.fingerprint)
    expect(pending[0]?.breadcrumbs).toEqual(['[info] boot ok', '[error] render failed'])
    expect(pending[0]?.userDescription).toBe('the editor went blank')
  })

  it('scrubs PII server-side even when the client failed to (defense in depth)', async () => {
    const { app, store } = makeApp()
    await ingest(
      app,
      autoReport({
        lane: 'user',
        message: 'failed for chris.smothers@example.com at /Users/crs/Code/xNet',
        userDescription: 'my id is did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        breadcrumbs: ['fetch http://10.0.0.5/api?token=abc failed']
      })
    )
    const [record] = await store.listPending()
    expect(record?.message).not.toContain('@example.com')
    expect(record?.message).toContain('[EMAIL]')
    expect(record?.message).toContain('/Users/[USER]')
    expect(record?.userDescription).toContain('did:method:[REDACTED]')
    expect(record?.breadcrumbs?.[0]).not.toContain('10.0.0.5')
  })

  it('drops unknown fields instead of storing them', async () => {
    const { app, store } = makeApp()
    await ingest(app, autoReport({ documentContent: 'SECRET DOC', email: 'a@b.co' }))
    const [record] = await store.listPending()
    expect(JSON.stringify(record)).not.toContain('SECRET DOC')
    expect(record && 'documentContent' in record).toBe(false)
  })

  it('rejects oversized bodies with 413', async () => {
    const { app } = makeApp()
    const res = await ingest(app, autoReport({ stack: 'x'.repeat(MAX_REPORT_BYTES) }))
    expect(res.status).toBe(413)
  })

  it('rate-limits rapid-fire submissions per client IP with 429', async () => {
    const { app } = makeApp()
    for (let i = 0; i < 10; i++) {
      expect((await ingest(app, autoReport())).status).toBe(202)
    }
    expect((await ingest(app, autoReport())).status).toBe(429)
    // A different client is unaffected.
    expect((await ingest(app, autoReport(), '5.6.7.8')).status).toBe(202)
  })

  it('rejects malformed reports with 400', async () => {
    const { app } = makeApp()
    expect((await ingest(app, { lane: 'auto' })).status).toBe(400)
    expect((await ingest(app, { lane: 'bogus', errorName: 'E', message: 'm' })).status).toBe(400)
    expect(
      (
        await app.request('/diagnostics/ingest', {
          method: 'POST',
          headers: { 'x-forwarded-for': '9.9.9.9' },
          body: 'not json'
        })
      ).status
    ).toBe(400)
  })
})

describe('POST /diagnostics (hub diagnostics-sharing socket)', () => {
  // Exactly what packages/hub/src/features/diagnostics-sharing.ts sends.
  const hubBody = (report: unknown) =>
    JSON.stringify({ didHash: 'a'.repeat(43), report })

  it('rejects without the shared secret (403)', async () => {
    const { app } = makeApp()
    const res = await app.request('/diagnostics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: hubBody(autoReport())
    })
    expect(res.status).toBe(403)
  })

  it('accepts a forwarded report, stamping the hub lane + didHash', async () => {
    const { app, store } = makeApp()
    const res = await app.request('/diagnostics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: hubBody(autoReport())
    })
    expect(res.status).toBe(202)
    const [record] = await store.listPending()
    expect(record).toMatchObject({ lane: 'hub', surface: 'hub', didHash: 'a'.repeat(43) })
  })

  it('never silently drops an unparseable forwarded report', async () => {
    const { app, store } = makeApp()
    const res = await app.request('/diagnostics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: hubBody({ weird: 'shape' })
    })
    expect(res.status).toBe(202)
    const [record] = await store.listPending()
    expect(record?.errorName).toBe('HubDiagnosticsReport')
  })
})

describe('internal drain surface', () => {
  it('gates list + ack on the internal secret', async () => {
    const { app } = makeApp()
    expect((await app.request('/internal/diagnostics/reports')).status).toBe(403)
    expect(
      (
        await app.request('/internal/diagnostics/ack', {
          method: 'POST',
          body: JSON.stringify({ ids: ['x'] })
        })
      ).status
    ).toBe(403)
  })

  it('lists pending reports and acks them drained', async () => {
    const { app } = makeApp()
    const { id } = (await (await ingest(app, autoReport())).json()) as { id: string }

    const list = await app.request('/internal/diagnostics/reports', {
      headers: { 'x-internal-secret': SECRET }
    })
    const { reports } = (await list.json()) as { reports: DebugReportRecord[] }
    expect(reports.map((r) => r.id)).toEqual([id])

    const ack = await app.request('/internal/diagnostics/ack', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({ ids: [id] })
    })
    expect(((await ack.json()) as { acked: number }).acked).toBe(1)

    const after = await app.request('/internal/diagnostics/reports', {
      headers: { 'x-internal-secret': SECRET }
    })
    expect(((await after.json()) as { reports: unknown[] }).reports).toEqual([])
  })

  it('is disabled entirely when no internal secret is configured', async () => {
    const { app } = makeApp({ internalSecret: undefined })
    const res = await app.request('/internal/diagnostics/reports', {
      headers: { 'x-internal-secret': '' }
    })
    expect(res.status).toBe(403)
  })
})

describe('first-seen alert seam + retention', () => {
  it('fires onFirstSeen once per fingerprint, and alert failures never break ingest', async () => {
    const onFirstSeen = vi.fn(() => {
      throw new Error('webhook down')
    })
    const { app } = makeApp({ onFirstSeen })
    expect((await ingest(app, autoReport())).status).toBe(202)
    expect((await ingest(app, autoReport())).status).toBe(202)
    expect(onFirstSeen).toHaveBeenCalledTimes(1)
  })

  it('prunes long-drained records opportunistically', async () => {
    const { app, store, advance } = makeApp()
    const { id } = (await (await ingest(app, autoReport())).json()) as { id: string }
    await store.ack([id])

    advance(31 * 24 * 60 * 60 * 1000)
    await ingest(app, autoReport({ errorName: 'OtherError' }), '7.7.7.7')
    expect(await store.get(id)).toBeNull()
  })
})

describe('fingerprintOf', () => {
  it('groups by name + normalized top frame + release, ignoring the origin host', () => {
    const a = fingerprintOf({
      errorName: 'TypeError',
      stack: 'TypeError: x\n    at https://xnet.fyi/app/assets/i.js:1:23',
      release: '1.0'
    })
    const b = fingerprintOf({
      errorName: 'TypeError',
      stack: 'TypeError: x\n    at https://preview.xnet.fyi/app/assets/i.js:1:23',
      release: '1.0'
    })
    const c = fingerprintOf({
      errorName: 'TypeError',
      stack: 'TypeError: x\n    at https://xnet.fyi/app/assets/i.js:1:23',
      release: '2.0'
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('parseIncomingReport', () => {
  it('bounds every field and caps breadcrumbs to the newest 50', () => {
    const parsed = parseIncomingReport({
      lane: 'user',
      errorName: 'E'.repeat(500),
      message: 'm',
      breadcrumbs: Array.from({ length: 80 }, (_, i) => `line ${i}` + 'x'.repeat(400))
    })
    expect(parsed?.errorName).toHaveLength(120)
    expect(parsed?.breadcrumbs).toHaveLength(50)
    expect(parsed?.breadcrumbs?.[49]?.length).toBeLessThanOrEqual(300)
    expect(parsed?.breadcrumbs?.[0]).toContain('line 30') // newest 50 kept
  })
})
