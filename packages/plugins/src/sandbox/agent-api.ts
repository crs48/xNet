/**
 * @xnet/agent-api - Code-execution surface for agent scripts (`xnet run`).
 *
 * Extends the read-only ScriptContext with an `api` object that can query the
 * loaded workspace slice and *propose* writes. Proposals never mutate the
 * store directly; they are lifted into mutation plans that flow through the
 * same plan/validate/apply pipeline as file edits and MCP tools.
 */

import type { AiMutationPlan } from '../ai-surface'
import { attachAiPlanValidation, createAiOperation } from '../ai-surface'
import { createScriptContext, type FlatNode, type ScriptContext } from './context'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentSearchResult = {
  id: string
  schemaIRI: string
  title: string
  snippet: string
}

export type AgentWriteProposal =
  | {
      kind: 'update'
      nodeId: string
      properties: Record<string, unknown>
      baseRevision: string
      rationale?: string
    }
  | {
      kind: 'create'
      schemaId: string
      properties: Record<string, unknown>
      rationale?: string
    }

/** One hit from `api.recall`, carrying the graph path it was reached by. */
export type AgentRecallHit = {
  id: string
  title: string
  /** Readable provenance, e.g. "Acme Corp →(contacts) Dana Reyes". */
  path: string
  /** 0 for a direct match, ≥1 for a graph-expanded one. */
  hops: number
  snippet: string
}

/** One typed edge from `api.graph`. */
export type AgentGraphEdge = {
  id: string
  relation: string
  direction: 'outbound' | 'inbound'
  hops: number
}

export interface AgentApi {
  /** Query the loaded workspace slice by schema IRI. */
  nodes(schemaIRI?: string): ReadonlyArray<Readonly<FlatNode>>
  /** Search titles and string properties of the loaded slice. */
  search(text: string): ReadonlyArray<Readonly<AgentSearchResult>>
  /**
   * Retrieve beyond the loaded slice: full-workspace entry search plus bounded
   * graph expansion, each hit carrying its provenance path (exploration 0415).
   *
   * Synchronous, because the sandbox bans `await` on purpose. The host runs the
   * script twice — a priming pass that records every query, then the real pass
   * with the answers in hand — so the queries must not depend on the script's
   * own writes. A query the priming pass never saw **throws**; it does not
   * return an empty array.
   */
  recall(query: string): ReadonlyArray<Readonly<AgentRecallHit>>
  /** Typed relation edges out of a node, up to `hops` away. Same two-pass rule. */
  graph(nodeId: string, hops?: number): ReadonlyArray<Readonly<AgentGraphEdge>>
  /** Propose a property update; becomes a mutation plan, never a direct write. */
  proposeUpdate(nodeId: string, properties: Record<string, unknown>, rationale?: string): void
  /** Propose a new node; becomes a mutation plan, never a direct write. */
  proposeCreate(schemaId: string, properties: Record<string, unknown>, rationale?: string): void
}

/** Answers the host resolved between the priming pass and the real one. */
export type AgentResolvedContext = {
  recall: ReadonlyMap<string, readonly AgentRecallHit[]>
  graph: ReadonlyMap<string, readonly AgentGraphEdge[]>
}

/** Queries a priming pass observed, for the host to resolve. */
export type AgentRequestedContext = {
  recall: string[]
  graph: Array<{ nodeId: string; hops: number }>
}

/** Cache key for a graph request; shared by the recorder and the resolver. */
export function graphRequestKey(nodeId: string, hops: number): string {
  return `${nodeId}@${hops}`
}

export type AgentScriptContext = ScriptContext & { api: Readonly<AgentApi> }

export type CreateAgentScriptContextInput = {
  /** Workspace slice available to the script (already bounded by the caller). */
  nodes: FlatNode[]
  /** Optional current node; defaults to a synthetic agent-script node. */
  node?: FlatNode
  /** Cap on proposals per run; guards against runaway scripts. */
  maxProposals?: number
  /**
   * Answers for `api.recall`/`api.graph`. Omit for the **priming pass**: the
   * calls then return empty and are recorded in {@link AgentScriptSession.getRequestedContext}
   * for the host to resolve. Supply it for the real pass.
   */
  resolved?: AgentResolvedContext
}

export type AgentScriptSession = {
  context: AgentScriptContext
  /** What the script asked for. Meaningful after a priming pass. */
  getRequestedContext(): AgentRequestedContext
  getProposals(): AgentWriteProposal[]
  /** Lift accumulated proposals into a validated mutation plan (or none). */
  toMutationPlan(input: {
    actor: string
    intent?: string
    clock?: () => Date
  }): AiMutationPlan | null
}

const DEFAULT_MAX_PROPOSALS = 100

// ─── Implementation ──────────────────────────────────────────────────────────

export function createAgentScriptContext(input: CreateAgentScriptContextInput): AgentScriptSession {
  const proposals: AgentWriteProposal[] = []
  const maxProposals = input.maxProposals ?? DEFAULT_MAX_PROPOSALS
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]))

  const queryFn = (schemaIRI?: string): FlatNode[] =>
    schemaIRI ? input.nodes.filter((node) => node.schemaIRI === schemaIRI) : [...input.nodes]

  const base = createScriptContext(
    input.node ?? { id: 'agent-script', schemaIRI: 'xnet://xnet.dev/AgentScript@1.0.0' },
    queryFn
  )

  const guardProposalCount = (): void => {
    if (proposals.length >= maxProposals) {
      throw new Error(`Agent script exceeded the proposal limit of ${maxProposals}`)
    }
  }

  const requestedRecall = new Set<string>()
  const requestedGraph = new Map<string, { nodeId: string; hops: number }>()
  const priming = input.resolved === undefined

  const apiImplementation: AgentApi = {
    nodes: base.nodes,

    search: (text: string) => Object.freeze(searchFlatNodes(input.nodes, text)),

    recall: (query: string) => {
      const key = String(query ?? '')
      if (priming) {
        requestedRecall.add(key)
        return Object.freeze([])
      }
      const hits = input.resolved?.recall.get(key)
      if (!hits) {
        // Loud, not empty: an unresolved query means the priming pass never saw
        // it, which means the script's queries are not deterministic. Returning
        // [] would read to the script — and to whoever reads its digest — as
        // "the workspace has nothing matching".
        throw new Error(
          `api.recall(${JSON.stringify(key)}) was not resolved: agent scripts run twice ` +
            `(a priming pass records the queries, then the real pass answers them), so every ` +
            `recall query must be the same on both passes.`
        )
      }
      return Object.freeze(hits.map((hit) => Object.freeze({ ...hit })))
    },

    graph: (nodeId: string, hops = 1) => {
      const key = graphRequestKey(String(nodeId ?? ''), hops)
      if (priming) {
        requestedGraph.set(key, { nodeId: String(nodeId ?? ''), hops })
        return Object.freeze([])
      }
      const edges = input.resolved?.graph.get(key)
      if (!edges) {
        throw new Error(
          `api.graph(${JSON.stringify(nodeId)}, ${hops}) was not resolved: see api.recall's ` +
            `note on the two-pass execution model.`
        )
      }
      return Object.freeze(edges.map((edge) => Object.freeze({ ...edge })))
    },

    proposeUpdate: (nodeId, properties, rationale) => {
      guardProposalCount()
      const target = nodesById.get(nodeId)
      if (!target) {
        throw new Error(`Cannot propose update for unknown node: ${nodeId}`)
      }
      proposals.push({
        kind: 'update',
        nodeId,
        properties: { ...properties },
        baseRevision: revisionForFlatNode(target),
        ...(rationale ? { rationale } : {})
      })
    },

    proposeCreate: (schemaId, properties, rationale) => {
      guardProposalCount()
      if (!schemaId || typeof schemaId !== 'string') {
        throw new Error('proposeCreate requires a schema IRI')
      }
      proposals.push({
        kind: 'create',
        schemaId,
        properties: { ...properties },
        ...(rationale ? { rationale } : {})
      })
    }
  }
  const api = Object.freeze(apiImplementation)

  const context: AgentScriptContext = Object.freeze({ ...base, api })

  return {
    context,
    getRequestedContext: () => ({
      recall: [...requestedRecall],
      graph: [...requestedGraph.values()]
    }),
    getProposals: () => [...proposals],
    toMutationPlan: ({ actor, intent, clock }) => {
      if (proposals.length === 0) return null
      const createdAt = (clock ?? (() => new Date()))().toISOString()
      return attachAiPlanValidation({
        id: `plan_agent_${hashText(`${actor}:${createdAt}:${proposals.length}`)}`,
        actor,
        intent: intent ?? `Agent script proposed ${proposals.length} change(s)`,
        risk: 'medium',
        requiredScopes: ['agent.workspace.import'],
        changes: proposals.map((proposal, index) =>
          proposal.kind === 'update'
            ? {
                targetKind: 'node' as const,
                targetId: proposal.nodeId,
                baseRevision: proposal.baseRevision,
                operations: [
                  createAiOperation(
                    'updateNodeProperties',
                    { properties: proposal.properties },
                    proposal.rationale
                  )
                ]
              }
            : {
                targetKind: 'node' as const,
                targetId: `new:${index}`,
                baseRevision: 'new',
                operations: [
                  createAiOperation(
                    'createNode',
                    { schemaId: proposal.schemaId, properties: proposal.properties },
                    proposal.rationale
                  )
                ]
              }
        ),
        validation: { valid: true, warnings: [], errors: [] },
        createdAt,
        status: 'proposed'
      })
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function searchFlatNodes(nodes: FlatNode[], text: string): AgentSearchResult[] {
  const query = text.trim().toLocaleLowerCase()
  if (!query) return []

  return nodes
    .map((node) => toSearchResult(node, query))
    .filter((result): result is AgentSearchResult => result !== null)
}

function toSearchResult(node: FlatNode, query: string): AgentSearchResult | null {
  const haystacks = Object.values(node).filter(
    (value): value is string => typeof value === 'string'
  )
  const match = haystacks.find((value) => value.toLocaleLowerCase().includes(query))
  if (!match) return null
  return {
    id: node.id,
    schemaIRI: node.schemaIRI,
    title: typeof node.title === 'string' ? node.title : node.id,
    snippet: match.slice(0, 160)
  }
}

function revisionForFlatNode(node: FlatNode): string {
  return `updatedAt:${typeof node.updatedAt === 'number' ? node.updatedAt : 0}`
}

function hashText(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}
