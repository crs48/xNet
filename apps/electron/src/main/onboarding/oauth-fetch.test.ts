import type { IncomingMessage, RequestOptions } from 'node:http'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { beforeEach, expect, it, vi } from 'vitest'
import { oauthFetch } from './oauth-fetch'

const mocks = vi.hoisted(() => ({ request: vi.fn(), lookup: vi.fn() }))
vi.mock('node:https', () => ({ request: mocks.request }))
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
beforeEach(() => {
  vi.resetAllMocks()
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
})
it('pins public DNS to the socket and preserves the response URL for OAuth checks', async () => {
  response(200, { 'content-type': 'application/json' }, ['{"issuer":"https://example.com"}'])
  const result = await oauthFetch('https://example.com/metadata')
  expect(result.url).toBe('https://example.com/metadata')
  expect(await result.json()).toEqual({ issuer: 'https://example.com' })
  const options = mocks.request.mock.calls[0][1]
  const done = vi.fn()
  options.lookup('example.com', {}, done)
  expect(done).toHaveBeenCalledWith(null, '8.8.8.8', 4)
  expect(options.agent).toBe(false)
  expect(mocks.lookup).toHaveBeenCalledTimes(1)
})
it('never follows a redirect carrying an authorization header', async () => {
  response(302, { location: 'https://elsewhere.test/token' })
  await expect(
    oauthFetch('https://example.com/token', { headers: { authorization: 'DPoP test' } })
  ).rejects.toThrow('redirect')
  expect(mocks.request).toHaveBeenCalledTimes(1)
})
it('rejects non-HTTPS, private DNS answers and oversized requests before dialing', async () => {
  await expect(oauthFetch('http://example.com')).rejects.toThrow('HTTPS')
  mocks.lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
  await expect(oauthFetch('https://example.com')).rejects.toThrow()
  await expect(
    oauthFetch('https://example.com', { method: 'POST', body: 'x'.repeat(65537) })
  ).rejects.toThrow('too large')
  expect(mocks.request).not.toHaveBeenCalled()
})
it('rejects oversized, compressed and invalid responses without returning partial success', async () => {
  response(200, {}, ['x'.repeat(1024 * 1024 + 1)])
  await expect(oauthFetch('https://example.com')).rejects.toThrow('too large')
  response(200, { 'content-encoding': 'gzip' }, ['bytes'])
  await expect(oauthFetch('https://example.com')).rejects.toThrow('encoding')
  response(999, {})
  await expect(oauthFetch('https://example.com')).rejects.toThrow('invalid status')
})
it('honors cancellation before and during unresolved DNS', async () => {
  mocks.lookup.mockReturnValue(new Promise(() => {}))
  const controller = new AbortController()
  const pending = oauthFetch('https://example.com', { signal: controller.signal })
  controller.abort(new Error('Cancelled'))
  await expect(pending).rejects.toThrow('Cancelled')
  await expect(oauthFetch('https://example.com', { signal: controller.signal })).rejects.toThrow(
    'Cancelled'
  )
  expect(mocks.request).not.toHaveBeenCalled()
})
