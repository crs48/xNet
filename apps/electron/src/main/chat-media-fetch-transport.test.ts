import type { IncomingMessage, RequestOptions } from 'node:http'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPreviewBytes } from './chat-media-fetch'

const mocks = vi.hoisted(() => ({ request: vi.fn(), lookup: vi.fn() }))
vi.mock('node:https', () => ({ request: mocks.request }))
vi.mock('node:http', () => ({ request: mocks.request }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))

function response(status: number, headers: Record<string, string>, chunks: string[] = []) {
  mocks.request.mockImplementationOnce(
    (_url: URL, _options: RequestOptions, receive: (value: IncomingMessage) => void) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void }
      request.end = () => {
        const body = Readable.from(chunks.map((chunk) => Buffer.from(chunk))) as IncomingMessage
        body.statusCode = status
        body.headers = headers
        receive(body)
      }
      return request
    }
  )
}

describe('bounded preview transport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
  })

  it('pins checked DNS results instead of looking up the host again', async () => {
    response(200, { 'content-type': 'image/png' }, ['bytes'])
    expect(
      await fetchPreviewBytes('https://example.com/a', 10, new AbortController().signal)
    ).toMatchObject({ mimeType: 'image/png' })
    const options = mocks.request.mock.calls[0][1]
    const done = vi.fn()
    options.lookup('example.com', {}, done)
    expect(done).toHaveBeenCalledWith(null, '8.8.8.8', 4)
    expect(options.agent).toBe(false)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it('blocks a redirect to local metadata before making another request', async () => {
    response(302, { location: 'http://169.254.169.254/latest/meta-data' })
    await expect(
      fetchPreviewBytes('https://example.com', 10, new AbortController().signal)
    ).rejects.toThrow()
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })

  it('rejects oversized streams and compressed payloads rather than returning partial content', async () => {
    response(200, {}, ['12345', '67890'])
    await expect(
      fetchPreviewBytes('https://example.com', 8, new AbortController().signal)
    ).rejects.toThrow('too large')
    response(200, { 'content-encoding': 'gzip' }, ['bytes'])
    await expect(
      fetchPreviewBytes('https://example.com', 100, new AbortController().signal)
    ).rejects.toThrow('encoding')
  })

  it('honors cancellation even when DNS does not finish', async () => {
    mocks.lookup.mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()
    const request = fetchPreviewBytes('https://example.com', 10, controller.signal)
    controller.abort(new Error('Preview timeout'))
    await expect(request).rejects.toThrow('Preview timeout')
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
