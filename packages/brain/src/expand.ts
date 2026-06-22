/**
 * Bounded graph expansion — the GraphRAG half of the retriever. Starting from the
 * entry nodes the hybrid search found, walk typed `relation()` edges outward up to
 * a hop budget, recording the path taken so every expanded node carries "a
 * sentence a human can read" back to its entry point.
 */
import type { GraphAccess, GraphEdge, PathStep } from './types'

export interface ExpandedNode {
  nodeId: string
  /** Distance from the nearest seed (1 = direct neighbor of an entry node). */
  hops: number
  /** Path from the seed to this node, inclusive of both endpoints. */
  path: PathStep[]
  /** The seed (entry node) this path started from. */
  seed: string
}

export interface ExpandOptions {
  maxHops: number
  /** Stop once this many distinct expanded nodes have been discovered. */
  maxNodes: number
}

/**
 * Breadth-first expansion from `seeds`. Visits each node once (shortest path
 * wins), never revisits a seed, and stops at `maxHops` or once `maxNodes`
 * expanded nodes are found. Pure aside from the injected async `graph`.
 */
export async function bfsExpand(
  seeds: readonly string[],
  graph: GraphAccess,
  options: ExpandOptions
): Promise<ExpandedNode[]> {
  const { maxHops, maxNodes } = options
  if (maxHops <= 0 || maxNodes <= 0) return []

  const seedSet = new Set(seeds)
  const visited = new Set<string>(seeds)
  const out: ExpandedNode[] = []

  // Queue holds the frontier; each entry remembers how it was reached.
  let frontier: ExpandedNode[] = seeds.map((nodeId) => ({
    nodeId,
    hops: 0,
    path: [{ nodeId }],
    seed: nodeId
  }))

  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
    const next: ExpandedNode[] = []
    for (const current of frontier) {
      let edges: GraphEdge[]
      try {
        edges = await graph.neighbors(current.nodeId)
      } catch {
        // A flaky/denied neighbor lookup must not abort the whole expansion.
        continue
      }
      for (const edge of edges) {
        if (visited.has(edge.nodeId)) continue
        visited.add(edge.nodeId)
        const node: ExpandedNode = {
          nodeId: edge.nodeId,
          hops: hop,
          path: [
            ...current.path,
            { nodeId: edge.nodeId, relation: edge.relation, direction: edge.direction }
          ],
          seed: current.seed
        }
        // A node that is itself a seed was already an entry — don't re-emit it.
        if (!seedSet.has(edge.nodeId)) {
          out.push(node)
          if (out.length >= maxNodes) return out
        }
        next.push(node)
      }
    }
    frontier = next
  }

  return out
}

/** Resolves the relation-valued property keys for a schema. */
export type RelationFieldsResolver = (schemaId: string) => readonly string[]

/** Resolves inbound references to a node (e.g. via a reverse index). Optional. */
export type InboundResolver = (nodeId: string) => Promise<GraphEdge[]>

/** The minimal `NodeStore` surface the adapter reads from. */
export interface NodeReader {
  get(
    nodeId: string
  ): Promise<{ schemaId: string; properties: Record<string, unknown>; deleted?: boolean } | null>
}

export interface NodeStoreGraphAccessOptions {
  /**
   * Which properties of a given schema are relations. Derive this from the
   * schema registry; relation values are node-id strings (or arrays of them).
   */
  relationFieldsOf: RelationFieldsResolver
  /** Optional inbound-edge resolver. Without it, expansion is outbound-only. */
  inbound?: InboundResolver
}

/** True when a string looks like it could be a node id (cheap guard). */
function isNodeIdLike(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Adapt a real `NodeStore` (anything with `get`) into a `GraphAccess` by reading
 * the relation-valued properties named by `relationFieldsOf`. Outbound edges come
 * from the node's own relation props; inbound edges come from the optional
 * reverse-index resolver.
 */
export function nodeStoreGraphAccess(
  store: NodeReader,
  options: NodeStoreGraphAccessOptions
): GraphAccess {
  const { relationFieldsOf, inbound } = options
  return {
    async neighbors(nodeId: string): Promise<GraphEdge[]> {
      const edges: GraphEdge[] = []
      const node = await store.get(nodeId)
      if (node && !node.deleted) {
        for (const field of relationFieldsOf(node.schemaId)) {
          const value = node.properties[field]
          if (Array.isArray(value)) {
            for (const v of value) {
              if (isNodeIdLike(v)) {
                edges.push({ nodeId: v, relation: field, direction: 'outbound' })
              }
            }
          } else if (isNodeIdLike(value)) {
            edges.push({ nodeId: value, relation: field, direction: 'outbound' })
          }
        }
      }
      if (inbound) {
        const incoming = await inbound(nodeId)
        for (const edge of incoming) edges.push(edge)
      }
      return edges
    }
  }
}
