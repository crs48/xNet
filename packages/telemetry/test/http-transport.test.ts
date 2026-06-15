import type { TelemetryBatch } from '../src/sync/protocol'
import { describe, it, expect, vi } from 'vitest'
import { createHttpTransport } from '../src/sync/http-transport'

const batch: TelemetryBatch = {
  batchId: 'batch_1',
  timestamp: Date.now(),
  records: [
    { schemaId: 'xnet://xnet.fyi/telemetry/UsageMetric', data: { metricName: 'x' }, createdAt: Date.now() }
  ]
}

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

describe('createHttpTransport', () => {
  it('POSTs the batch to <endpoint>/telemetry/ingest', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ accepted: true, processed: 1 }))
    const transport = createHttpTransport({ endpoint: 'https://hub.example', fetchImpl })

    const res = await transport('ignored', batch)

    expect(res).toEqual({ accepted: true, processed: 1, error: undefined })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://hub.example/telemetry/ingest')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({ batchId: 'batch_1' })
    expect(init.keepalive).toBe(true)
  })

  it('normalizes a trailing slash on the endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ accepted: true, processed: 1 }))
    const transport = createHttpTransport({ endpoint: 'https://hub.example/', fetchImpl })
    await transport('ignored', batch)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://hub.example/telemetry/ingest')
  })

  it('attaches a bearer token when getAuthToken returns one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ accepted: true, processed: 1 }))
    const transport = createHttpTransport({
      endpoint: 'https://hub.example',
      fetchImpl,
      getAuthToken: async () => 'ucan-abc'
    })
    await transport('ignored', batch)
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer ucan-abc')
  })

  it('omits the auth header when no token is available', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ accepted: true, processed: 1 }))
    const transport = createHttpTransport({ endpoint: 'https://hub.example', fetchImpl })
    await transport('ignored', batch)
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBeUndefined()
  })

  it('reports a non-2xx response as not accepted', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as unknown as Response)
    const transport = createHttpTransport({ endpoint: 'https://hub.example', fetchImpl })
    const res = await transport('ignored', batch)
    expect(res.accepted).toBe(false)
    expect(res.processed).toBe(0)
    expect(res.error).toBe('http_429')
  })

  it('catches network errors without throwing', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connection refused'))
    const transport = createHttpTransport({ endpoint: 'https://hub.example', fetchImpl })
    const res = await transport('ignored', batch)
    expect(res.accepted).toBe(false)
    expect(res.error).toBe('connection refused')
  })

  it('falls back to batch length when the response omits processed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({}))
    const transport = createHttpTransport({ endpoint: 'https://hub.example', fetchImpl })
    const res = await transport('ignored', batch)
    expect(res.accepted).toBe(true)
    expect(res.processed).toBe(1)
  })
})
