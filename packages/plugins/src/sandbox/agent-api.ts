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

export interface AgentApi {
  /** Query the loaded workspace slice by schema IRI. */
  nodes(schemaIRI?: string): ReadonlyArray<Readonly<FlatNode>>
  /** Search titles and string properties of the loaded slice. */
  search(text: string): ReadonlyArray<Readonly<AgentSearchResult>>
  /** Propose a property update; becomes a mutation plan, never a direct write. */
  proposeUpdate(nodeId: string, properties: Record<string, unknown>, rationale?: string): void
  /** Propose a new node; becomes a mutation plan, never a direct write. */
  proposeCreate(schemaId: string, properties: Record<string, unknown>, rationale?: string): void
}

export type AgentScriptContext = ScriptContext & { api: Readonly<AgentApi> }

export type CreateAgentScriptContextInput = {
  /** Workspace slice available to the script (already bounded by the caller). */
  nodes: FlatNode[]
  /** Optional current node; defaults to a synthetic agent-script node. */
  node?: FlatNode
  /** Cap on proposals per run; guards against runaway scripts. */
  maxProposals?: number
}

export type AgentScriptSession = {
  context: AgentScriptContext
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

  const apiImplementation: AgentApi = {
    nodes: base.nodes,

    search: (text: string) => Object.freeze(searchFlatNodes(input.nodes, text)),

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

  const results: AgentSearchResult[] = []
  for (const node of nodes) {
    const title = typeof node.title === 'string' ? node.title : node.id
    const haystacks = Object.values(node).filter(
      (value): value is string => typeof value === 'string'
    )
    const match = haystacks.find((value) => value.toLocaleLowerCase().includes(query))
    if (!match) continue
    results.push({
      id: node.id,
      schemaIRI: node.schemaIRI,
      title,
      snippet: match.slice(0, 160)
    })
  }
  return results
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
