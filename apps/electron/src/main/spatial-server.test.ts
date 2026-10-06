import type { Server } from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureAdapter } from '../spatial/fixtures'
import { createSpatialBridge } from './spatial-bridge'
import { createSpatialServer } from './spatial-server'

describe('private HTTPS spatial transport', () => {
  let server: Server, certificate: Buffer, port: number
  let bridge: ReturnType<typeof createSpatialBridge>
  let directory: string
  const origin = 'https://localhost:8443'
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'xnet-spatial-tls-'))
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost'
      ],
      { stdio: 'ignore' }
    )
    certificate = readFileSync(join(directory, 'cert.pem'))
    const adapter = fixtureAdapter(10),
      signal = new AbortController().signal
    bridge = createSpatialBridge(
      {
        snapshot: await adapter.snapshot(signal),
        detail: (id) => adapter.detail(id, signal),
        thumbnail: async () => null
      },
      origin
    )
    server = createSpatialServer({
      cert: certificate,
      key: readFileSync(join(directory, 'key.pem')),
      origin,
      bridge,
      assets: new Map([
        ['/index.html', { data: Buffer.from('<h1>Synthetic viewer</h1>'), type: 'text/html' }]
      ])
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing TLS port')
    port = address.port
  })
  afterAll(async () => {
    bridge?.revoke()
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
    }
    if (directory) rmSync(directory, { recursive: true, force: true })
  })
  const read = (path: string, token = '', method = 'GET', headers: Record<string, string> = {}) =>
    new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
      (done, reject) => {
        // Trust only the temporary test certificate; normal hostname verification stays enabled.
        const req = request(
          {
            hostname: '127.0.0.1',
            servername: 'localhost',
            port,
            path,
            method,
            ca: certificate,
            headers: {
              Host: 'localhost:8443',
              Origin: origin,
              Authorization: `Bearer ${token}`,
              ...headers
            }
          },
          (response) => {
            let body = ''
            response.setEncoding('utf8')
            response.on('data', (chunk: string) => {
              body += chunk
            })
            response.on('end', () =>
              done({ status: response.statusCode!, headers: response.headers, body })
            )
          }
        )
        req.on('error', reject)
        req.end()
      }
    )
  it('serves compiled assets with secure browser policies and denies other hosts/origins', async () => {
    const page = await read('/')
    expect(page.status).toBe(200)
    expect(page.headers['content-security-policy']).toContain("connect-src 'self'")
    expect(page.headers['permissions-policy']).toBe('xr-spatial-tracking=(self)')
    expect((await read('/', '', 'GET', { Host: 'evil.example' })).status).toBe(403)
    expect((await read('/', '', 'GET', { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await read('/src/main/index.ts')).status).toBe(404)
  })
  it('exchanges the invitation over verified TLS, then revokes reads', async () => {
    expect((await read('/api/snapshot')).status).toBe(401)
    const paired = await read('/pair', bridge.invitation, 'POST')
    expect(paired.status).toBe(200)
    const { token } = JSON.parse(paired.body) as { token: string }
    const snapshot = await read('/api/snapshot', token)
    expect(snapshot.status).toBe(200)
    expect(JSON.parse(snapshot.body).graph.linkCount).toBe(10)
    bridge.revoke()
    expect((await read('/api/snapshot', token)).status).toBe(401)
  })
})
