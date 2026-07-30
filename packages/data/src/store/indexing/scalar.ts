/**
 * Scalar index family (`node_property_scalars`) for the SQLite node storage
 * adapter (exploration 0276).
 *
 * The scalar sidecar denormalizes every indexable property value into typed
 * columns (`value_text`/`value_number`/`value_boolean` + hash) so the query
 * compiler can push predicates and sorts into SQL. Rows are replaced
 * wholesale per node (delete + insert), keeping the sidecar in lockstep with
 * the LWW-materialized `node_properties` state.
 */

import type { SchemaIRI } from '../../schema/node'
import type { NodeState } from '../types'
import type { IndexingContext, IndexingStrategy } from './index'
import type { SQLiteAdapter, SQLValue } from '@xnetjs/sqlite'
import { toScalarIndexValue } from '../query-compiler'

/**
 * Delete `node_properties` rows for keys no longer present on the node.
 * Not an index write — it maintains the canonical EAV table — but it fans
 * out from the same per-node write step as the scalar sidecar sync, so it
 * lives beside it.
 */
export async function deleteRemovedProperties(db: SQLiteAdapter, node: NodeState): Promise<void> {
  const keys = Object.keys(node.properties)

  if (keys.length === 0) {
    await db.run('DELETE FROM node_properties WHERE node_id = ?', [node.id])
    return
  }

  const placeholders = keys.map(() => '?').join(', ')
  await db.run(
    `DELETE FROM node_properties WHERE node_id = ? AND property_key NOT IN (${placeholders})`,
    [node.id, ...keys]
  )
}

/** Batch-operation form of {@link deleteRemovedProperties}. */
export function createDeleteRemovedPropertiesOperation(node: NodeState): {
  sql: string
  params?: SQLValue[]
} {
  const keys = Object.keys(node.properties)

  if (keys.length === 0) {
    return {
      sql: 'DELETE FROM node_properties WHERE node_id = ?',
      params: [node.id]
    }
  }

  return {
    // Indentation is part of the SQL string — kept byte-identical to the
    // pre-split adapter so batch statement-cache keys do not repartition.
    sql: `DELETE FROM node_properties
            WHERE node_id = ? AND property_key NOT IN (${keys.map(() => '?').join(', ')})`,
    params: [node.id, ...keys]
  }
}

export class ScalarIndexing implements IndexingStrategy {
  constructor(private readonly ctx: IndexingContext) {}

  async syncNode(node: NodeState, indexProperties: boolean): Promise<number> {
    await this.ctx.db.run('DELETE FROM node_property_scalars WHERE node_id = ?', [node.id])

    if (!indexProperties) {
      return 0
    }

    let rowsWritten = 0
    for (const [key, value] of Object.entries(node.properties)) {
      const timestamp = node.timestamps[key]
      const scalar = toScalarIndexValue(value)
      if (!timestamp || !scalar) continue

      await this.ctx.db.run(
        `INSERT INTO node_property_scalars
          (
            node_id,
            schema_id,
            property_key,
            value_type,
            value_text,
            value_number,
            value_boolean,
            value_hash,
            updated_at,
            lamport_time
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          node.id,
          node.schemaId,
          key,
          scalar.valueType,
          scalar.valueText,
          scalar.valueNumber,
          scalar.valueBoolean,
          scalar.valueHash,
          timestamp.wallTime,
          timestamp.lamport
        ]
      )
      rowsWritten += 1
    }

    return rowsWritten
  }

  async rebuildForSchemas(
    schemaIds: readonly SchemaIRI[],
    nodesBySchemaId: ReadonlyMap<SchemaIRI, readonly NodeState[]>,
    indexProperties: boolean
  ): Promise<void> {
    for (const schemaId of schemaIds) {
      await this.ctx.db.run('DELETE FROM node_property_scalars WHERE schema_id = ?', [schemaId])

      if (!indexProperties) {
        continue
      }

      const nodes = nodesBySchemaId.get(schemaId) ?? []
      for (const node of nodes) {
        await this.syncNode(node, true)
      }
    }
  }

  /**
   * Rebuild the whole scalar sidecar from materialized `node_properties`.
   * Scan/write loop only — the adapter wraps it in its write lane and a
   * transaction.
   */
  async rebuildAll(): Promise<{ nodesScanned: number; scalarRowsWritten: number }> {
    await this.ctx.db.run('DELETE FROM node_property_scalars')
    const rows = await this.ctx.db.query<{ id: string }>('SELECT id FROM nodes ORDER BY id ASC')
    let scalarRowsWritten = 0

    for (const row of rows) {
      const node = await this.ctx.getNode(row.id)
      if (!node) continue

      scalarRowsWritten += await this.syncNode(node, true)
    }

    return {
      nodesScanned: rows.length,
      scalarRowsWritten
    }
  }

  /** The scalar-row inserts for one node, as batch operations (exact SQL). */
  createNodeOperations(node: NodeState): Array<{ sql: string; params?: SQLValue[] }> {
    return Object.entries(node.properties).flatMap(([key, value]) => {
      const timestamp = node.timestamps[key]
      const scalar = toScalarIndexValue(value)
      if (!timestamp || !scalar) return []

      return [
        {
          sql: `INSERT INTO node_property_scalars
                  (
                    node_id,
                    schema_id,
                    property_key,
                    value_type,
                    value_text,
                    value_number,
                    value_boolean,
                    value_hash,
                    updated_at,
                    lamport_time
                  )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            node.id,
            node.schemaId,
            key,
            scalar.valueType,
            scalar.valueText,
            scalar.valueNumber,
            scalar.valueBoolean,
            scalar.valueHash,
            timestamp.wallTime,
            timestamp.lamport
          ]
        }
      ]
    })
  }

  /** How many scalar rows {@link syncNode}/{@link createNodeOperations} would write. */
  countIndexRowsForNode(node: NodeState): number {
    return Object.values(node.properties).filter((value) => toScalarIndexValue(value) !== null)
      .length
  }

  /** Drop every scalar index row (the adapter's `clear()`). */
  async clear(): Promise<void> {
    await this.ctx.db.run('DELETE FROM node_property_scalars')
  }
}
