/**
 * The 0455 loop, end to end: a plugin contributing `agentTools` activates and
 * its tools appear in a LIVE MCP server's tools/list without a restart;
 * deactivating removes them and an in-flight name resolves to a typed error.
 *
 * This is the structural fix for the extraTools bug (three hosts, three
 * omissions): the server resolves providers from the registry's
 * ServiceRegistry instead of being hand-threaded a tool list.
 */

import type { NodeStore } from '@xnetjs/data'
import { describe, expect, it, vi } from 'vitest'
import { PluginRegistry } from '../registry'
import { createMCPServer } from '../services/mcp-server'
import { createMemoryNodeStore, createMemorySchemaRegistry } from '../testing/memory-backend'

function createMockStore(): NodeStore {
  const nodes: Array<{ id: string; schemaId: string; properties: Record<string, unknown> }> = []
  return {
    list: vi.fn(async () => nodes),
    create: vi.fn(async (options: { schemaId: string; properties: Record<string, unknown> }) => {
      const node = {
        id: `node-${nodes.length}`,
        schemaId: options.schemaId,
        properties: options.properties
      }
      nodes.push(node)
      return node
    }),
    delete: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {})
  } as unknown as NodeStore
}

const manifest = {
  id: 'com.example.weather',
  name: 'Weather',
  version: '1.0.0',
  contributes: {},
  activate: (ctx: {
    registerAgentTool: (tool: {
      id: string
      name: string
      description: string
      invoke: () => unknown
    }) => unknown
  }) => {
    ctx.registerAgentTool({
      id: 'com.example.weather.today',
      name: 'weather_today',
      description: 'Fake forecast',
      invoke: () => ({ forecast: 'sunny' })
    })
  }
}

async function listToolNames(server: ReturnType<typeof createMCPServer>): Promise<string[]> {
  const response = await server.handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  })
  const result = response.result as { tools: Array<{ name: string }> }
  return result.tools.map((t) => t.name)
}

describe('agent tools resolve live through the service registry (0455)', () => {
  it('activate mid-session → tools/list gains the tool; deactivate → gone + typed error', async () => {
    const registry = new PluginRegistry(createMockStore(), 'web')

    // The "session": an MCP server built BEFORE the plugin exists, wired to
    // the registry's services — the argument no host has to remember anymore.
    const server = createMCPServer({
      store: createMemoryNodeStore([]),
      schemas: createMemorySchemaRegistry([]),
      services: registry.getServices()
    })

    expect(await listToolNames(server)).not.toContain('weather_today')

    await registry.install(manifest as never, { provenance: 'builtin' })
    expect(await listToolNames(server)).toContain('weather_today')

    const call = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'weather_today', arguments: {} }
    })
    expect(JSON.stringify(call.result)).toContain('sunny')

    await registry.deactivate(manifest.id)
    expect(await listToolNames(server)).not.toContain('weather_today')

    // In-flight name after the provider went away: typed failure, not a hang.
    const gone = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'weather_today', arguments: {} }
    })
    expect(gone.error ?? gone.result).toBeDefined()
    expect(JSON.stringify(gone)).toMatch(/Unknown|not found|error/i)
  })
})
