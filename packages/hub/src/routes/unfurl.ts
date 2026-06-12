/**
 * @xnetjs/hub - Unfurl routes.
 *
 * Server-side metadata resolution (oEmbed, Open Graph) and a thumbnail
 * proxy for known media CDNs. Browsers cannot fetch most provider
 * endpoints or image bytes directly because the providers do not send
 * CORS headers; the hub performs the fetch and returns CORS-clean
 * responses the client can persist locally.
 */

import type { AuthContext } from '../auth/ucan'
import type { Context, MiddlewareHandler } from 'hono'
import { resolveExternalReferenceMetadata } from '@xnetjs/data'
import { Hono } from 'hono'
import { validateExternalUrl } from '../utils/url'

type Env = { Variables: { auth: AuthContext } }

export type UnfurlRoutesOptions = {
  requireAuth?: MiddlewareHandler
  userAgent: string
  fetchImpl?: typeof fetch
  /** Hostname patterns allowed for the image proxy. */
  imageHostPatterns?: readonly RegExp[]
}

const METADATA_TIMEOUT_MS = 10_000
const IMAGE_TIMEOUT_MS = 15_000
const MAX_METADATA_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Thumbnail CDNs for the platforms the social importers know about.
 * Kept narrow so the proxy cannot be used to relay arbitrary content.
 */
export const DEFAULT_UNFURL_IMAGE_HOST_PATTERNS: readonly RegExp[] = [
  /^i\.ytimg\.com$/,
  /^img\.youtube\.com$/,
  /^yt3\.ggpht\.com$/,
  /(^|\.)cdninstagram\.com$/,
  /^scontent[\w.-]*\.fbcdn\.net$/,
  /(^|\.)tiktokcdn(-[a-z0-9]+)?\.com$/,
  /^pbs\.twimg\.com$/
]

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type'
}

function corsJson(c: Context, payload: unknown, status: 200 | 400 | 413 | 502): Response {
  return c.json(payload as Record<string, unknown>, status, CORS_HEADERS)
}

export const createUnfurlRoutes = (options: UnfurlRoutesOptions): Hono<Env> => {
  const app = new Hono<Env>()
  const fetchImpl = options.fetchImpl ?? fetch
  const imageHostPatterns = options.imageHostPatterns ?? DEFAULT_UNFURL_IMAGE_HOST_PATTERNS
  const requireAuth: MiddlewareHandler =
    options.requireAuth ??
    (async (_c, next) => {
      await next()
    })

  /**
   * Re-validate after redirects so a public URL cannot bounce the hub
   * into private address space, and cap declared response sizes.
   */
  const guardedFetch: typeof fetch = async (input, init) => {
    const response = await fetchImpl(input, {
      ...init,
      headers: {
        'User-Agent': options.userAgent,
        ...(init?.headers ?? {})
      },
      redirect: 'follow'
    })

    if (response.url) {
      const finalValidation = validateExternalUrl(response.url)
      if (!finalValidation.valid) {
        throw new Error(`Redirected to a disallowed URL: ${finalValidation.error}`)
      }
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_METADATA_BYTES) {
      throw new Error('Upstream response too large')
    }

    return response
  }

  app.options('*', (c) => c.body(null, 204, CORS_HEADERS))

  app.get('/metadata', requireAuth, async (c) => {
    const target = c.req.query('url') ?? ''
    const validation = validateExternalUrl(target)
    if (!validation.valid) {
      return corsJson(c, { error: validation.error ?? 'Invalid URL' }, 400)
    }

    const result = await resolveExternalReferenceMetadata({
      url: target,
      provider: c.req.query('provider') ?? undefined,
      fetcher: guardedFetch,
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      allowOEmbed: true,
      allowOpenGraph: true
    }).catch((error: unknown) => ({
      status: 'error' as const,
      metadata: null,
      reason: 'Metadata resolution failed',
      error: error instanceof Error ? error.message : String(error)
    }))

    return corsJson(c, result, 200)
  })

  app.get('/image', requireAuth, async (c) => {
    const target = c.req.query('url') ?? ''
    const validation = validateExternalUrl(target)
    if (!validation.valid) {
      return corsJson(c, { error: validation.error ?? 'Invalid URL' }, 400)
    }

    const hostname = new URL(target).hostname.toLowerCase()
    if (!imageHostPatterns.some((pattern) => pattern.test(hostname))) {
      return corsJson(c, { error: 'Image host not allowed' }, 400)
    }

    let upstream: Response
    try {
      upstream = await guardedFetch(target, {
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS)
      })
    } catch (error: unknown) {
      return corsJson(
        c,
        { error: error instanceof Error ? error.message : 'Image fetch failed' },
        502
      )
    }

    if (!upstream.ok) {
      return corsJson(c, { error: `Upstream responded ${upstream.status}` }, 502)
    }

    const contentType = upstream.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('image/')) {
      return corsJson(c, { error: 'Upstream did not return an image' }, 502)
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer())
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return corsJson(c, { error: 'Image exceeds size limit' }, 413)
    }

    return c.body(bytes, 200, {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable'
    })
  })

  return app
}
