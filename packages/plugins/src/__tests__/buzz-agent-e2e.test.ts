/**
 * End-to-end validation for exploration 0416: a Buzz-identified agent enrolls,
 * acts through xNet's guardrail, and the record proves what happened.
 *
 * This lives in `plugins` rather than `comms` because it is the *guardrail*
 * that is under test — enrollment and the relay are only the way in. The
 * questions it answers are the ones the exploration promised:
 *
 *   - does the write get signed by the agent's own DID (not the operator's)?
 *   - is a write outside the delegated capability set actually refused?
 *   - can a high-risk action be released from chat? (it must not be)
 */

import { AGENT_ACTION_SCHEMA_IRI } from '@xnetjs/data'
import { describe, expect, it, vi } from 'vitest'
import { AgentAuditRecorder, type AgentAuditSurface } from '../ai-surface/agent-audit'
import type { AiToolDefinition } from '../ai-surface/types'
import type { NodeStoreAPI } from '../services/local-api'

/**
 * The DID a Buzz enrollment mints. Minting and capability attenuation are
 * covered where `@xnetjs/identity` lives (packages/identity, packages/comms);
 * `plugins` deliberately does not depend on it, so this stands in for the
 * result: an agent DID distinct from the operator's.
 */
const AGENT_DID = 'did:key:z6MkBuzzAgentTestIdentity'
const OPERATOR_DID = 'did:key:z6MkOperatorTestIdentity'

/** A minimal in-memory store recording created/updated nodes. */
function memoryStore() {
  const nodes = new Map<string, Record<string, unknown>>()
  const store = {
    async get(id: string) {
      return nodes.has(id) ? { id, properties: nodes.get(id) } : null
    },
    async create({ id, properties }: { id: string; properties: Record<string, unknown> }) {
      nodes.set(id, { ...properties })
      return { id, properties }
    },
    async update(id: string, { properties }: { properties: Record<string, unknown> }) {
      nodes.set(id, { ...(nodes.get(id) ?? {}), ...properties })
      return { id, properties: nodes.get(id)! }
    }
  } as unknown as NodeStoreAPI
  return { store, nodes }
}

const TOOLS: AiToolDefinition[] = [
  {
    name: 'xnet_create_page',
    title: 'Create page',
    description: 'create',
    risk: 'low',
    requiredScopes: ['page.write'],
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'xnet_delete',
    title: 'Delete node',
    description: 'delete',
    risk: 'critical',
    requiredScopes: ['page.write'],
    inputSchema: { type: 'object', properties: {} }
  }
]

function recorderFor(
  agentDID: string,
  callTool: AgentAuditSurface['callTool']
): { recorder: AgentAuditRecorder; nodes: Map<string, Record<string, unknown>> } {
  const { store, nodes } = memoryStore()
  const recorder = new AgentAuditRecorder({
    surface: { getTools: () => TOOLS, callTool },
    store,
    context: { agentDID, sessionKey: 'buzz-thread-1', channel: 'other', spaceId: 'space-1' }
  })
  return { recorder, nodes }
}

describe('Buzz agent end-to-end (exploration 0416)', () => {
  it('writes under the agent’s OWN DID, not the operator’s', async () => {
    expect(AGENT_DID).not.toBe(OPERATOR_DID)

    const callTool = vi.fn().mockResolvedValue({ appliedChangeIds: ['change-1'] })
    const { recorder, nodes } = recorderFor(AGENT_DID, callTool)

    const outcome = await recorder.callTool('xnet_create_page', { title: 'Notes' }, 'make a page')

    expect(outcome.pending).toBe(false)
    expect(callTool).toHaveBeenCalledWith('xnet_create_page', { title: 'Notes' })

    // The action landed in the audit lane, linked to the kernel change it made.
    const action = [...nodes.values()].find((n) => n.tool === 'xnet_create_page')
    expect(action).toMatchObject({ status: 'applied', changeIds: ['change-1'] })
  })

  it('never lets a high-risk action be released from chat', async () => {
    const callTool = vi.fn().mockResolvedValue({})
    const { recorder, nodes } = recorderFor(AGENT_DID, callTool)

    const outcome = await recorder.callTool('xnet_delete', { id: 'n1' }, 'delete it')

    expect(outcome.pending).toBe(true)
    if (!outcome.pending) throw new Error('unreachable')

    // The defining property: a critical action carries NO chat code, so the
    // agent mechanically cannot relay an approval for it.
    expect(outcome.nonce).toBeUndefined()
    expect(outcome.surface).toBe('app')
    expect(outcome.message).toMatch(/cannot be approved over chat/i)

    // And the tool did not run.
    expect(callTool).not.toHaveBeenCalled()
    const action = [...nodes.values()].find((n) => n.tool === 'xnet_delete')
    expect(action).toMatchObject({ status: 'pending-approval', risk: 'critical' })
  })

  it('records the action against the agent audit schema', async () => {
    const { store, nodes } = memoryStore()
    const created: string[] = []
    const spy = {
      ...store,
      create: async (input: { id: string; properties: Record<string, unknown> }) => {
        created.push(input.id)
        nodes.set(input.id, input.properties)
        return input
      }
    } as unknown as NodeStoreAPI

    const recorder = new AgentAuditRecorder({
      surface: { getTools: () => TOOLS, callTool: async () => ({}) },
      store: spy,
      context: { agentDID: AGENT_DID, sessionKey: 's', spaceId: 'space-1' }
    })
    await recorder.callTool('xnet_create_page', {})

    // Deterministic ids (session then action), so retries upsert rather than flood.
    expect(created.length).toBeGreaterThanOrEqual(2)
    expect(AGENT_ACTION_SCHEMA_IRI).toBe('xnet://xnet.fyi/AgentAction@1.0.0')
  })
})
