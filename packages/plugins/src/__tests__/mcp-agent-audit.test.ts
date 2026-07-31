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

/**
 * A parked call never settles on its own, so tests await the park rather than
 * the call. Polls the host-facing list — the same one the desktop shell reads.
 */
const waitForParked = async (server: ReturnType<typeof mount>['server'], expected = 1) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const parked = server.listParkedApprovals()
    if (parked.length >= expected) return parked
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`No approval parked after waiting (expected ${expected})`)
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

  it('a medium-risk call parks until the relayed code releases it', async () => {
    const { server, store } = mount()
    // xnet_plan_page_patch is the built-in medium-risk tool (plan, not apply).
    // The call now parks: it stays unsettled until the operator decides, so an
    // approval resumes the agent's turn with the real result.
    const parked = call(server, 'xnet_plan_page_patch', {
      pageId: 'missing-page',
      markdown: '# hi'
    })
    const [pending] = await waitForParked(server)
    expect(pending.surface).toBe('chat')
    expect(typeof pending.code).toBe('string')

    // Wrong code is rejected and leaves the action parked...
    await expect(call(server, 'xnet_approve', { code: 'NOPE99' })).rejects.toThrow()
    expect(server.listParkedApprovals()).toHaveLength(1)

    // ...the relayed code releases it, and the failure of the underlying tool
    // (the page does not exist) surfaces on the parked call rather than on the
    // approval — proving the tool actually executed post-approval.
    await expect(call(server, 'xnet_approve', { code: pending.code })).resolves.toEqual({
      approved: true
    })
    await expect(parked).rejects.toThrow(/not found|Unknown|missing/i)
    expect(server.listParkedApprovals()).toHaveLength(0)

    const actions = (await store.list({ schemaId: 'xnet://xnet.fyi/AgentAction@1.0.0' })).filter(
      (n) => !n.deleted
    )
    expect(actions[0].properties.status).toBe('failed')
    const approvals = (
      await store.list({ schemaId: 'xnet://xnet.fyi/AgentApproval@1.0.0' })
    ).filter((n) => !n.deleted)
    expect(approvals[0].properties.decision).toBe('approved')
  })

  it('a high-risk apply is app-only: no code, and only the host can release it', async () => {
    const { server } = mount()
    const parked = call(server, 'xnet_apply_page_markdown', {
      pageId: 'p1',
      planId: 'plan-x',
      baseRevision: 'r0',
      markdown: '# hi',
      confirmApply: true
    })
    const [pending] = await waitForParked(server)
    expect(pending.surface).toBe('app')
    expect(pending.code).toBeUndefined()
    expect(pending.message).toContain('xNet app')

    // This is the gap 0414 closed: without a host-callable release, a
    // high-risk action parks where no surface can reach it and expires.
    await expect(server.denyParkedApproval(pending.actionId, 'did:key:operator')).resolves.toBe(
      true
    )
    await expect(parked).resolves.toMatchObject({ denied: true })
    expect(server.listParkedApprovals()).toHaveLength(0)
  })

  it('the host can approve a parked high-risk action with the operator DID', async () => {
    const { server, store } = mount()
    const parked = call(server, 'xnet_apply_page_markdown', {
      pageId: 'missing-page',
      planId: 'plan-x',
      baseRevision: 'r0',
      markdown: '# hi',
      confirmApply: true
    })
    const [pending] = await waitForParked(server)
    expect(await server.approveParkedApproval(pending.actionId, 'did:key:operator')).toBe(true)
    // The apply fails on the missing page; what matters here is that the
    // approval executed the tool and the operator's DID signed the decision.
    await expect(parked).rejects.toThrow()

    const approvals = (
      await store.list({ schemaId: 'xnet://xnet.fyi/AgentApproval@1.0.0' })
    ).filter((n) => !n.deleted)
    expect(approvals[0].properties).toMatchObject({
      decision: 'approved',
      surface: 'app',
      approverDID: 'did:key:operator'
    })
  })

  it('approving an unknown action reports false rather than a silent success', async () => {
    const { server } = mount()
    expect(await server.approveParkedApproval('nope', 'did:key:operator')).toBe(false)
    expect(await server.denyParkedApproval('nope')).toBe(false)
  })
})
