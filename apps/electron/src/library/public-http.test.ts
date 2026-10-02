import type { RequestOptions } from 'node:https'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchLibraryMetadata, fetchPublic } from './providers'

const stubs = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: stubs.lookup }))
vi.mock('node:https', () => ({ request: stubs.request }))
vi.mock('node:http', () => ({ request: stubs.request }))

type Incoming = PassThrough & { rawHeaders: string[]; statusCode: number }
const addresses = [
  { address: '93.184.216.34', family: 4 },
  { address: '93.184.216.35', family: 4 }
]
let responses: ((request: EventEmitter, callback: (incoming: Incoming) => void) => void)[]
beforeEach(() => {
  stubs.lookup.mockReset().mockResolvedValue(addresses)
  stubs.request
    .mockReset()
    .mockImplementation(
      (_url: URL, options: RequestOptions, callback: (incoming: Incoming) => void) => {
        const request = new EventEmitter() as EventEmitter & {
          end(): void
          destroy(error: Error): void
        }
        request.destroy = (error) => {
          request.emit('error', error)
          request.emit('close')
        }
        const abort = () => request.destroy(new Error('aborted'))
        options.signal?.addEventListener('abort', abort, { once: true })
        request.once('close', () => options.signal?.removeEventListener('abort', abort))
        request.end = () => queueMicrotask(() => responses.shift()!(request, callback))
        return request
      }
    )
  responses = []
})
afterEach(() => vi.useRealTimers())
const respond =
  (status: number, body: string, headers: string[] = []) =>
  (request: EventEmitter, callback: (incoming: Incoming) => void) => {
    const stream = Object.assign(new PassThrough(), { statusCode: status, rawHeaders: headers })
    stream.once('close', () => request.emit('close'))
    callback(stream)
    if (!stream.destroyed) stream.end(body)
  }

it('falls back to another validated address when the first connection fails', async () => {
  responses = [
    (request) => {
      request.emit('error', new Error('unreachable'))
      request.emit('close')
    },
    respond(200, 'complete content')
  ]
  expect(await (await fetchPublic('https://example.com/page')).text()).toBe('complete content')
  const selected: string[] = []
  for (const call of stubs.request.mock.calls) {
    const options = call[1] as RequestOptions
    options.lookup!('example.com', {}, (_error, address) => {
      if (typeof address !== 'string') throw new Error('Expected one pinned address')
      selected.push(address)
    })
  }
  expect(selected).toEqual(addresses.map((value) => value.address))
})

it('rejects a private DNS answer before opening any connection', async () => {
  stubs.lookup.mockResolvedValue([...addresses, { address: '127.0.0.1', family: 4 }])
  await expect(fetchPublic('https://example.com/page')).rejects.toThrow()
  expect(stubs.request).not.toHaveBeenCalled()
})

it('leaves an unresponsive address before the whole request deadline', async () => {
  vi.useFakeTimers()
  responses = [() => {}, respond(200, 'next address')]
  const result = fetchPublic('https://example.com/page', { timeoutMs: 20_000 })
  await vi.advanceTimersByTimeAsync(8_000)
  expect(await (await result).text()).toBe('next address')
  expect(stubs.request).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('validates the destination after a redirect', async () => {
  responses = [respond(302, '', ['location', 'http://127.0.0.1/private'])]
  await expect(fetchPublic('https://example.com/page')).rejects.toThrow()
  expect(stubs.request).toHaveBeenCalledTimes(1)
})

it('fails a byte limit immediately without retrying other addresses', async () => {
  responses = [respond(200, 'oversized')]
  await expect(fetchPublic('https://example.com/page', { limit: 3 })).rejects.toMatchObject({
    disposition: 'blocked'
  })
  expect(stubs.request).toHaveBeenCalledTimes(1)
})

it('bounds stalled DNS and never opens a late request', async () => {
  vi.useFakeTimers()
  let finish!: (value: typeof addresses) => void
  stubs.lookup.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = expect(
    fetchPublic('https://example.com/page', { timeoutMs: 100 })
  ).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(100)
  await pending
  finish(addresses)
  await Promise.resolve()
  expect(stubs.request).not.toHaveBeenCalled()
})

it('cancels an active request and clears its timers', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  responses = [() => {}]
  const pending = expect(
    fetchPublic('https://example.com/page', { signal: controller.signal })
  ).rejects.toThrow()
  await vi.advanceTimersByTimeAsync(1)
  controller.abort()
  await pending
  expect(vi.getTimerCount()).toBe(0)
})

it('distinguishes provider rate limits from one restricted resource', async () => {
  responses = [respond(429, '', ['retry-after', '120']), respond(403, '')]
  await expect(fetchPublic('https://example.com/rate')).rejects.toMatchObject({
    scope: 'provider',
    disposition: 'retry',
    retryAt: expect.any(Number)
  })
  await expect(fetchPublic('https://example.com/private')).rejects.toMatchObject({
    scope: 'resource',
    disposition: 'blocked'
  })
})

it('keeps YouTube cards useful when the page cannot expose complete metadata', async () => {
  responses = [
    respond(200, '<html>Consent needed</html>'),
    respond(
      200,
      JSON.stringify({
        title: 'Public preview title',
        author_name: 'Original author',
        thumbnail_url: 'https://i.ytimg.com/poster.jpg'
      })
    )
  ]
  const result = await fetchLibraryMetadata(
    {
      id: 'fixture',
      platform: 'youtube',
      platformContentId: 'abcdefghijk',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      title: 'Unresolved',
      sourceText: '',
      actor: '',
      privacy: 'private',
      addedAt: 1
    },
    new AbortController().signal,
    '/nonexistent/helper'
  )
  expect(result.title).toBe('Public preview title')
  expect(result.thumbnailUrl).toBe('https://i.ytimg.com/poster.jpg')
  expect(result.fields.description.state).toBe('partial')
  expect(result.fields.captions.state).toBe('partial')
  expect(stubs.request).toHaveBeenCalledTimes(2)
})
