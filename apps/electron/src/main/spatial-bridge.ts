import type { SpatialDetail, SpatialSnapshot } from '../shared/spatial-library'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { graphSearchIndex, searchGraph } from '../shared/library-graph/navigation'

type SpatialReader = {
  snapshot: SpatialSnapshot
  detail(id: string, text: boolean): Promise<SpatialDetail | null>
  thumbnail(id: string): Promise<{ data: Uint8Array; contentType: string } | null>
}
const secret = () => randomBytes(32).toString('base64url')
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Type': 'application/json'
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers })

/** One owner-approved snapshot, one invitation, one short-lived reader. No write routes. */
export function createSpatialBridge(reader: SpatialReader, origin: string, now = Date.now) {
  const invitation = secret(),
    token = secret()
  const issued = now(),
    expiresAt = issued + 60 * 60_000
  const scope = new Set(
    reader.snapshot.graph.nodes.filter((node) => node.kind === 'link').map((node) => node.id)
  )
  const snapshot = JSON.stringify(reader.snapshot)
  const search = graphSearchIndex(reader.snapshot.graph)
  let redeemed = false,
    revoked = false,
    active = 0
  let requests: number[] = []
  const valid = () => !revoked && now() < expiresAt
  return {
    invitation,
    expiresAt,
    revoke() {
      revoked = true
    },
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url)
      if (
        url.origin !== origin ||
        (request.headers.has('origin') && request.headers.get('origin') !== origin)
      )
        return json({ error: 'Origin denied' }, 403)
      if (!valid()) return json({ error: 'Pairing expired or revoked' }, 401)
      const auth = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
      if (!/^[A-Za-z0-9_-]{43}$/.test(auth)) return json({ error: 'Unauthorized' }, 401)
      if (url.pathname === '/pair') {
        if (request.method !== 'POST') return json({ error: 'Method denied' }, 405)
        if (redeemed || now() - issued > 5 * 60_000 || !same(auth, invitation))
          return json({ error: 'Invitation unavailable' }, 401)
        redeemed = true
        return json({ token, expiresAt })
      }
      if (!redeemed || !same(auth, token)) return json({ error: 'Unauthorized' }, 401)
      if (request.method !== 'GET') return json({ error: 'Read-only viewer' }, 405)
      requests = requests.filter((time) => time > now() - 60_000)
      if (active >= 4 || requests.length >= 120)
        return new Response('Read limit reached', {
          status: 429,
          headers: { ...headers, 'Retry-After': '60' }
        })
      requests.push(now())
      active++
      try {
        if (url.pathname === '/api/snapshot') return new Response(snapshot, { headers })
        if (url.pathname === '/api/search')
          return json(searchGraph(search, (url.searchParams.get('q') ?? '').slice(0, 300), 30))
        const match = url.pathname.match(/^\/api\/(detail|thumbnail)\/([^/]+)$/)
        if (!match) return json({ error: 'Not found' }, 404)
        const id = decodeURIComponent(match[2])
        if (!scope.has(id)) return json({ error: 'Outside paired scope' }, 404)
        if (match[1] === 'detail') {
          const detail = await reader.detail(id, url.searchParams.get('text') === '1')
          if (!valid()) return json({ error: 'Pairing expired or revoked' }, 401)
          return detail ? json(detail) : json({ error: 'Resource unavailable' }, 404)
        }
        const blob = await reader.thumbnail(id)
        if (!valid()) return json({ error: 'Pairing expired or revoked' }, 401)
        if (!blob) return json({ error: 'Thumbnail unavailable' }, 404)
        if (
          blob.data.byteLength > 8 * 1024 * 1024 ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(blob.contentType)
        )
          return json({ error: 'Unsupported thumbnail' }, 415)
        return new Response(Buffer.from(blob.data), {
          headers: { ...headers, 'Content-Type': blob.contentType }
        })
      } catch {
        return json({ error: 'The Mac could not read this item' }, 503)
      } finally {
        active--
      }
    }
  }
}
