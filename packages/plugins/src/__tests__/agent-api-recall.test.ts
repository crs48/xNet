/**
 * The two-pass contract of `api.recall` / `api.graph` (exploration 0415).
 *
 * The sandbox bans `await` on purpose, so these cannot be async. Instead the
 * host runs the script twice — a priming pass that records what was asked, then
 * the real pass with the answers. The interesting assertion is the failure
 * mode: a query the priming pass never saw must **throw**, because an empty
 * array is indistinguishable from "the workspace has nothing matching".
 */

import { describe, expect, it } from 'vitest'
import {
  createAgentScriptContext,
  graphRequestKey,
  type AgentGraphEdge,
  type AgentRecallHit
} from '../sandbox/agent-api'

const NODES = [
  { id: 'page_1', schemaIRI: 'xnet://xnet.fyi/Page@1.0.0', title: 'Q3 Planning' }
] as never as Parameters<typeof createAgentScriptContext>[0]['nodes']

const HIT: AgentRecallHit = {
  id: 'page_1',
  title: 'Q3 Planning',
  path: 'Q3 Planning',
  hops: 0,
  snippet: 'Quarterly goals'
}

const EDGE: AgentGraphEdge = { id: 'row_1', relation: 'rows', direction: 'outbound', hops: 1 }

describe('agent script recall/graph', () => {
  it('records queries and returns empty during the priming pass', () => {
    const session = createAgentScriptContext({ nodes: NODES })
    expect(session.context.api.recall('planning')).toEqual([])
    expect(session.context.api.graph('db_projects', 2)).toEqual([])

    const requested = session.getRequestedContext()
    expect(requested.recall).toEqual(['planning'])
    expect(requested.graph).toEqual([{ nodeId: 'db_projects', hops: 2 }])
  })

  it('de-duplicates repeated requests so the host resolves each once', () => {
    const session = createAgentScriptContext({ nodes: NODES })
    session.context.api.recall('planning')
    session.context.api.recall('planning')
    session.context.api.graph('db_projects', 1)
    session.context.api.graph('db_projects', 1)

    const requested = session.getRequestedContext()
    expect(requested.recall).toHaveLength(1)
    expect(requested.graph).toHaveLength(1)
  })

  it('serves resolved answers on the real pass', () => {
    const session = createAgentScriptContext({
      nodes: NODES,
      resolved: {
        recall: new Map([['planning', [HIT]]]),
        graph: new Map([[graphRequestKey('db_projects', 1), [EDGE]]])
      }
    })
    expect(session.context.api.recall('planning')).toEqual([HIT])
    expect(session.context.api.graph('db_projects', 1)).toEqual([EDGE])
    // Frozen: a script cannot mutate the host's cached answers.
    expect(Object.isFrozen(session.context.api.recall('planning')[0])).toBe(true)
  })

  it('throws — never returns empty — for a query the priming pass never saw', () => {
    const session = createAgentScriptContext({
      nodes: NODES,
      resolved: { recall: new Map([['planning', [HIT]]]), graph: new Map() }
    })
    expect(() => session.context.api.recall('something else')).toThrow(/was not resolved/)
    expect(() => session.context.api.recall('something else')).toThrow(/run twice/)
  })

  it('throws for an unresolved graph walk too', () => {
    const session = createAgentScriptContext({
      nodes: NODES,
      resolved: { recall: new Map(), graph: new Map() }
    })
    expect(() => session.context.api.graph('unknown', 1)).toThrow(/was not resolved/)
  })

  it('treats a different hop count as a different request', () => {
    const session = createAgentScriptContext({
      nodes: NODES,
      resolved: { recall: new Map(), graph: new Map([[graphRequestKey('a', 1), [EDGE]]]) }
    })
    expect(session.context.api.graph('a', 1)).toEqual([EDGE])
    expect(() => session.context.api.graph('a', 2)).toThrow(/was not resolved/)
  })
})
