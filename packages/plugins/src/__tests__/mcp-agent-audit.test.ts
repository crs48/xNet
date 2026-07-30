/**
 * MCP server with an agent-audit session (exploration 0337): tool calls route
 * through the recorder, ceremony tools are exposed, pending payloads relay.
 */

import { describe, expect, it } from 'vitest'
import { createMCPServer } from '../services/mcp-server'
import { createMemoryNodeStore, createWorkspaceFixtureSchemas } from '../testing/memory-backend'

const mount = () => {
  const store = createMemoryNodeStore([])
  const server = createMCPServer({
    store,
    schemas: createWorkspaceFixtureSchemas(),
    agentAudit: {
      agentDID: 'did:key:zAgent',
      sessionKey: 'openclaw:main',
      channel: 'telegram',
      peer: 'tg-1',
      spaceId: 'space-audit'
    }
  })
  return { server, store }
}

const call = async (
  server: ReturnType<typeof mount>['server'],
  name: string,
  args: Record<string, unknown> = {}
) => {
  const response = await server.handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args }
  })
  if (response.error) throw new Error(response.error.message)
  const content = (response.result as { content: Array<{ text: string }> }).content[0].text
  return JSON.parse(content)
}

describe('MCP agent-audit session (exploration 0337)', () => {
  it('exposes the ceremony + outbox tools and stamps _instruction on AI tools', () => {
    const { server } = mount()
    const names = server.getTools().map((t) => t.name)
    for (const expected of [
      'xnet_approve',
      'xnet_deny',
      'xnet_pending_approvals',
      'xnet_undo',
      'xnet_poll_notifications'
    ]) {
      expect(names).toContain(expected)
    }
    const search = server.getTools().find((t) => t.name === 'xnet_search')!
    expect(search.inputSchema.properties._instruction).toBeDefined()
  })

  it('a low-risk call executes and lands an AgentAction node', async () => {
    const { server, store } = mount()
    await call(server, 'xnet_search', { query: 'notes', _instruction: 'find my notes' })
    const actions = (await store.list({ schemaId: 'xnet://xnet.fyi/AgentAction@1.0.0' })).filter(
      (n) => !n.deleted
    )
    expect(actions).toHaveLength(1)
    expect(actions[0].properties).toMatchObject({
      tool: 'xnet_search',
      status: 'applied',
      instruction: 'find my notes'
    })
  })

  it('a medium-risk call returns a chat pending payload; xnet_approve releases it', async () => {
    const { server, store } = mount()
    // xnet_plan_page_patch is the built-in medium-risk tool (plan, not apply).
    const pending = await call(server, 'xnet_plan_page_patch', {
      pageId: 'missing-page',
      markdown: '# hi'
    })
    expect(pending.pending).toBe(true)
    expect(pending.surface).toBe('chat')
    expect(typeof pending.nonce).toBe('string')

    // Wrong code is rejected...
    await expect(call(server, 'xnet_approve', { code: 'NOPE99' })).rejects.toThrow()

    // ...the relayed code releases the call (which then fails on the missing
    // page — proving the underlying tool actually executed post-approval).
    await expect(call(server, 'xnet_approve', { code: pending.nonce })).rejects.toThrow(
      /not found|Unknown|missing/i
    )
    const actions = (await store.list({ schemaId: 'xnet://xnet.fyi/AgentAction@1.0.0' })).filter(
      (n) => !n.deleted
    )
    expect(actions[0].properties.status).toBe('failed')
    const approvals = (
      await store.list({ schemaId: 'xnet://xnet.fyi/AgentApproval@1.0.0' })
    ).filter((n) => !n.deleted)
    expect(approvals[0].properties.decision).toBe('approved')
  })

  it('a high-risk apply is app-only: no nonce, chat cannot release it', async () => {
    const { server } = mount()
    const pending = await call(server, 'xnet_apply_page_markdown', {
      pageId: 'p1',
      planId: 'plan-x',
      baseRevision: 'r0',
      markdown: '# hi',
      confirmApply: true
    })
    expect(pending.pending).toBe(true)
    expect(pending.surface).toBe('app')
    expect(pending.nonce).toBeUndefined()
    expect(pending.message).toContain('xNet app')
  })
})
