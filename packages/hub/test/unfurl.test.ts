import { describe, expect, it } from 'vitest'
import { createUnfurlRoutes, DEFAULT_UNFURL_IMAGE_HOST_PATTERNS } from '../src/routes/unfurl'

const USER_AGENT = 'xNetTest/1.0'

function jsonResponse(payload: unknown, url: string): Response {
  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function imageResponse(bytes: Uint8Array, url: string, contentType = 'image/jpeg'): Response {
  const response = new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.byteLength) }
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

describe('unfurl routes', () => {
  it('resolves oEmbed metadata server-side and returns CORS headers', async () => {
    const requests: string[] = []
    const app = createUnfurlRoutes({
      userAgent: USER_AGENT,
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input)
        requests.push(url)
        return jsonResponse(
          {
            title: 'Example Video',
            author_name: 'Example Channel',
            provider_name: 'YouTube',
            thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg'
          },
          url
        )
      }) as typeof fetch
    })

    const res = await app.request(
      `/metadata?url=${encodeURIComponent('https://www.youtube.com/watch?v=abc123')}`
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const payload = await res.json()
    expect(payload.status).toBe('resolved')
    expect(payload.metadata).toMatchObject({
      title: 'Example Video',
      authorName: 'Example Channel',
      imageUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      source: 'oembed'
    })
    expect(requests[0]).toContain('youtube.com/oembed')
  })

  it('resolves generic URLs via Open Graph (0295 chat unfurl path)', async () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="A Plain Blog Post" />
      <meta property="og:description" content="Words about things." />
      <meta property="og:site_name" content="Example Blog" />
      </head><body></body></html>`
    const app = createUnfurlRoutes({
      userAgent: USER_AGENT,
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input)
        const response = new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        })
        Object.defineProperty(response, 'url', { value: url })
        return response
      }) as typeof fetch
    })

    const res = await app.request(
      `/metadata?url=${encodeURIComponent('https://blog.example.com/post')}`
    )
    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload.status).toBe('resolved')
    expect(payload.metadata).toMatchObject({
      title: 'A Plain Blog Post',
      description: 'Words about things.',
      source: 'open-graph'
    })
  })

  it('rejects invalid and private metadata URLs', async () => {
    const app = createUnfurlRoutes({
      userAgent: USER_AGENT,
      fetchImpl: (async () => {
        throw new Error('should not fetch')
      }) as typeof fetch
    })

    expect((await app.request('/metadata?url=not-a-url')).status).toBe(400)
    expect(
      (await app.request(`/metadata?url=${encodeURIComponent('http://192.168.1.1/admin')}`)).status
    ).toBe(400)
    expect(
      (await app.request(`/metadata?url=${encodeURIComponent('file:///etc/passwd')}`)).status
    ).toBe(400)
  })

  it('proxies allowlisted thumbnails with immutable cache headers', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const app = createUnfurlRoutes({
      userAgent: USER_AGENT,
      fetchImpl: (async (input: RequestInfo | URL) =>
        imageResponse(bytes, String(input))) as typeof fetch
    })

    const res = await app.request(
      `/image?url=${encodeURIComponent('https://i.ytimg.com/vi/abc123/mqdefault.jpg')}`
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Cache-Control')).toContain('immutable')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })

  it('rejects image hosts outside the allowlist', async () => {
    const app = createUnfurlRoutes({
      userAgent: USER_AGENT,
      fetchImpl: (async () => {
        throw new Error('should not fetch')
      }) as typeof fetch
    })

    const res = await app.request(
      `/image?url=${encodeURIComponent('https://evil.example.com/image.jpg')}`
    )

    expect(res.status).toBe(400)
    const payload = await res.json()
    expect(payload.error).toContain('not allowed')
  })

  it('rejects non-image upstream responses', async () => {
    const app = createUnfurlRoutes({
      userAgent: USER_AGENT,
      fetchImpl: (async (input: RequestInfo | URL) =>
        jsonResponse({ nope: true }, String(input))) as typeof fetch
    })

    const res = await app.request(
      `/image?url=${encodeURIComponent('https://i.ytimg.com/vi/abc123/mqdefault.jpg')}`
    )

    expect(res.status).toBe(502)
  })

  it('blocks fetches that redirect into private address space', async () => {
    const app = createUnfurlRoutes({
      userAgent: USER_AGENT,
      fetchImpl: (async () =>
        imageResponse(new Uint8Array([1]), 'http://127.0.0.1/internal.jpg')) as typeof fetch
    })

    const res = await app.request(
      `/image?url=${encodeURIComponent('https://i.ytimg.com/vi/abc123/mqdefault.jpg')}`
    )

    expect(res.status).toBe(502)
  })

  it('answers CORS preflight without auth', async () => {
    const app = createUnfurlRoutes({
      userAgent: USER_AGENT,
      requireAuth: async (c) => c.json({ error: 'unauthorized' }, 401),
      fetchImpl: (async () => {
        throw new Error('should not fetch')
      }) as typeof fetch
    })

    const res = await app.request('/metadata', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })

  it('covers the platform CDNs the importers reference', () => {
    const allowed = [
      'i.ytimg.com',
      'img.youtube.com',
      'yt3.ggpht.com',
      'scontent-lax3-1.cdninstagram.com',
      'scontent-lax3-1.xx.fbcdn.net',
      'p16-sign-va.tiktokcdn.com',
      'p16-sign.tiktokcdn-us.com',
      'pbs.twimg.com'
    ]
    const denied = ['evil.com', 'ytimg.com.evil.com', 'nottiktokcdn.com', 'fbcdn.net.evil.io']

    for (const host of allowed) {
      expect(
        DEFAULT_UNFURL_IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(host)),
        host
      ).toBe(true)
    }
    for (const host of denied) {
      expect(
        DEFAULT_UNFURL_IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(host)),
        host
      ).toBe(false)
    }
  })
})
