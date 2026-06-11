/**
 * Shared query descriptor helpers for @xnetjs/data-bridge
 */

import type {
  QueryDescriptor,
  QueryExecutionMode,
  QueryOptions,
  QuerySourcePreference
} from './types'
import type {
  NodeQueryDescriptor,
  NodeQueryOptions,
  NodeState,
  PropertyBuilder,
  SchemaIRI,
  NodeQueryCursor
} from '@xnetjs/data'
import {
  applyNodeQueryDescriptor,
  createNodeQueryDescriptor,
  decodeNodeQueryCursor,
  encodeNodeQueryCursor,
  matchesNodeQueryDescriptor,
  nodeQueryDescriptorNeedsBoundedReload,
  nodeQueryDescriptorToOptions,
  serializeNodeQueryDescriptor,
  sortNodeQueryResults
} from '@xnetjs/data'

export type QueryResultDelta =
  | { kind: 'noop' }
  | { kind: 'reload' }
  | { kind: 'set'; data: NodeState[] }

/**
 * Extra rows fetched beyond a bounded query's visible window. The buffer
 * lets node changes be applied in memory: removals are absorbed by spare
 * rows instead of forcing a storage re-query, and inserts can be ranked
 * against known rows.
 */
export const BOUNDED_QUERY_OVERFETCH = 25

export interface BoundedQueryWorkingSet {
  /** Descriptor-ordered rows, at least covering the visible window. */
  nodes: NodeState[]
  /**
   * True when the working-set fetch returned fewer rows than requested,
   * meaning the buffer holds every matching node: deltas can never
   * underflow into unknown rows and reloads are never required.
   */
  complete: boolean
}

export type BoundedQueryResultDelta =
  | { kind: 'noop' }
  | { kind: 'reload' }
  | { kind: 'set'; data: NodeState[]; workingSet: BoundedQueryWorkingSet }

const QUERY_EXECUTION_MODES = new Set<QueryExecutionMode>([
  'local',
  'local-then-remote',
  'remote',
  'live',
  'stream'
])

const QUERY_SOURCE_PREFERENCES = new Set<QuerySourcePreference>([
  'auto',
  'local',
  'hub',
  'federated'
])

function toNodeDescriptor(descriptor: QueryDescriptor): NodeQueryDescriptor {
  return descriptor as NodeQueryDescriptor
}

function normalizeQueryExecutionMode(mode: QueryOptions['mode']): QueryExecutionMode | undefined {
  return mode && QUERY_EXECUTION_MODES.has(mode) ? mode : undefined
}

function normalizeQuerySourcePreference(
  source: QueryOptions['source']
): QuerySourcePreference | undefined {
  return source && QUERY_SOURCE_PREFERENCES.has(source) ? source : undefined
}

export function createQueryDescriptor<P extends Record<string, PropertyBuilder>>(
  schemaId: SchemaIRI,
  options?: QueryOptions<P>
): QueryDescriptor {
  const descriptor = createNodeQueryDescriptor(
    schemaId,
    options as NodeQueryOptions<P> | undefined
  ) as QueryDescriptor
  const mode = normalizeQueryExecutionMode(options?.mode)
  const source = normalizeQuerySourcePreference(options?.source)

  return {
    ...descriptor,
    ...(mode ? { mode } : {}),
    ...(source ? { source } : {})
  }
}

export function queryDescriptorToOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
>(descriptor: QueryDescriptor): QueryOptions<P> {
  return {
    ...(nodeQueryDescriptorToOptions<P>(toNodeDescriptor(descriptor)) as QueryOptions<P>),
    ...(descriptor.mode ? { mode: descriptor.mode } : {}),
    ...(descriptor.source ? { source: descriptor.source } : {})
  }
}

export function serializeQueryDescriptor(descriptor: QueryDescriptor): string {
  return serializeNodeQueryDescriptor(toNodeDescriptor(descriptor))
}

export function encodeQueryCursor(descriptor: QueryDescriptor, node: NodeState): string {
  return encodeNodeQueryCursor(toNodeDescriptor(descriptor), node)
}

export function decodeQueryCursor(cursor: string): NodeQueryCursor | null {
  return decodeNodeQueryCursor(cursor)
}

export function matchesQueryDescriptor(
  descriptor: QueryDescriptor,
  node: NodeState | null | undefined
): boolean {
  return matchesNodeQueryDescriptor(toNodeDescriptor(descriptor), node)
}

export function filterQueryNodes(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
  return nodes.filter((node) => matchesQueryDescriptor(descriptor, node))
}

export function sortQueryNodes(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
  return sortNodeQueryResults(nodes, toNodeDescriptor(descriptor))
}

export function applyQueryDescriptor(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
  return applyNodeQueryDescriptor(nodes, toNodeDescriptor(descriptor))
}

export function queryDescriptorNeedsBoundedReload(descriptor: QueryDescriptor): boolean {
  return nodeQueryDescriptorNeedsBoundedReload(toNodeDescriptor(descriptor))
}

/**
 * Whether a bounded (limited) descriptor can be maintained incrementally
 * with an overfetch working set instead of re-executing on every change.
 *
 * Requirements:
 * - `limit` without `offset`/`after`: window shifts under offset/cursor
 *   pages can't be resolved from a prefix buffer, so they keep reload
 *   semantics.
 * - An explicit `orderBy`: the working set is a prefix of the descriptor
 *   order, and rows beyond the buffer are known to sort after it. Without
 *   `orderBy` the storage row order is not derivable in JS.
 * - No materialized view: those windows are refreshed in storage.
 */
export function queryDescriptorSupportsBoundedDelta(descriptor: QueryDescriptor): boolean {
  return (
    descriptor.limit !== undefined &&
    descriptor.limit > 0 &&
    (descriptor.offset ?? 0) === 0 &&
    descriptor.after === undefined &&
    descriptor.materializedView === undefined &&
    descriptor.orderBy !== undefined &&
    Object.keys(descriptor.orderBy).length > 0
  )
}

/**
 * Descriptor used to fetch a bounded query's working set: the visible
 * window plus {@link BOUNDED_QUERY_OVERFETCH} spare rows.
 */
export function createBoundedWorkingSetDescriptor(descriptor: QueryDescriptor): QueryDescriptor {
  return { ...descriptor, limit: descriptor.limit! + BOUNDED_QUERY_OVERFETCH }
}

export function createBoundedWorkingSet(
  descriptor: QueryDescriptor,
  nodes: NodeState[]
): BoundedQueryWorkingSet {
  const capacity = descriptor.limit! + BOUNDED_QUERY_OVERFETCH
  return { nodes, complete: nodes.length < capacity }
}

/**
 * Apply a single node change to a bounded query's working set without
 * re-executing the query.
 *
 * Correctness rests on one invariant: the working set was fetched as a
 * prefix of the descriptor order, so every row NOT in the buffer sorts
 * after the row that was last in the buffer at fetch time. Changes that
 * would force a decision about those unknown rows (buffer underflow below
 * `limit`, or ranking a row that sorts past every known row while the
 * window is short) return `reload`.
 */
export function applyNodeChangeToBoundedQueryResult(input: {
  descriptor: QueryDescriptor
  workingSet: BoundedQueryWorkingSet
  nodeId: string
  nextNode: NodeState | null
}): BoundedQueryResultDelta {
  const { descriptor, workingSet, nodeId, nextNode } = input
  const limit = descriptor.limit!
  const currentNodes = workingSet.nodes
  const currentContains = currentNodes.some((node) => node.id === nodeId)
  const nextMatches = matchesQueryDescriptor(descriptor, nextNode)

  if (!currentContains && !nextMatches) {
    return { kind: 'noop' }
  }

  const base = currentContains ? currentNodes.filter((node) => node.id !== nodeId) : currentNodes

  if (!nextMatches || !nextNode) {
    // Removal/unmatch: spare buffer rows absorb the loss. An incomplete
    // buffer that drains below the visible window is hiding rows we never
    // fetched, so only that case re-queries.
    if (!workingSet.complete && base.length < limit) {
      return { kind: 'reload' }
    }
    return boundedSet(base, workingSet.complete, limit)
  }

  // Insert or in-place update: rank the node against the known rows. The
  // merged set stays small (≤ limit + overfetch + 1), so a full re-sort is
  // cheaper than maintaining comparator plumbing.
  const merged = sortQueryNodes([...base, nextNode], descriptor)

  if (!workingSet.complete) {
    if (base.length < limit) {
      // Underflowed incomplete buffer: ranks against unknown rows are
      // ambiguous no matter where the node lands.
      return { kind: 'reload' }
    }

    if (merged[merged.length - 1]?.id === nodeId) {
      // The node sorts after every known row. Unknown rows may sort before
      // it, so its true rank is unknowable — but it cannot enter the
      // visible window because ≥ limit known rows precede it. Keep it out
      // of the buffer to preserve the prefix invariant.
      return currentContains
        ? boundedSet(base, false, limit) // moved out of the known prefix
        : { kind: 'noop' }
    }
  }

  return boundedSet(merged, workingSet.complete, limit)
}

function boundedSet(nodes: NodeState[], complete: boolean, limit: number): BoundedQueryResultDelta {
  return {
    kind: 'set',
    data: nodes.slice(0, limit),
    workingSet: { nodes, complete }
  }
}

export function applyNodeChangeToQueryResult(input: {
  descriptor: QueryDescriptor
  currentData: NodeState[]
  nodeId: string
  nextNode: NodeState | null
}): QueryResultDelta {
  const { descriptor, currentData, nodeId, nextNode } = input
  const currentIndex = currentData.findIndex((node) => node.id === nodeId)
  const currentContains = currentIndex >= 0
  const nextMatches = matchesQueryDescriptor(descriptor, nextNode)

  if (queryDescriptorNeedsBoundedReload(descriptor)) {
    return currentContains || nextMatches ? { kind: 'reload' } : { kind: 'noop' }
  }

  if (!currentContains && !nextMatches) {
    return { kind: 'noop' }
  }

  if (currentContains && !nextMatches) {
    return {
      kind: 'set',
      data: currentData.filter((node) => node.id !== nodeId)
    }
  }

  if (!nextNode) {
    return { kind: 'noop' }
  }

  const nextData = currentContains
    ? currentData.map((node) => (node.id === nodeId ? nextNode : node))
    : [...currentData, nextNode]

  return {
    kind: 'set',
    data: applyQueryDescriptor(nextData, descriptor)
  }
}
