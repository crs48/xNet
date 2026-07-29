/**
 * The in-chat approval ceremony (0394 Phase 2): reads bypass, low writes
 * execute+audit, medium parks on the nonce reply, high refuses chat and needs
 * the in-app approval, denial and expiry resolve the model's tool call
 * honestly instead of hanging the turn.
 */

import type { AiSurfaceService, AiToolDefinition, NodeStoreAPI } from '@xnetjs/plugins'
import { describe, expect, it, vi } from 'vitest'
import { createChatCeremony, type CeremonyPending } from './ai-chat-ceremony'

const TOOLS: Array<Pick<AiToolDefinition, 'name' | 'risk'>> = [
  { name: 'xnet_search', risk: 'low' },
  { name: 'xnet_validate_page_markdown', risk: 'low' },
  { name: 'xnet_plan_page_patch', risk: 'medium' },
  { name: 'xnet_apply_page_markdown', risk: 'high' }
]

function fakeSurface(): AiSurfaceService & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    getTools: () => TOOLS as AiToolDefinition[],
    callTool: async (name: string) => {
      calls.push(name)
      return { ok: true, ran: name }
    }
  } as unknown as AiSurfaceService & { calls: string[] }
}

/** In-memory NodeStoreAPI — enough for the recorder's audit nodes. */
function fakeStore(): NodeStoreAPI & { nodes: Map<string, Record<string, unknown>> } {
  const nodes = new Map<string, Record<string, unknown>>()
  return {
    nodes,
    get: async (id) => (nodes.get(id) as never) ?? null,
    list: async () => [],
    create: async ({ id, schemaId, properties }) => {
      const nodeId = id ?? `n${nodes.size}`
      nodes.set(nodeId, { id: nodeId, schemaId, properties })
      return { id: nodeId, schemaId, properties } as never
    },
    update: async (id, { properties }) => {
      const existing = nodes.get(id) ?? { id, properties: {} }
      const merged = {
        ...existing,
        properties: { ...(existing.properties as object), ...properties }
      }
      nodes.set(id, merged)
      return merged as never
    },
    delete: async () => undefined,
    subscribe: () => () => undefined
  }
}

function setup(overrides: { ttlMs?: number; clock?: () => number } = {}) {
  const surface = fakeSurface()
  const store = fakeStore()
  const pending: CeremonyPending[] = []
  const resolved: Array<{ actionId: string; resolution: string }> = []
  const ceremony = createChatCeremony({
    surface,
    store,
    operatorDID: 'did:key:operator',
    sessionKey: 'thread-1',
    onPending: (p) => pending.push(p),
    onResolved: (actionId, resolution) => resolved.push({ actionId, resolution }),
    ...(overrides.ttlMs ? { approvalTtlMs: overrides.ttlMs } : {}),
    ...(overrides.clock ? { clock: overrides.clock } : {})
  })
  return { surface, store, pending, resolved, ceremony }
}

describe('createChatCeremony', () => {
  it('reads bypass the recorder entirely — no audit nodes for a search', async () => {
    const { surface, store, ceremony } = setup()
    const result = await ceremony.executeTool({ id: 't1', name: 'xnet_search', arguments: {} })
    expect(result).toEqual({ ok: true, ran: 'xnet_search' })
    expect(store.nodes.size).toBe(0)
    expect(surface.calls).toEqual(['xnet_search'])
  })

  it('low-risk writes execute immediately but leave an audit trail', async () => {
    const { surface, store, ceremony } = setup()
    const result = await ceremony.executeTool({
      id: 't1',
      name: 'xnet_validate_page_markdown',
      arguments: { markdown: '# hi' }
    })
    expect(result).toEqual({ ok: true, ran: 'xnet_validate_page_markdown' })
    expect(surface.calls).toEqual(['xnet_validate_page_markdown'])
    const statuses = [...store.nodes.values()].map(
      (n) => (n.properties as Record<string, unknown>).status
    )
    expect(statuses).toContain('applied')
  })

  it('medium risk parks with a code and releases on the APPROVE reply', async () => {
    const { surface, pending, resolved, ceremony } = setup()
    const call = ceremony.executeTool({
      id: 't1',
      name: 'xnet_plan_page_patch',
      arguments: { pageId: 'p1' }
    })
    await vi.waitFor(() => expect(pending.length).toBe(1))
    expect(pending[0].surface).toBe('chat')
    expect(pending[0].code).toMatch(/^[A-Z0-9]{6}$/)
    expect(pending[0].tool).toBe('xnet_plan_page_patch')
    expect(surface.calls).toEqual([]) // parked, not run

    const consumed = await ceremony.tryApproveFromChat(`approve ${pending[0].code}`)
    expect(consumed).toBe(true)
    expect(await call).toEqual({ ok: true, ran: 'xnet_plan_page_patch' })
    expect(surface.calls).toEqual(['xnet_plan_page_patch'])
    expect(resolved).toEqual([{ actionId: pending[0].actionId, resolution: 'approved' }])
  })

  it('a wrong code is not consumed and does not release anything', async () => {
    const { surface, pending, ceremony } = setup()
    void ceremony.executeTool({ id: 't1', name: 'xnet_plan_page_patch', arguments: {} })
    await vi.waitFor(() => expect(pending.length).toBe(1))
    expect(await ceremony.tryApproveFromChat('APPROVE WRONG1')).toBe(false)
    expect(await ceremony.tryApproveFromChat('just a normal message')).toBe(false)
    expect(surface.calls).toEqual([])
  })

  it('high risk refuses the chat path: no code, and APPROVE cannot release it', async () => {
    const { surface, pending, ceremony } = setup()
    const call = ceremony.executeTool({
      id: 't1',
      name: 'xnet_apply_page_markdown',
      arguments: { pageId: 'p1', markdown: '# new' }
    })
    await vi.waitFor(() => expect(pending.length).toBe(1))
    expect(pending[0].surface).toBe('app')
    expect(pending[0].code).toBeUndefined()
    expect(pending[0].message).toMatch(/cannot be approved over chat/i)

    // The deliberate in-app approval releases it, stamped with the operator DID.
    expect(await ceremony.approveFromApp(pending[0].actionId)).toBe(true)
    expect(await call).toEqual({ ok: true, ran: 'xnet_apply_page_markdown' })
    expect(surface.calls).toEqual(['xnet_apply_page_markdown'])
  })

  it('records the operator DID on the app-tier approval node', async () => {
    const { store, pending, ceremony } = setup()
    void ceremony.executeTool({ id: 't1', name: 'xnet_apply_page_markdown', arguments: {} })
    await vi.waitFor(() => expect(pending.length).toBe(1))
    await ceremony.approveFromApp(pending[0].actionId)
    const approval = [...store.nodes.values()].find(
      (n) => (n.properties as Record<string, unknown>).decision === 'approved'
    )
    expect(approval).toBeDefined()
    expect((approval!.properties as Record<string, unknown>).approverDID).toBe('did:key:operator')
  })

  it('denial resolves the tool call with an honest refusal, not a hang', async () => {
    const { surface, pending, resolved, ceremony } = setup()
    const call = ceremony.executeTool({
      id: 't1',
      name: 'xnet_apply_page_markdown',
      arguments: {}
    })
    await vi.waitFor(() => expect(pending.length).toBe(1))
    await ceremony.deny(pending[0].actionId)
    const result = (await call) as Record<string, unknown>
    expect(result.denied).toBe(true)
    expect(surface.calls).toEqual([])
    expect(resolved[0].resolution).toBe('denied')
  })

  it('expiry resolves the tool call after the TTL instead of waiting forever', async () => {
    vi.useFakeTimers()
    try {
      let now = 1_000_000
      const { surface, pending, resolved, ceremony } = setup({
        ttlMs: 5_000,
        clock: () => now
      })
      const call = ceremony.executeTool({
        id: 't1',
        name: 'xnet_plan_page_patch',
        arguments: {}
      })
      await vi.waitFor(() => expect(pending.length).toBe(1))
      now += 6_000
      await vi.advanceTimersByTimeAsync(6_000)
      const result = (await call) as Record<string, unknown>
      expect(result.expired).toBe(true)
      expect(surface.calls).toEqual([])
      expect(resolved[0].resolution).toBe('expired')
      // The expired code no longer releases anything.
      expect(await ceremony.tryApproveFromChat(`APPROVE ${pending[0].code}`)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispose resolves outstanding waiters so a torn-down runtime never hangs', async () => {
    const { pending, ceremony } = setup()
    const call = ceremony.executeTool({ id: 't1', name: 'xnet_plan_page_patch', arguments: {} })
    await vi.waitFor(() => expect(pending.length).toBe(1))
    ceremony.dispose()
    const result = (await call) as Record<string, unknown>
    expect(result.expired).toBe(true)
  })
})
