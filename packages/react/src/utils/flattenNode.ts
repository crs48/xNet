/**
 * FlatNode utilities - Flatten NodeState properties to top level
 *
 * This module provides type-safe flattening of Node properties so developers
 * can access `node.title` instead of `node.properties.title`.
 */

import type { DID } from '@xnet/core'
import type { SchemaIRI, PropertyBuilder, InferCreateProps, NodeState } from '@xnet/data'

// =============================================================================
// Types
// =============================================================================

/**
 * Base node fields (always present on any node)
 */
export interface NodeBase {
  /** Unique node identifier */
  id: string
  /** Schema IRI this node conforms to */
  schemaId: SchemaIRI
  /** Creation timestamp */
  createdAt: number
  /** Creator's DID */
  createdBy: DID
  /** Last update timestamp */
  updatedAt: number
  /** Last updater's DID */
  updatedBy: DID
  /** Whether node is soft-deleted */
  deleted: boolean
}

/**
 * A flattened node with properties at the top level.
 *
 * Instead of `node.properties.title`, access `node.title` directly.
 * All property types are correctly inferred from the schema.
 *
 * @example
 * ```tsx
 * const { data } = useQuery(TaskSchema, id)
 * // data is FlatNode<typeof TaskSchema._properties>
 *
 * console.log(data.title)   // string - correctly typed!
 * console.log(data.status)  // 'todo' | 'done' - union type!
 * ```
 */
export type FlatNode<P extends Record<string, PropertyBuilder>> = NodeBase & InferCreateProps<P>

// =============================================================================
// Runtime Functions
// =============================================================================

/**
 * Flatten a NodeState by spreading properties to top level.
 *
 * @param node - The NodeState with nested properties
 * @returns A new object with properties flattened to top level
 *
 * @example
 * ```ts
 * const nodeState = {
 *   id: '123',
 *   schemaId: 'xnet://xnet.fyi/Task',
 *   properties: { title: 'My Task', status: 'todo' },
 *   // ...
 * }
 *
 * const flat = flattenNode(nodeState)
 * // { id: '123', schemaId: '...', title: 'My Task', status: 'todo', ... }
 * ```
 */
export function flattenNode<P extends Record<string, PropertyBuilder>>(
  node: NodeState
): FlatNode<P> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { properties, timestamps, deletedAt, documentContent, ...base } = node
  return {
    ...base,
    ...properties
  } as FlatNode<P>
}

/**
 * Flatten an array of NodeState objects.
 */
export function flattenNodes<P extends Record<string, PropertyBuilder>>(
  nodes: NodeState[]
): FlatNode<P>[] {
  return nodes.map((node) => flattenNode<P>(node))
}
