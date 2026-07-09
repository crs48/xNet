/**
 * Tests for the MCP HTTP transport (exploration 0175).
 *
 * Spins up a real server over the in-memory backend on an ephemeral loopback
 * port and exercises the trust-boundary rules with `fetch`.
 */

import { request } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMcpHttpServer, type McpHttpServerHandle } from '../services/mcp-http'
import { createMCPServer } from '../services/mcp-server'
import { createMemoryNodeStore, createMemorySchemaRegistry } from '../testing/memory-backend'

const ORIGIN = 'https://user.github.io'
const TOKEN = 'test-pairing-token'

function buildServer() {
  const store = createMemoryNodeStore([
    {
      id: 'task-1',
      schemaId: 'xnet://xnet.dev/Task',
      properties: { title: 'Existing task' },
      deleted: false,
      createdAt: 1,
      updatedAt: 1
    }
  ])
  const schemas = createMemorySchemaRegistry([
    { iri: 'xnet://xnet.dev/Task', name: 'Task', properties: { title: { type: 'text' } } }
  ])
  return createMCPServer({ store, schemas })
}

let handle: McpHttpServerHandle

beforeEach(async () => {
  handle = createMcpHttpServer({
    server: buildServer(),
    pairingToken: TOKEN,
    allowedOrigins: [ORIGIN],
    port: 0
  })
  await handle.start()
})

afterEach(async () => {
  await handle.stop()
})

const rpc = (id: number, method: string, params?: unknown) =>
  JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })

const post = (body: string, headers: Record<string, string> = {}) =>
  fetch(`${handle.url}${handle.path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body
  })

describe('createMcpHttpServer — boundary hardening', () => {
  it('refuses to bind a non-loopback host', () => {
    expect(() => createMcpHttpServer({ server: buildServer(), host: '0.0.0.0' })).toThrow(
      /non-loopback/
    )
  })

  it('generates a pairing token when none is provided', () => {
    const h = createMcpHttpServer({ server: buildServer() })
    expect(h.pairingToken).toMatch(/[A-Za-z0-9_-]{16,}/)
  })

  it('rejects requests with a missing pairing token (401)', async () => {
    const res = await post(rpc(1, 'tools/list'), { 'x-xnet-pairing': '' })
    expect(res.status).toBe(401)
  })

  it('rejects requests with a wrong pairing token (401)', async () => {
    const res = await post(rpc(1, 'tools/list'), { 'x-xnet-pairing': 'nope' })
    expect(res.status).toBe(401)
  })

  it('rejects a browser Origin that is not allowlisted (403)', async () => {
    const res = await post(rpc(1, 'tools/list'), {
      'x-xnet-pairing': TOKEN,
      origin: 'https://evil.example'
    })
    expect(res.status).toBe(403)
  })

  it('allows a non-browser client (no Origin) with a valid token', async () => {
    const res = await post(rpc(1, 'tools/list'), { 'x-xnet-pairing': TOKEN })
    expect(res.status).toBe(200)
  })

  it('echoes the allowlisted Origin and PNA header on a preflight', async () => {
    const res = await fetch(`${handle.url}${handle.path}`, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN }
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-private-network')).toBe('true')
  })

  it('never reflects a wildcard Origin', async () => {
    const res = await fetch(`${handle.url}${handle.path}`, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN }
    })
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*')
  })

  it('serves an unauthenticated health probe', async () => {
    const res = await fetch(`${handle.url}/health`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; server: { name: string } }
    expect(body.ok).toBe(true)
    expect(body.server.name).toBe('xnet')
  })

  it('rejects a request whose Host is not our loopback authority (anti-rebind, 403)', async () => {
    // fetch/undici overrides Host with the URL authority, so simulate a
    // DNS-rebinding request (attacker hostname reaching 127.0.0.1) via node:http.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        { hostname: '127.0.0.1', port: handle.port, path: '/health', headers: { host: 'evil.example' } },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        }
      )
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(403)
  })
})

describe('createMcpHttpServer — JSON-RPC round trips', () => {
  it('handles initialize', async () => {
    const res = await post(rpc(1, 'initialize'), { 'x-xnet-pairing': TOKEN, origin: ORIGIN })
    const body = (await res.json()) as { result: { serverInfo: { name: string } } }
    expect(body.result.serverInfo.name).toBe('xnet')
  })

  it('lists tools', async () => {
    const res = await post(rpc(2, 'tools/list'), { 'x-xnet-pairing': TOKEN, origin: ORIGIN })
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } }
    const names = body.result.tools.map((t) => t.name)
    expect(names).toContain('xnet_search')
    expect(names).toContain('xnet_create')
  })

  it('calls a tool that reads the store', async () => {
    const res = await post(
      rpc(3, 'tools/call', { name: 'xnet_get', arguments: { nodeId: 'task-1' } }),
      {
        'x-xnet-pairing': TOKEN,
        origin: ORIGIN
      }
    )
    const body = (await res.json()) as { result: { content: Array<{ text: string }> } }
    expect(body.result.content[0].text).toContain('Existing task')
  })

  it('calls a tool that mutates the store', async () => {
    const res = await post(
      rpc(4, 'tools/call', {
        name: 'xnet_create',
        arguments: { schema: 'xnet://xnet.dev/Task', properties: { title: 'Created via HTTP' } }
      }),
      { 'x-xnet-pairing': TOKEN, origin: ORIGIN }
    )
    const body = (await res.json()) as { result: { content: Array<{ text: string }> } }
    expect(body.result.content[0].text).toContain('Created via HTTP')
  })

  it('handles a JSON-RPC batch', async () => {
    const res = await post(`[${rpc(1, 'initialize')},${rpc(2, 'tools/list')}]`, {
      'x-xnet-pairing': TOKEN,
      origin: ORIGIN
    })
    const body = (await res.json()) as Array<{ id: number }>
    expect(body).toHaveLength(2)
    expect(body.map((r) => r.id).sort()).toEqual([1, 2])
  })

  it('returns a JSON-RPC parse error for invalid JSON', async () => {
    const res = await post('{not json', { 'x-xnet-pairing': TOKEN, origin: ORIGIN })
    const body = (await res.json()) as { error: { code: number } }
    expect(body.error.code).toBe(-32700)
  })
})
