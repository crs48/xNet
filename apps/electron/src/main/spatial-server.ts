import type { createSpatialBridge } from './spatial-bridge'
import { createServer } from 'node:https'

const lanAddress = (address: string) => {
  const value = address.replace(/^::ffff:/, '')
  return (
    value === '::1' ||
    /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(value) ||
    /^(?:fc|fd|fe80:)/i.test(value)
  )
}

export function createSpatialServer({
  cert,
  key,
  origin,
  assets,
  bridge
}: {
  cert: Buffer
  key: Buffer
  origin: string
  assets: Map<string, { data: Buffer; type: string }>
  bridge: ReturnType<typeof createSpatialBridge>
}) {
  const url = new URL(origin)
  const next = createServer({ cert, key, minVersion: 'TLSv1.2' }, (request, reply) => {
    void (async () => {
      const incomingOrigin = request.headers.origin
      if (
        !lanAddress(request.socket.remoteAddress ?? '') ||
        request.headers.host !== url.host ||
        (incomingOrigin && incomingOrigin !== url.origin)
      ) {
        reply.writeHead(403)
        reply.end()
        return
      }
      const path = new URL(request.url ?? '/', url.origin)
      if (path.pathname === '/pair' || path.pathname.startsWith('/api/')) {
        const result = await bridge.handle(
          new Request(path, {
            method: request.method,
            headers: {
              ...(incomingOrigin ? { origin: incomingOrigin } : {}),
              authorization: request.headers.authorization ?? ''
            }
          })
        )
        reply.writeHead(result.status, Object.fromEntries(result.headers))
        reply.end(Buffer.from(await result.arrayBuffer()))
        return
      }
      const asset = assets.get(path.pathname === '/' ? '/index.html' : path.pathname)
      if (!asset || request.method !== 'GET') {
        reply.writeHead(404)
        reply.end()
        return
      }
      reply.writeHead(200, {
        'Content-Type': asset.type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'xr-spatial-tracking=(self)',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      })
      reply.end(asset.data)
    })().catch(() => {
      if (!reply.headersSent) reply.writeHead(503)
      reply.end('Viewer unavailable')
    })
  })
  next.requestTimeout = 150_000
  next.headersTimeout = 10_000

  return next
}
