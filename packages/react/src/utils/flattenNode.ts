/**
 * FlatNode utilities - Flatten NodeState properties to top level
 *
 * This module provides type-safe flattening of Node properties so developers
 * can access `node.title` instead of `node.properties.title`.
 */

import type { DID } from '@xnet/core'
import type {
  SchemaIRI,
  PropertyBuilder,
  InferCreateProps,
  NodeState,
  MigratedNodeState,
  MigrationInfo
} from '@xnet/data'

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

  // ─── Version Compatibility Fields ─────────────────────────────────────────

  /**
   * True if this node's schema is not registered/known to the current app version.
   * The node data is still accessible but may not have proper type information.
   * UI should render a generic "Unknown data type" component for these nodes.
   */
  _unknownSchema?: boolean

  /**
   * Properties from future schema versions that aren't known to the current schema.
   * Preserved for forward compatibility - can be displayed in a "raw data" view.
   */
  _unknown?: Record<string, unknown>

  /**
   * The schema version that last wrote to this node.
   * Useful for detecting when migrations might be needed.
   */
  _schemaVersion?: string

  // ─── Migration Fields ──────────────────────────────────────────────────────

  /**
   * The original schema IRI this node was migrated from.
   * Only present if the node was automatically migrated on read.
   */
  _migratedFrom?: SchemaIRI

  /**
   * Full migration info if the node was migrated.
   * Includes lossless flag and any warnings about data loss.
   */
  _migrationInfo?: MigrationInfo
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
 * Options for flattenNode function
 */
export interface FlattenNodeOptions {
  /**
   * Mark this node as having an unknown schema.
   * This happens when the node's schemaId is not registered in the current app version.
   */
  unknownSchema?: boolean
  /**
   * Migration info if the node was migrated from a different schema version.
   */
  migrationInfo?: MigrationInfo
}

/**
 * Flatten a NodeState by spreading properties to top level.
 *
 * @param node - The NodeState with nested properties
 * @param options - Optional settings for handling unknown schemas
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
  node: NodeState | MigratedNodeState,
  options?: FlattenNodeOptions
): FlatNode<P> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { properties, timestamps, deletedAt, documentContent, _unknown, _schemaVersion, ...base } =
    node

  // Get migration info from options or from MigratedNodeState
  const migrationInfo = options?.migrationInfo ?? (node as MigratedNodeState)._migrationInfo

  return {
    ...base,
    ...properties,
    // Include version compatibility fields if present
    ...(options?.unknownSchema && { _unknownSchema: true }),
    ...(_unknown && Object.keys(_unknown).length > 0 && { _unknown }),
    ...(_schemaVersion && { _schemaVersion }),
    // Include migration fields if present
    ...(migrationInfo && {
      _migratedFrom: migrationInfo.from,
      _migrationInfo: migrationInfo
    })
  } as FlatNode<P>
}

/**
 * Flatten an array of NodeState objects.
 */
export function flattenNodes<P extends Record<string, PropertyBuilder>>(
  nodes: (NodeState | MigratedNodeState)[],
  options?: FlattenNodeOptions
): FlatNode<P>[] {
  return nodes.map((node) => flattenNode<P>(node, options))
}

/**
 * Create a FlatNode with unknown schema flag.
 * Use this when displaying nodes whose schema is not registered.
 */
export function flattenUnknownSchemaNode(
  node: NodeState
): FlatNode<Record<string, PropertyBuilder>> {
  return flattenNode<Record<string, PropertyBuilder>>(node, { unknownSchema: true })
}

/**
 * Create FlatNodes from an array, marking those with unknown schemas.
 *
 * @param nodes - Array of NodeState objects
 * @param isSchemaKnown - Function to check if a schema is registered
 * @returns Array of FlatNodes with _unknownSchema set appropriately
 */
export function flattenNodesWithSchemaCheck<P extends Record<string, PropertyBuilder>>(
  nodes: NodeState[],
  isSchemaKnown: (schemaId: string) => boolean
): FlatNode<P>[] {
  return nodes.map((node) => flattenNode<P>(node, { unknownSchema: !isSchemaKnown(node.schemaId) }))
}
