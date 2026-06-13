/**
 * Tests for `xnet mcp serve` (exploration 0175).
 *
 * Drives the command's exported core with an in-memory backend so we never
 * need a running local API.
 */

import type { AgentBackend } from '../utils/agent-remote.js'
import { createMemoryNodeStore, createMemorySchemaRegistry } from '@xnetjs/plugins/node'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildMcpServer,
  openClawHttpConfigSnippet,
  startMcpServe,
  type McpBackendFactory,
  type McpServeHandle
} from '../commands/mcp.js'

const ORIGIN = 'https://user.github.io'
const TOKEN = 'cli-pairing-token'

function memoryBackend(): AgentBackend {
  return {
    store: createMemoryNodeStore([
      {
        id: 'task-1',
        schemaId: 'xnet://xnet.dev/Task',
        properties: { title: 'Seed task' },
        deleted: false,
        createdAt: 1,
        updatedAt: 1
      }
    ]),
    schemas: createMemorySchemaRegistry([
      { iri: 'xnet://xnet.dev/Task', name: 'Task', properties: { title: { type: 'text' } } }
    ])
  }
}

const memoryFactory: McpBackendFactory = async () => memoryBackend()

let handle: McpServeHandle | undefined

afterEach(async () => {
  await handle?.stop()
  handle = undefined
})

describe('buildMcpServer', () => {
  it('exposes the xNet tool surface', () => {
    const server = buildMcpServer(memoryBackend())
    const names = server.getTools().map((t) => t.name)
    expect(names).toContain('xnet_search')
    expect(names).toContain('xnet_create')
    expect(names).toContain('xnet_database_query')
  })
})

describe('startMcpServe (http mode)', () => {
  it('serves the workspace over the hardened HTTP transport', async () => {
    handle = await startMcpServe(memoryFactory, {
      http: true,
      port: 0,
      pairingToken: TOKEN,
      allowOrigin: [ORIGIN]
    })
    expect(handle.mode).toBe('http')
    const http = handle.http
    if (!http) throw new Error('expected http handle')

    const ok = await fetch(`${http.url}${http.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-xnet-pairing': TOKEN, origin: ORIGIN },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { result: { tools: Array<{ name: string }> } }
    expect(body.result.tools.map((t) => t.name)).toContain('xnet_search')
  })

  it('rejects requests without the pairing token', async () => {
    handle = await startMcpServe(memoryFactory, { http: true, port: 0, pairingToken: TOKEN })
    const http = handle.http
    if (!http) throw new Error('expected http handle')
    const res = await fetch(`${http.url}${http.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    })
    expect(res.status).toBe(401)
  })

  it('reports stdio mode without binding a port', async () => {
    handle = await startMcpServe(memoryFactory, {})
    expect(handle.mode).toBe('stdio')
    expect(handle.http).toBeUndefined()
  })
})

describe('openClawHttpConfigSnippet', () => {
  it('produces a streamable-http config carrying the pairing token', async () => {
    handle = await startMcpServe(memoryFactory, { http: true, port: 0, pairingToken: TOKEN })
    const http = handle.http
    if (!http) throw new Error('expected http handle')
    const snippet = openClawHttpConfigSnippet(http)
    expect(snippet).toContain('streamable-http')
    expect(snippet).toContain(TOKEN)
    expect(snippet).toContain(`${http.url}${http.path}`)
  })
})
