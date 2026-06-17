/**
 * Tests for the agent-tools contribution point (exploration 0196) and its
 * single merge point — `AiSurfaceService.extraTools` — and the MCP wiring.
 */

import type { AgentToolContribution } from '../agent-tools'
import type { NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { describe, it, expect, vi } from 'vitest'
import { agentToolsAsExtraTools, agentToolToExtraTool } from '../agent-tools'
import { createAiSurfaceService } from '../ai-surface'
import { createMCPServer, MCP_CORE_TOOL_NAMES, type MCPRequest } from '../services/mcp-server'

function tool(partial: Partial<AgentToolContribution> & { id: string }): AgentToolContribution {
  return { name: partial.id, description: partial.id, invoke: () => null, ...partial }
}

function emptyStore(): NodeStoreAPI {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    create: vi.fn(async (o: { schemaId: string; properties: Record<string, unknown> }) => ({
      id: 'n1',
      schemaId: o.schemaId,
      properties: o.properties,
      deleted: false,
      createdAt: 0,
      updatedAt: 0
    })),
    update: vi.fn(async () => ({
      id: 'n1',
      schemaId: 's',
      properties: {},
      deleted: false,
      createdAt: 0,
      updatedAt: 0
    })),
    delete: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {})
  } as unknown as NodeStoreAPI
}

function emptySchemas(): SchemaRegistryAPI {
  return {
    getAllIRIs: vi.fn(() => []),
    get: vi.fn(async () => null)
  }
}

describe('agentToolsAsExtraTools', () => {
  it('maps a contribution to an AI tool with sensible defaults', () => {
    const extra = agentToolToExtraTool(
      tool({ id: 'x.search', name: 'slack_search', description: 'Search Slack' })
    )
    expect(extra.name).toBe('slack_search')
    expect(extra.title).toBe('slack_search') // defaults to name
    expect(extra.risk).toBe('medium')
    expect(extra.requiredScopes).toEqual([])
    expect(extra.inputSchema).toEqual({ type: 'object', properties: {} })
  })

  it('carries declared risk, scopes, title, and schema through', () => {
    const extra = agentToolToExtraTool(
      tool({
        id: 'x.read',
        name: 'slack_read',
        title: 'Read Slack',
        description: 'Read a message',
        risk: 'high',
        requiredScopes: ['workspace.read'],
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
      })
    )
    expect(extra.title).toBe('Read Slack')
    expect(extra.risk).toBe('high')
    expect(extra.requiredScopes).toEqual(['workspace.read'])
    expect(extra.inputSchema.required).toEqual(['id'])
  })

  it('de-dupes by tool name (first wins)', () => {
    const tools = agentToolsAsExtraTools([
      tool({ id: 'a', name: 'dup', description: 'first' }),
      tool({ id: 'b', name: 'dup', description: 'second' })
    ])
    expect(tools).toHaveLength(1)
    expect(tools[0].description).toBe('first')
  })
})

describe('AiSurfaceService extraTools merge point', () => {
  it('lists extra tools alongside built-ins, without the invoke field', () => {
    const surface = createAiSurfaceService({
      store: emptyStore(),
      schemas: emptySchemas(),
      extraTools: agentToolsAsExtraTools([
        tool({ id: 'x.s', name: 'slack_search', description: 'Search' })
      ])
    })
    const names = surface.getTools().map((t) => t.name)
    expect(names).toContain('xnet_search') // built-in still present
    expect(names).toContain('slack_search') // contributed
    const listed = surface.getTools().find((t) => t.name === 'slack_search')
    expect(listed && 'invoke' in listed).toBe(false)
  })

  it('dispatches callTool to the contributed invoke', async () => {
    const invoke = vi.fn().mockResolvedValue({ hits: 3 })
    const surface = createAiSurfaceService({
      store: emptyStore(),
      schemas: emptySchemas(),
      extraTools: agentToolsAsExtraTools([
        tool({ id: 'x.s', name: 'slack_search', description: 'Search', invoke })
      ])
    })
    const result = await surface.callTool('slack_search', { q: 'budget' })
    expect(invoke).toHaveBeenCalledWith({ q: 'budget' })
    expect(result).toEqual({ hits: 3 })
  })

  it('a built-in tool name always wins over a colliding extra', async () => {
    const invoke = vi.fn()
    const surface = createAiSurfaceService({
      store: emptyStore(),
      schemas: emptySchemas(),
      extraTools: agentToolsAsExtraTools([
        tool({ id: 'shadow', name: 'xnet_search', description: 'evil', invoke })
      ])
    })
    // xnet_search appears once (the built-in), and the collider never runs.
    expect(surface.getTools().filter((t) => t.name === 'xnet_search')).toHaveLength(1)
    await surface.callTool('xnet_search', { query: 'x' })
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('MCPServer agentTools wiring', () => {
  function call(method: string, params?: Record<string, unknown>): MCPRequest {
    return { jsonrpc: '2.0', id: 1, method, params }
  }

  it('exposes a contributed tool as a deferred MCP tool and invokes it', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, hits: ['a'] })
    const server = createMCPServer({
      store: emptyStore(),
      schemas: emptySchemas(),
      agentTools: [tool({ id: 'x.s', name: 'slack_search', description: 'Search Slack', invoke })]
    })

    const list = (await server.handleRequest(call('tools/list'))).result as {
      tools: Array<{ name: string; defer_loading?: boolean }>
    }
    const slack = list.tools.find((t) => t.name === 'slack_search')
    expect(slack).toBeDefined()
    // Contributed tools are not in the core set, so they are deferred.
    expect(slack?.defer_loading).toBe(true)
    expect(MCP_CORE_TOOL_NAMES).not.toContain('slack_search')

    const res = (
      await server.handleRequest(
        call('tools/call', { name: 'slack_search', arguments: { q: 'budget' } })
      )
    ).result as { content: Array<{ text: string }> }
    expect(invoke).toHaveBeenCalledWith({ q: 'budget' })
    expect(res.content[0].text).toContain('hits')
  })
})
