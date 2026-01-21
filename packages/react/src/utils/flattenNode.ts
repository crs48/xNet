/**
 * FlatNode utilities - Flatten NodeState properties to top level
 *
 * This module provides type-safe flattening of Node properties so developers
 * can access `node.title` instead of `node.properties.title`.
 */

import type { DID } from '@xnet/core'
import type { SchemaIRI } from '@xnet/data'
import type { PropertyBuilder, InferCreateProps } from '@xnet/data'
import type { NodeState } from '@xnet/data'

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
 *   schemaId: 'xnet://xnet.dev/Task',
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

/**
 * Extract only the property values from a flattened node.
 * Useful when you need to pass just the properties (e.g., for updates).
 *
 * @param flat - A flattened node
 * @returns Just the property values (without base fields)
 */
export function extractProperties<P extends Record<string, PropertyBuilder>>(
  flat: FlatNode<P>
): InferCreateProps<P> {
  const { id, schemaId, createdAt, createdBy, updatedAt, updatedBy, deleted, ...properties } = flat
  return properties as InferCreateProps<P>
}

/**
 * Type guard to check if a value is a valid FlatNode.
 */
export function isFlatNode(value: unknown): value is FlatNode<Record<string, PropertyBuilder>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'schemaId' in value &&
    'createdAt' in value &&
    'createdBy' in value
  )
}
