/**
 * The shared park/settle broker (0414): a medium+ risk call is held until the
 * operator decides, the bounded wait answers without un-parking the action,
 * and an approved-but-failing tool is never mistaken for a bad code.
 */

import type { AiToolDefinition } from '../ai-surface/types'
import type { AgentAuditSurface } from '../ai-surface/agent-audit'
import type { NodeStoreAPI } from '../services/local-api'
import { describe, expect, it, vi } from 'vitest'
import { AgentAuditRecorder } from '../ai-surface/agent-audit'
import { createApprovalBroker, type ParkedApproval } from '../ai-surface/approval-broker'

const TOOLS: Array<Pick<AiToolDefinition, 'name' | 'risk'>> = [
  { name: 'xnet_search', risk: 'low' },
  { name: 'xnet_plan_page_patch', risk: 'medium' },
  { name: 'xnet_apply_page_markdown', risk: 'high' }
]

function fakeSurface(fail?: string): AgentAuditSurface & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    getTools: () => TOOLS as AiToolDefinition[],
    callTool: async (name: string) => {
      calls.push(name)
      if (name === fail) throw new Error('page not found')
      return { ok: true, ran: name }
    }
  }
}

/** In-memory NodeStoreAPI — enough for the recorder's audit nodes. */
function fakeStore(): NodeStoreAPI {
  const nodes = new Map<string, Record<string, unknown>>()
  return {
    get: async (id) => (nodes.get(id) as never) ?? null,
    list: async () => [],
    create: async ({ id, schemaId, properties }) => {
      const nodeId = id ?? `n${nodes.size}`
      nodes.set(nodeId, { id: nodeId, schemaId, properties })
      return { id: nodeId, schemaId, properties } as never
    },
    update: async (id, { properties }) => {
      const existing = nodes.get(id) ?? { id, properties: {} }
      const merged = { ...existing, properties: { ...(existing.properties as object), ...properties } }
      nodes.set(id, merged)
      return merged as never
    },
    delete: async () => undefined,
    subscribe: () => () => undefined
  }
}

function setup(options: { fail?: string; maxWaitMs?: number; ttlMs?: number } = {}) {
  const surface = fakeSurface(options.fail)
  const recorder = new AgentAuditRecorder({
    surface,
    store: fakeStore(),
    context: { agentDID: 'did:key:zAgent', sessionKey: 'session-1', channel: 'cli' },
    ...(options.ttlMs ? { approvalTtlMs: options.ttlMs } : {})
  })
  const parkedEvents: ParkedApproval[] = []
  const resolvedEvents: Array<{ actionId: string; resolution: string }> = []
  const broker = createApprovalBroker(recorder, {
    ...(options.maxWaitMs !== undefined ? { maxWaitMs: options.maxWaitMs } : {}),
    onParked: (parked) => parkedEvents.push(parked),
    onResolved: (actionId, resolution) => resolvedEvents.push({ actionId, resolution })
  })
  return { surface, recorder, broker, parkedEvents, resolvedEvents }
}

/** A parked call never settles on its own, so wait on the parked list. */
const untilParked = async (broker: ReturnType<typeof setup>['broker']) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [first] = broker.listParked()
    if (first) return first
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error('nothing parked')
}

describe('createApprovalBroker', () => {
  it('executes low-risk calls without parking', async () => {
    const { broker, parkedEvents } = setup()
    await expect(broker.callTool('xnet_search', { q: 'x' })).resolves.toEqual({
      ok: true,
      ran: 'xnet_search'
    })
    expect(parkedEvents).toHaveLength(0)
    expect(broker.listParked()).toHaveLength(0)
  })

  it('parks a high-risk call with no code and releases it on approve', async () => {
    const { broker, surface, resolvedEvents } = setup()
    const call = broker.callTool('xnet_apply_page_markdown', { pageId: 'p1' })
    const parked = await untilParked(broker)

    expect(parked.surface).toBe('app')
    expect(parked.code).toBeUndefined()
    expect(parked.tool).toBe('xnet_apply_page_markdown')
    expect(parked.args).toEqual({ pageId: 'p1' })
    // Nothing ran while it waited.
    expect(surface.calls).toEqual([])

    expect(await broker.approve(parked.actionId, 'did:key:operator')).toBe(true)
    await expect(call).resolves.toEqual({ ok: true, ran: 'xnet_apply_page_markdown' })
    expect(resolvedEvents).toEqual([{ actionId: parked.actionId, resolution: 'approved' }])
    expect(broker.listParked()).toHaveLength(0)
  })

  it('resolves a denied call honestly instead of hanging the turn', async () => {
    const { broker, surface } = setup()
    const call = broker.callTool('xnet_apply_page_markdown', {})
    const parked = await untilParked(broker)

    expect(await broker.deny(parked.actionId, 'did:key:operator')).toBe(true)
    await expect(call).resolves.toMatchObject({ denied: true })
    expect(surface.calls).toEqual([])
  })

  it('releases a chat-tier call by its code, and rejects an unknown code', async () => {
    const { broker } = setup()
    const call = broker.callTool('xnet_plan_page_patch', {})
    const parked = await untilParked(broker)

    expect(parked.surface).toBe('chat')
    expect(typeof parked.code).toBe('string')
    expect(await broker.approveWithCode('NOPE99')).toBe(false)
    expect(broker.listParked()).toHaveLength(1)

    expect(await broker.approveWithCode(parked.code!)).toBe(true)
    await expect(call).resolves.toMatchObject({ ran: 'xnet_plan_page_patch' })
  })

  it('reports an approved-but-failing tool as a failure, not as a bad code', async () => {
    const { broker, resolvedEvents } = setup({ fail: 'xnet_plan_page_patch' })
    const call = broker.callTool('xnet_plan_page_patch', {})
    const parked = await untilParked(broker)

    // The recorder throws for both a wrong code and a released tool that
    // failed. Conflating them would tell the caller their code was bad while
    // an approved action was busy failing underneath.
    expect(await broker.approveWithCode(parked.code!)).toBe(true)
    await expect(call).rejects.toThrow(/page not found/)
    expect(resolvedEvents).toEqual([{ actionId: parked.actionId, resolution: 'failed' }])
    expect(broker.listParked()).toHaveLength(0)
  })

  it('surfaces a post-approval failure from the app tier too', async () => {
    const { broker } = setup({ fail: 'xnet_apply_page_markdown' })
    const call = broker.callTool('xnet_apply_page_markdown', {})
    const parked = await untilParked(broker)

    expect(await broker.approve(parked.actionId, 'did:key:operator')).toBe(true)
    await expect(call).rejects.toThrow(/page not found/)
  })

  it('answers the bounded wait without un-parking the action', async () => {
    const { broker } = setup({ maxWaitMs: 10, ttlMs: 60_000 })
    const call = broker.callTool('xnet_apply_page_markdown', {})
    const parked = await untilParked(broker)

    // The wait gives up; the approval does not. This is what keeps a transport
    // timeout from looking like a decision.
    const answer = (await call) as Record<string, unknown>
    expect(answer.pending).toBe(true)
    expect(answer.actionId).toBe(parked.actionId)
    expect(String(answer.message)).toMatch(/did not apply anything/)
    expect(broker.listParked()).toHaveLength(1)

    // Still approvable afterwards — the operator's window is untouched.
    expect(await broker.approve(parked.actionId, 'did:key:operator')).toBe(true)
    expect(broker.listParked()).toHaveLength(0)
  })

  it('expires a parked call at its TTL and reports nothing was applied', async () => {
    vi.useFakeTimers()
    try {
      const { broker, surface } = setup({ ttlMs: 1000 })
      const call = broker.callTool('xnet_apply_page_markdown', {})
      await vi.advanceTimersByTimeAsync(1)
      expect(broker.listParked()).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(1001)
      await expect(call).resolves.toMatchObject({ expired: true })
      expect(surface.calls).toEqual([])
      expect(broker.listParked()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('notifies subscribers on park and on resolution', async () => {
    const { broker } = setup()
    const seen: number[] = []
    const unsubscribe = broker.subscribe((parked) => seen.push(parked.length))

    const call = broker.callTool('xnet_apply_page_markdown', {})
    const parked = await untilParked(broker)
    await broker.deny(parked.actionId)
    await call

    expect(seen).toEqual([1, 0])
    unsubscribe()
    await broker.callTool('xnet_search', {})
    expect(seen).toEqual([1, 0])
  })

  it('dispose resolves every waiter rather than leaving the turn hanging', async () => {
    const { broker } = setup()
    const call = broker.callTool('xnet_apply_page_markdown', {})
    await untilParked(broker)

    broker.dispose()
    await expect(call).resolves.toMatchObject({ expired: true })
    expect(broker.listParked()).toHaveLength(0)
  })
})
