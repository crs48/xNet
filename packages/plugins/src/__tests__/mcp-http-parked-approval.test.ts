/**
 * The reported bug, end to end over the real transport (0414).
 *
 * A bridged coding agent calls a high-risk write over Streamable HTTP — the
 * exact path `apps/electron/src/main/agent-mcp-server.ts` runs. Before this
 * fix the action parked in the server's recorder where no surface could reach
 * it: the agent honestly reported "awaiting in-app approval", the app rendered
 * nothing, and five minutes later it expired having applied nothing.
 *
 * What this pins down is the half the desktop shell depends on: the parked
 * action is visible to the *host* (not just to the agent), the host can release
 * it with the operator's DID, and doing so resumes the agent's original call
 * with the real result. The Electron IPC hop and the React card sit on top of
 * exactly these three.
 */

import { describe, expect, it } from 'vitest'
import { createMcpHttpServer } from '../services/mcp-http'
import { createMCPServer } from '../services/mcp-server'
import { createMemoryNodeStore, createWorkspaceFixtureSchemas } from '../testing/memory-backend'

const AGENT_ACTION_IRI = 'xnet://xnet.fyi/AgentAction@1.0.0'
const AGENT_APPROVAL_IRI = 'xnet://xnet.fyi/AgentApproval@1.0.0'

const PAGE_SCHEMA_IRI = 'xnet://xnet.fyi/Page@1.0.0'

/** The call from the bug report: "create a page titled Fascia". */
const COMPOSE_FASCIA = {
  title: 'Fascia',
  intro: 'Superficial, deep, and visceral layers.',
  placements: [{ nodeId: 'db-1', kind: 'database', viewType: 'table' }],
  confirmApply: true
}

const pageTitles = async (store: Awaited<ReturnType<typeof mount>>['store']) =>
  (await store.list({ schemaId: PAGE_SCHEMA_IRI }))
    .filter((n) => !n.deleted)
    .map((n) => n.properties.title)

async function mount() {
  const store = createMemoryNodeStore([])
  const server = createMCPServer({
    store,
    schemas: createWorkspaceFixtureSchemas(),
    agentAudit: {
      agentDID: 'bridge:agent',
      sessionKey: 'bridge-test',
      channel: 'cli'
    }
  })
  const http = createMcpHttpServer({ server, port: 0 })
  await http.start()
  return { store, server, http }
}

/** One JSON-RPC `tools/call` over the wire, as the bridged agent makes it. */
async function callOverHttp(
  http: Awaited<ReturnType<typeof mount>>['http'],
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${http.url}${http.path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-xnet-pairing': http.pairingToken
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args }
    })
  })
  const body = (await response.json()) as {
    error?: { message: string }
    result?: { content: Array<{ text: string }> }
  }
  if (body.error) throw new Error(body.error.message)
  return JSON.parse(body.result!.content[0].text) as Record<string, unknown>
}

const untilParked = async (server: Awaited<ReturnType<typeof mount>>['server']) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    const [first] = server.listParkedApprovals()
    if (first) return first
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('the high-risk call never parked')
}

describe('a bridged high-risk write is reachable by the host (0414)', () => {
  it('parks, surfaces to the host, and resumes the agent call on approval', async () => {
    const { store, server, http } = await mount()
    try {
      const changes: number[] = []
      const unsubscribe = server.onParkedApprovalsChanged((parked) => changes.push(parked.length))

      const agentCall = callOverHttp(http, 'xnet_compose_page', COMPOSE_FASCIA)

      // 1. The host can see it. This is the list the desktop shell renders and
      //    the thing that did not exist before: `approveFromApp` had exactly one
      //    caller, inside the AI panel's own ceremony.
      const parked = await untilParked(server)
      expect(parked.surface).toBe('app')
      expect(parked.risk).toBe('high')
      expect(parked.code).toBeUndefined()
      expect(parked.tool).toBe('xnet_compose_page')
      expect(changes).toContain(1)

      // 2. Nothing was written while it waited.
      expect(await pageTitles(store)).toEqual([])

      // 3. The host releases it as the operator, and the agent's original call
      //    — still open on the wire — resolves with the real result.
      expect(await server.approveParkedApproval(parked.actionId, 'did:key:zOperator')).toBe(true)
      const result = await agentCall
      expect(result).not.toMatchObject({ pending: true })
      expect(server.listParkedApprovals()).toHaveLength(0)
      expect(changes[changes.length - 1]).toBe(0)

      // 4. The page landed, and the trail proves a human released it.
      expect(result).toMatchObject({ applied: true })
      expect(await pageTitles(store)).toEqual(['Fascia'])
      const actions = (await store.list({ schemaId: AGENT_ACTION_IRI })).filter((n) => !n.deleted)
      expect(actions[0].properties.status).toBe('applied')
      const approvals = (await store.list({ schemaId: AGENT_APPROVAL_IRI })).filter(
        (n) => !n.deleted
      )
      expect(approvals[0].properties).toMatchObject({
        decision: 'approved',
        surface: 'app',
        approverDID: 'did:key:zOperator'
      })

      unsubscribe()
    } finally {
      await http.stop()
    }
  })

  it('a denial resolves the agent call and creates no page', async () => {
    const { store, server, http } = await mount()
    try {
      const agentCall = callOverHttp(http, 'xnet_compose_page', COMPOSE_FASCIA)
      const parked = await untilParked(server)

      expect(await server.denyParkedApproval(parked.actionId, 'did:key:zOperator')).toBe(true)
      await expect(agentCall).resolves.toMatchObject({ denied: true })
      expect(await pageTitles(store)).toEqual([])

      const actions = (await store.list({ schemaId: AGENT_ACTION_IRI })).filter((n) => !n.deleted)
      expect(actions[0].properties.status).toBe('denied')
    } finally {
      await http.stop()
    }
  })
})
