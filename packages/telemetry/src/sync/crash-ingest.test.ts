import { describe, expect, it, vi } from 'vitest'
import { ConsentManager, MemoryConsentStorage } from '../consent'
import { createDiagnosticsClient, type CrashPing } from './crash-ingest'

const PING: CrashPing = {
  errorName: 'TypeError',
  message: 'boom at /Users/crs/secret',
  stack: 'TypeError: boom\n    at app.js:1:2',
  release: '1.42.317',
  surface: 'web',
  bootStage: 'sqlite:open',
  uaFamily: 'Chrome 137 / macOS'
}

const makeClient = (tier: 'off' | 'crashes', fetchImpl: typeof fetch) => {
  const consent = new ConsentManager({ storage: new MemoryConsentStorage() })
  if (tier !== 'off') consent.setTier(tier)
  return createDiagnosticsClient({ ingestUrl: 'https://cloud.example/', consent, fetchImpl })
}

const okFetch = () =>
  vi.fn(async () =>
    new Response(JSON.stringify({ id: 'dr_u_abc', shortId: 'XR-ABC123' }), { status: 202 })
  ) as unknown as typeof fetch

describe('createDiagnosticsClient — automatic lane', () => {
  it('sends nothing below the crashes tier', async () => {
    const fetchImpl = okFetch()
    const client = makeClient('off', fetchImpl)
    client.crash(PING)
    await client.flush()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs a scrubbed lane:auto ping to <base>/diagnostics/ingest at crashes tier', async () => {
    const fetchImpl = okFetch()
    const client = makeClient('crashes', fetchImpl)
    client.crash(PING)
    await client.flush()

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ]
    expect(url).toBe('https://cloud.example/diagnostics/ingest')
    expect(init.keepalive).toBe(true)
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.lane).toBe('auto')
    expect(body.errorName).toBe('TypeError')
    expect(body.message).toContain('/Users/[USER]') // scrubbed before leaving
  })

  it('caps the queue during a crash loop and never throws on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const client = makeClient('crashes', fetchImpl)
    for (let i = 0; i < 20; i++) client.crash(PING)
    await expect(client.flush()).resolves.toBeUndefined()
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(5)
  })
})

describe('createDiagnosticsClient — user-triggered lane', () => {
  it('submits without any consent tier and returns the quotable handle', async () => {
    const fetchImpl = okFetch()
    const client = makeClient('off', fetchImpl)
    const result = await client.submit({ ...PING, userDescription: 'editor went blank' })

    expect(result).toEqual({ id: 'dr_u_abc', shortId: 'XR-ABC123' })
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect((JSON.parse(init.body as string) as { lane: string }).lane).toBe('user')
  })

  it('returns null on failure instead of throwing', async () => {
    const failing = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    const client = makeClient('off', failing)
    expect(await client.submit(PING)).toBeNull()

    const offline = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await makeClient('off', offline).submit(PING)).toBeNull()
  })
})
