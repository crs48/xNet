/**
 * Temp ID resolution for transactional node creation.
 *
 * Temp IDs are `~`-prefixed strings (e.g., `~parent`, `~comment`) that act as
 * placeholders for node IDs in a transaction. The same temp ID used in multiple
 * places within a transaction resolves to the same real nanoid.
 *
 * Resolution happens in two places:
 * 1. **Operation IDs** — `create.options.id` and `update/delete/restore.nodeId`
 * 2. **Relation properties** — any property with `definition.type === 'relation'`
 *    in the schema (requires SchemaRegistry access)
 *
 * @example
 * ```typescript
 * await store.transaction([
 *   { type: 'create', options: { id: '~parent', schemaId: 'Task', properties: { title: 'P' } } },
 *   { type: 'create', options: { id: '~child', schemaId: 'Task', properties: { title: 'C', parent: '~parent' } } },
 * ])
 * // Returns: { tempIds: { '~parent': 'xK9mQ2...', '~child': 'pL3nR7...' }, ... }
 * ```
 */

import type { TransactionOperation, NodeId } from './types'
import type { DefinedSchema, PropertyBuilder } from '../schema/types'
import { createNodeId, type SchemaIRI } from '../schema/node'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Prefix that identifies a temp ID. nanoid never produces `~`. */
export const TEMP_ID_PREFIX = '~'

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check whether a string is a temp ID (starts with `~`).
 */
export function isTempId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(TEMP_ID_PREFIX)
}

/**
 * Callback to look up a schema's relation property names by schema IRI.
 * Returns the set of property keys that have `type === 'relation'`,
 * or undefined if the schema is not available.
 */
export type SchemaLookup = (schemaId: SchemaIRI) => Set<string> | undefined

/**
 * Build a SchemaLookup from a map of DefinedSchema objects.
 * Caches the relation property sets for each schema IRI.
 */
export function createSchemaLookup(
  getSchema: (iri: SchemaIRI) => DefinedSchema<Record<string, PropertyBuilder>> | undefined
): SchemaLookup {
  const cache = new Map<SchemaIRI, Set<string>>()

  return (schemaId: SchemaIRI): Set<string> | undefined => {
    const cached = cache.get(schemaId)
    if (cached) return cached

    const schema = getSchema(schemaId)
    if (!schema) return undefined

    const relationKeys = new Set<string>()
    for (const prop of schema.schema.properties) {
      if (prop.type === 'relation') {
        relationKeys.add(prop.name)
      }
    }

    cache.set(schemaId, relationKeys)
    return relationKeys
  }
}

/**
 * Result of resolving temp IDs in a list of transaction operations.
 */
export interface TempIdResolution {
  /** The operations with all temp IDs replaced by real IDs */
  operations: TransactionOperation[]
  /** Map from temp ID → generated real ID (empty if no temp IDs were found) */
  tempIds: Record<string, NodeId>
}

/**
 * Resolve all `~`-prefixed temp IDs in a list of transaction operations.
 *
 * Resolution order:
 * 1. Scan all operations to collect temp IDs and generate real IDs
 * 2. Replace temp IDs in operation `id` fields (create) and `nodeId` fields (update/delete/restore)
 * 3. If a SchemaLookup is provided, replace temp IDs in `relation`-typed property values
 *
 * @param operations - The original transaction operations (not mutated)
 * @param schemaLookup - Optional callback to get relation property names for a schema
 * @returns Resolved operations and the temp ID → real ID mapping
 */
export function resolveTempIds(
  operations: TransactionOperation[],
  schemaLookup?: SchemaLookup
): TempIdResolution {
  // ─── Pass 1: Collect all temp IDs and assign real IDs ──────────────────
  const tempIds: Record<string, NodeId> = {}

  for (const op of operations) {
    switch (op.type) {
      case 'create':
        if (op.options.id && isTempId(op.options.id)) {
          assignTempId(tempIds, op.options.id)
        }
        // Also scan property values for temp IDs (they reference other temp IDs)
        scanPropertiesForTempIds(tempIds, op.options.properties, op.options.schemaId, schemaLookup)
        break

      case 'update':
        if (isTempId(op.nodeId)) {
          assignTempId(tempIds, op.nodeId)
        }
        // For updates we need the schemaId of the target node, which we don't have
        // at this point. We can still scan for temp IDs if we have the nodeId resolved
        // to a create in the same batch. For now, scan all string properties.
        scanPropertiesForTempIds(tempIds, op.options.properties, undefined, schemaLookup)
        break

      case 'delete':
      case 'restore':
        if (isTempId(op.nodeId)) {
          assignTempId(tempIds, op.nodeId)
        }
        break
    }
  }

  // If no temp IDs found, return operations unchanged
  if (Object.keys(tempIds).length === 0) {
    return { operations, tempIds }
  }

  // ─── Pass 2: Replace temp IDs with real IDs ────────────────────────────
  const resolved: TransactionOperation[] = operations.map((op) => {
    switch (op.type) {
      case 'create': {
        const resolvedId =
          op.options.id && isTempId(op.options.id) ? tempIds[op.options.id] : op.options.id

        const resolvedProps = resolvePropertiesValues(
          op.options.properties,
          tempIds,
          op.options.schemaId,
          schemaLookup
        )

        return {
          type: 'create' as const,
          options: {
            ...op.options,
            ...(resolvedId !== undefined && { id: resolvedId }),
            properties: resolvedProps
          }
        }
      }

      case 'update': {
        const resolvedNodeId = isTempId(op.nodeId) ? tempIds[op.nodeId] : op.nodeId

        // For updates, we don't have the schemaId easily available.
        // Look it up from the create operations in the same batch.
        const schemaId = findSchemaIdForNode(operations, op.nodeId, tempIds)
        const resolvedProps = resolvePropertiesValues(
          op.options.properties,
          tempIds,
          schemaId,
          schemaLookup
        )

        return {
          type: 'update' as const,
          nodeId: resolvedNodeId,
          options: {
            properties: resolvedProps
          }
        }
      }

      case 'delete':
        return {
          type: 'delete' as const,
          nodeId: isTempId(op.nodeId) ? tempIds[op.nodeId] : op.nodeId
        }

      case 'restore':
        return {
          type: 'restore' as const,
          nodeId: isTempId(op.nodeId) ? tempIds[op.nodeId] : op.nodeId
        }
    }
  })

  return { operations: resolved, tempIds }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Assign a real ID for a temp ID if not already assigned.
 */
function assignTempId(tempIds: Record<string, NodeId>, tempId: string): void {
  if (!(tempId in tempIds)) {
    tempIds[tempId] = createNodeId()
  }
}

/**
 * Scan property values for temp IDs and register them.
 * With a schema lookup, only scans relation-typed properties.
 * Without a schema lookup, scans all string properties that start with `~`.
 */
function scanPropertiesForTempIds(
  tempIds: Record<string, NodeId>,
  properties: Record<string, unknown>,
  schemaId: SchemaIRI | undefined,
  schemaLookup?: SchemaLookup
): void {
  const relationKeys = schemaId && schemaLookup ? schemaLookup(schemaId) : undefined

  for (const [key, value] of Object.entries(properties)) {
    // If we have schema info, only scan relation properties
    if (relationKeys && !relationKeys.has(key)) continue

    // If we don't have schema info, still scan all values for temp IDs
    // (this is the fallback for update operations where schemaId is unknown)
    if (typeof value === 'string' && isTempId(value)) {
      assignTempId(tempIds, value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && isTempId(item)) {
          assignTempId(tempIds, item)
        }
      }
    }
  }
}

/**
 * Replace temp IDs in property values with real IDs.
 * With a schema lookup, only resolves relation-typed properties.
 * Without one, resolves any string/string[] value that matches a known temp ID.
 */
function resolvePropertiesValues(
  properties: Record<string, unknown>,
  tempIds: Record<string, NodeId>,
  schemaId: SchemaIRI | undefined,
  schemaLookup?: SchemaLookup
): Record<string, unknown> {
  const relationKeys = schemaId && schemaLookup ? schemaLookup(schemaId) : undefined
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(properties)) {
    // If we have schema info, only resolve relation properties
    if (relationKeys && !relationKeys.has(key)) {
      result[key] = value
      continue
    }

    // Resolve single string temp IDs
    if (typeof value === 'string' && isTempId(value) && value in tempIds) {
      result[key] = tempIds[value]
    } else if (Array.isArray(value)) {
      // Resolve temp IDs in arrays (for multiple relations)
      result[key] = value.map((item) =>
        typeof item === 'string' && isTempId(item) && item in tempIds ? tempIds[item] : item
      )
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Find the schemaId for a node referenced in the same transaction batch.
 * Looks through create operations to find the matching node.
 */
function findSchemaIdForNode(
  operations: TransactionOperation[],
  nodeId: string,
  tempIds: Record<string, NodeId>
): SchemaIRI | undefined {
  // The nodeId might be a temp ID, resolve it for comparison
  const realId = isTempId(nodeId) ? tempIds[nodeId] : nodeId

  for (const op of operations) {
    if (op.type === 'create') {
      const opId = op.options.id && isTempId(op.options.id) ? tempIds[op.options.id] : op.options.id

      if (opId === realId || op.options.id === nodeId) {
        return op.options.schemaId
      }
    }
  }

  return undefined
}
