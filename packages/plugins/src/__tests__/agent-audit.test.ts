/**
 * Agent audit recorder + risk-tiered ceremony (exploration 0337).
 */

import type { AiToolDefinition } from '../ai-surface/types'
import { describe, expect, it, vi } from 'vitest'
import { AgentAuditRecorder, hashNonce, reversibilityForTool } from '../ai-surface/agent-audit'
import {
  createAgentCeremonyTools,
  createAgentNotificationTools
} from '../ai-surface/agent-ceremony-tools'
import { createMemoryNodeStore } from '../testing/memory-backend'
import { AGENT_NOTIFICATION_SCHEMA_IRI } from '@xnetjs/data'

const defs: AiToolDefinition[] = [
  {
    name: 'xnet_search',
    title: 'Search',
    description: '',
    risk: 'low',
    requiredScopes: ['workspace.search'],
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'xnet_apply_page_markdown',
    title: 'Apply',
    description: '',
    risk: 'medium',
    requiredScopes: ['page.write'],
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'xnet_apply_database_mutation',
    title: 'Apply DB',
    description: '',
    risk: 'high',
    requiredScopes: ['database.write.rows'],
    inputSchema: { type: 'object', properties: {} }
  }
]

const makeRecorder = (opts: { now?: () => number } = {}) => {
  const store = createMemoryNodeStore([])
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const surface = {
    getTools: () => defs,
    callTool: vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args })
      if (name === 'xnet_apply_page_markdown') {
        return { applied: true, rollbackHandle: 'rb-1', appliedChangeIds: ['page-1'] }
      }
      if (name === 'xnet_rollback_page_markdown') return { rolledBack: true }
      if (name === 'xnet_apply_database_mutation') {
        return { applied: true, appliedChangeIds: ['row-1', 'row-2'] }
      }
      return { ok: true, name }
    })
  }
  const recorder = new AgentAuditRecorder({
    surface,
    store,
    context: {
      agentDID: 'did:key:zAgent',
      sessionKey: 'agent:main:wa-4915',
      channel: 'whatsapp',
      peer: 'wa-4915',
      spaceId: 'space-audit'
    },
    clock: opts.now,
    generateNonce: () => 'AB23CD'
  })
  return { recorder, store, surface, calls }
}

const nodesOf = async (store: ReturnType<typeof createMemoryNodeStore>, schemaId: string) =>
  (await store.list({ schemaId })).filter((n) => !n.deleted)

describe('AgentAuditRecorder (exploration 0337)', () => {
  it('low risk executes immediately and records an applied AgentAction', async () => {
    const { recorder, store, calls } = makeRecorder()
    const outcome = await recorder.callTool('xnet_search', { query: 'q' }, 'find q')
    expect(outcome.pending).toBe(false)
    expect(calls.map((c) => c.name)).toEqual(['xnet_search'])

    const actions = await nodesOf(store, 'xnet://xnet.fyi/AgentAction@1.0.0')
    expect(actions).toHaveLength(1)
    expect(actions[0].id).toMatch(/^agent-action:agent-session:/)
    expect(actions[0].properties).toMatchObject({
      tool: 'xnet_search',
      risk: 'low',
      status: 'applied',
      instruction: 'find q',
      session: recorder.sessionId,
      space: 'space-audit'
    })
    // The session node materialized idempotently.
    const sessions = await nodesOf(store, 'xnet://xnet.fyi/AgentSession@1.0.0')
    expect(sessions).toHaveLength(1)
    expect(sessions[0].properties.channel).toBe('whatsapp')
  })

  it('medium risk parks the call and returns a chat nonce; APPROVE releases it', async () => {
    const { recorder, store, calls } = makeRecorder()
    const outcome = await recorder.callTool('xnet_apply_page_markdown', { pageId: 'p1' })
    expect(outcome.pending).toBe(true)
    if (!outcome.pending) throw new Error('unreachable')
    expect(outcome.surface).toBe('chat')
    expect(outcome.nonce).toBe('AB23CD')
    expect(outcome.message).toContain('APPROVE AB23CD')
    expect(calls).toHaveLength(0) // nothing executed yet

    const done = await recorder.approveFromChat('ab23cd ', 'wa-4915') // case/space-insensitive
    expect(done.pending).toBe(false)
    expect(calls.map((c) => c.name)).toEqual(['xnet_apply_page_markdown'])

    const actions = await nodesOf(store, 'xnet://xnet.fyi/AgentAction@1.0.0')
    expect(actions[0].properties.status).toBe('applied')
    expect(actions[0].properties.changeIds).toEqual(['page-1'])

    const approvals = await nodesOf(store, 'xnet://xnet.fyi/AgentApproval@1.0.0')
    expect(approvals).toHaveLength(1)
    expect(approvals[0].properties).toMatchObject({
      surface: 'chat',
      decision: 'approved',
      peer: 'wa-4915',
      nonceHash: await hashNonce('AB23CD')
    })
    // The durable node never stores the nonce itself.
    expect(JSON.stringify(approvals[0].properties)).not.toContain('AB23CD')
  })

  it('a wrong nonce is rejected', async () => {
    const { recorder } = makeRecorder()
    await recorder.callTool('xnet_apply_page_markdown', {})
    await expect(recorder.approveFromChat('WRONG1')).rejects.toThrow(/wrong or expired/)
  })

  it('the nonce expires after the TTL and the action lands denied/expired', async () => {
    let now = 1_000_000
    const { recorder, store, calls } = makeRecorder({ now: () => now })
    await recorder.callTool('xnet_apply_page_markdown', {})
    now += 5 * 60 * 1000 + 1
    await expect(recorder.approveFromChat('AB23CD')).rejects.toThrow(/wrong or expired/)
    expect(calls).toHaveLength(0)

    const actions = await nodesOf(store, 'xnet://xnet.fyi/AgentAction@1.0.0')
    expect(actions[0].properties.status).toBe('denied')
    const approvals = await nodesOf(store, 'xnet://xnet.fyi/AgentApproval@1.0.0')
    expect(approvals[0].properties.decision).toBe('expired')
  })

  it('high risk carries no nonce and chat cannot release it; app approval can', async () => {
    const { recorder, store, calls } = makeRecorder()
    const outcome = await recorder.callTool('xnet_apply_database_mutation', {})
    expect(outcome.pending).toBe(true)
    if (!outcome.pending) throw new Error('unreachable')
    expect(outcome.surface).toBe('app')
    expect(outcome.nonce).toBeUndefined()
    expect(outcome.message).toContain('xNet app')

    // Chat approval mechanically cannot find it (no nonce hash to match).
    await expect(recorder.approveFromChat('AB23CD')).rejects.toThrow()

    const done = await recorder.approveFromApp(outcome.actionId, 'did:key:zOperator')
    expect(done.pending).toBe(false)
    expect(calls.map((c) => c.name)).toEqual(['xnet_apply_database_mutation'])

    const approvals = await nodesOf(store, 'xnet://xnet.fyi/AgentApproval@1.0.0')
    expect(approvals[0].properties).toMatchObject({
      surface: 'app',
      decision: 'approved',
      approverDID: 'did:key:zOperator'
    })
  })

  it('deny records the decision and never executes', async () => {
    const { recorder, store, calls } = makeRecorder()
    const outcome = await recorder.callTool('xnet_apply_page_markdown', {})
    if (!outcome.pending) throw new Error('expected pending')
    await recorder.deny(outcome.actionId, 'did:key:zOperator')
    expect(calls).toHaveLength(0)
    const actions = await nodesOf(store, 'xnet://xnet.fyi/AgentAction@1.0.0')
    expect(actions[0].properties.status).toBe('denied')
  })

  it('undo honors reversibility: rolls back reversible, refuses compensatable', async () => {
    const { recorder, store, calls } = makeRecorder()
    const pending = await recorder.callTool('xnet_apply_page_markdown', {})
    if (!pending.pending) throw new Error('expected pending')
    await recorder.approveFromChat('AB23CD')

    const result = await recorder.undo(pending.actionId)
    expect(result).toEqual({ rolledBack: true })
    expect(calls.at(-1)).toMatchObject({
      name: 'xnet_rollback_page_markdown',
      args: { rollbackHandle: 'rb-1', confirmRollback: true }
    })
    const actions = await nodesOf(store, 'xnet://xnet.fyi/AgentAction@1.0.0')
    expect(actions[0].properties.status).toBe('rolled-back')

    // A compensatable (database) action refuses automatic undo.
    const dbPending = await recorder.callTool('xnet_apply_database_mutation', {})
    if (!dbPending.pending) throw new Error('expected pending')
    await recorder.approveFromApp(dbPending.actionId, 'did:key:zOperator')
    await expect(recorder.undo(dbPending.actionId)).rejects.toThrow(/compensatable/)
  })

  it('a failing tool records status failed with the error', async () => {
    const { recorder, store, surface } = makeRecorder()
    surface.callTool.mockRejectedValueOnce(new Error('boom'))
    await expect(recorder.callTool('xnet_search', {})).rejects.toThrow('boom')
    const actions = await nodesOf(store, 'xnet://xnet.fyi/AgentAction@1.0.0')
    expect(actions[0].properties).toMatchObject({ status: 'failed', error: 'boom' })
  })

  it('redacts instructions when configured', async () => {
    const store = createMemoryNodeStore([])
    const recorder = new AgentAuditRecorder({
      surface: { getTools: () => defs, callTool: async () => ({ ok: true }) },
      store,
      context: {
        agentDID: 'did:key:zAgent',
        sessionKey: 'k',
        redactInstructions: true
      }
    })
    await recorder.callTool('xnet_search', {}, 'secret plans')
    const actions = await nodesOf(store, 'xnet://xnet.fyi/AgentAction@1.0.0')
    expect(String(actions[0].properties.instruction)).toMatch(/^\[redacted 12 chars sha256:/)
    expect(String(actions[0].properties.instruction)).not.toContain('secret')
  })
})

describe('reversibilityForTool', () => {
  it('classifies the built-in tools', () => {
    expect(reversibilityForTool('xnet_apply_page_markdown')).toBe('reversible')
    expect(reversibilityForTool('xnet_apply_database_mutation')).toBe('compensatable')
    expect(reversibilityForTool('xnet_delete')).toBe('irreversible')
    expect(reversibilityForTool('xnet_anything_else')).toBe('compensatable')
  })
})

describe('agent ceremony + notification tools', () => {
  it('xnet_approve redeems a chat code end-to-end', async () => {
    const { recorder } = makeRecorder()
    const tools = createAgentCeremonyTools(recorder)
    const approve = tools.find((t) => t.name === 'xnet_approve')!
    await recorder.callTool('xnet_apply_page_markdown', {})
    const outcome = (await approve.invoke({ code: 'AB23CD' })) as { pending: boolean }
    expect(outcome.pending).toBe(false)
  })

  it('xnet_pending_approvals never leaks nonces', async () => {
    const { recorder } = makeRecorder()
    const tools = createAgentCeremonyTools(recorder)
    await recorder.callTool('xnet_apply_page_markdown', {})
    const listing = tools.find((t) => t.name === 'xnet_pending_approvals')!
    const result = (await listing.invoke({})) as { pending: unknown[] }
    expect(result.pending).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('AB23CD')
  })

  it('xnet_poll_notifications drains pending outbox nodes oldest-first', async () => {
    const store = createMemoryNodeStore([])
    await store.create({
      schemaId: AGENT_NOTIFICATION_SCHEMA_IRI,
      properties: { title: 'first', status: 'pending', kind: 'info' }
    })
    await store.create({
      schemaId: AGENT_NOTIFICATION_SCHEMA_IRI,
      properties: { title: 'already seen', status: 'delivered', kind: 'info' }
    })
    const [poll] = createAgentNotificationTools(store)
    const result = (await poll.invoke({ markDelivered: true })) as {
      notifications: Array<{ title: string }>
    }
    expect(result.notifications.map((n) => n.title)).toEqual(['first'])
    // Marked delivered — a second poll drains nothing.
    const again = (await poll.invoke({})) as { notifications: unknown[] }
    expect(again.notifications).toHaveLength(0)
  })
})
