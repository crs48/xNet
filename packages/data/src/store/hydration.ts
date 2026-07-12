/**
 * Node hydration for the SQLite storage adapter (exploration 0276).
 *
 * Two modes reconstruct `NodeState`s from SQL rows:
 *
 * - **Joined** — one row per (node × property), the classic EAV join shape.
 * - **Aggregated** — ONE row per node via `json_group_object` (exploration
 *   0264, Wave 2), collapsing the boundary payload before it leaves SQLite.
 *
 * Both modes share the node-shell construction and the "latest property
 * write wins `updatedBy`" rule, previously duplicated inside
 * `sqlite-adapter.ts`. Correctness is pinned equal across modes by the
 * hydration test suite.
 */

import type { DID } from '@xnetjs/core'
import type { SQLiteAdapter, SQLValue } from '@xnetjs/sqlite'
import type { SchemaIRI } from '../schema/node'
import type { NodeState, PropertyTimestamp } from './types'
import {
  SQL_HYDRATE_ARITY_BUCKETS,
  SQLITE_HYDRATE_NODE_BATCH_SIZE,
  chunkItems,
  padToArityBucket
} from './sql-batching'

// ─── Row shapes ──────────────────────────────────────────────────────────────

export interface JoinedNodePropertyRow {
  id: string
  schema_id: string
  created_at: number
  updated_at: number
  created_by: string
  deleted_at: number | null
  property_key: string | null
  value: Uint8Array | null
  lamport_time: number | null
  updated_by: string | null
  prop_updated_at: number | null
  /** Grinding-resistant LWW tiebreak key (0300); NULL for legacy rows. */
  tiebreak_key: string | null
  ordinal: number | null
  [key: string]: SQLValue
}

/** One-row-per-node aggregated hydrate result (exploration 0264, Wave 2). */
export interface AggregatedNodeRow {
  id: string
  schema_id: string
  created_at: number
  updated_at: number
  created_by: string
  deleted_at: number | null
  ordinal: number | null
  props_json: string | null
  meta_json: string | null
  [key: string]: SQLValue
}

interface NodeRowShell {
  id: string
  schema_id: string
  created_at: number
  updated_at: number
  created_by: string
  deleted_at: number | null
}

// ─── Row parsing ─────────────────────────────────────────────────────────────

/** The node scaffold both hydrate modes build before merging properties in. */
function baseNodeState(row: NodeRowShell): NodeState {
  return {
    id: row.id,
    schemaId: row.schema_id as SchemaIRI,
    properties: {},
    timestamps: {},
    deleted: row.deleted_at !== null,
    deletedAt: row.deleted_at
      ? { lamport: 0, author: '' as DID, wallTime: row.deleted_at }
      : undefined,
    createdAt: row.created_at,
    createdBy: row.created_by as DID,
    updatedAt: row.updated_at,
    updatedBy: row.created_by as DID
  }
}

function deserializeValue(data: Uint8Array | null): unknown {
  if (!data) return null
  return JSON.parse(new TextDecoder().decode(data))
}

export function hydrateJoinedRows(rows: JoinedNodePropertyRow[]): NodeState[] {
  const nodeMap = new Map<string, NodeState>()

  for (const row of rows) {
    let node = nodeMap.get(row.id)

    if (!node) {
      node = baseNodeState(row)
      nodeMap.set(row.id, node)
    }

    if (row.property_key && row.value !== null) {
      node.properties[row.property_key] = deserializeValue(row.value)
      node.timestamps[row.property_key] = {
        lamport: row.lamport_time ?? 0,
        author: (row.updated_by ?? '') as DID,
        wallTime: row.prop_updated_at ?? 0,
        // Round-trip the stored key so the in-memory LWW comparison matches the
        // SQL guard exactly (0300); NULL legacy rows keep the author tiebreak.
        ...(row.tiebreak_key != null ? { tiebreakKey: row.tiebreak_key } : {})
      }
      if ((row.prop_updated_at ?? 0) >= node.updatedAt) {
        node.updatedBy = (row.updated_by ?? node.createdBy) as DID
      }
    }
  }

  return Array.from(nodeMap.values())
}

/** Parse one-row-per-node aggregated hydrate results into NodeStates. */
export function hydrateAggregatedRows(rows: AggregatedNodeRow[]): NodeState[] {
  const nodes: NodeState[] = []
  for (const row of rows) {
    const node = baseNodeState(row)
    node.properties = row.props_json ? (JSON.parse(row.props_json) as Record<string, unknown>) : {}
    const meta = row.meta_json
      ? (JSON.parse(row.meta_json) as Record<
          string,
          { l: number; b: string; w: number; k?: string | null }
        >)
      : {}

    const timestamps: Record<string, PropertyTimestamp> = {}
    for (const [key, entry] of Object.entries(meta)) {
      timestamps[key] = {
        lamport: entry.l ?? 0,
        author: (entry.b ?? '') as DID,
        wallTime: entry.w ?? 0,
        // Round-trip the stored tiebreak key (0300) so aggregated hydrate
        // matches the SQL guard; NULL/absent → author tiebreak.
        ...(entry.k != null ? { tiebreakKey: entry.k } : {})
      }
      if ((entry.w ?? 0) >= row.updated_at) {
        node.updatedBy = (entry.b ?? row.created_by) as DID
      }
    }
    node.timestamps = timestamps

    nodes.push(node)
  }
  return nodes
}

// ─── Chunk queries ───────────────────────────────────────────────────────────

export function buildHydrateChunkQuery(ids: string[]): { sql: string; params: SQLValue[] } {
  // Pad to a fixed arity bucket so repeated hydrates share ONE SQL string
  // and hit the worker's prepared-statement cache (exploration 0264). NULL
  // ids never satisfy the JOIN, so padding rows vanish from the result.
  const padded = padToArityBucket(ids, SQL_HYDRATE_ARITY_BUCKETS)
  const values = padded.map(() => '(?, ?)').join(', ')
  const params: SQLValue[] = padded.flatMap((id, ordinal) => [id, ordinal])
  const sql = `
      WITH wanted(id, ordinal) AS (
        VALUES ${values}
      )
      SELECT
        n.id,
        n.schema_id,
        n.created_at,
        n.updated_at,
        n.created_by,
        n.deleted_at,
        p.property_key,
        p.value,
        p.lamport_time,
        p.updated_by,
        p.updated_at AS prop_updated_at,
        p.tiebreak_key,
        wanted.ordinal
      FROM wanted
      JOIN nodes n ON n.id = wanted.id
      LEFT JOIN node_properties p ON p.node_id = n.id
      ORDER BY wanted.ordinal ASC, p.property_key ASC
    `
  return { sql, params }
}

/**
 * Aggregated hydrate (exploration 0264, Wave 2): collapse the EAV rows to
 * ONE row per node inside SQL via `json_group_object`, so the boundary
 * ships N rows instead of N × properties. `value` is stored as JSON text
 * in a BLOB — `json(CAST(… AS TEXT))` re-emits it as real JSON inside the
 * aggregate (without the cast/wrap it would double-encode as a string).
 */
export function buildAggregatedHydrateChunkQuery(ids: string[]): {
  sql: string
  params: SQLValue[]
} {
  const padded = padToArityBucket(ids, SQL_HYDRATE_ARITY_BUCKETS)
  const values = padded.map(() => '(?, ?)').join(', ')
  const params: SQLValue[] = padded.flatMap((id, ordinal) => [id, ordinal])
  const sql = `
      WITH wanted(id, ordinal) AS (
        VALUES ${values}
      )
      SELECT
        n.id,
        n.schema_id,
        n.created_at,
        n.updated_at,
        n.created_by,
        n.deleted_at,
        wanted.ordinal,
        json_group_object(p.property_key, json(CAST(p.value AS TEXT)))
          FILTER (WHERE p.property_key IS NOT NULL) AS props_json,
        json_group_object(
          p.property_key,
          json_object('l', p.lamport_time, 'b', p.updated_by, 'w', p.updated_at, 'k', p.tiebreak_key)
        ) FILTER (WHERE p.property_key IS NOT NULL) AS meta_json
      FROM wanted
      JOIN nodes n ON n.id = wanted.id
      LEFT JOIN node_properties p ON p.node_id = n.id
      GROUP BY n.id
      ORDER BY wanted.ordinal ASC
    `
  return { sql, params }
}

// ─── Batched hydrate ─────────────────────────────────────────────────────────

export async function hydrateNodesByIds(
  db: SQLiteAdapter,
  ids: string[],
  aggregated: boolean
): Promise<NodeState[]> {
  if (ids.length === 0) {
    return []
  }

  const chunks =
    ids.length > SQLITE_HYDRATE_NODE_BATCH_SIZE
      ? chunkItems(ids, SQLITE_HYDRATE_NODE_BATCH_SIZE)
      : [ids]
  const reads = chunks.map((chunk) =>
    aggregated ? buildAggregatedHydrateChunkQuery(chunk) : buildHydrateChunkQuery(chunk)
  )
  const parse = (rows: unknown[]): NodeState[] =>
    aggregated
      ? hydrateAggregatedRows(rows as AggregatedNodeRow[])
      : hydrateJoinedRows(rows as JoinedNodePropertyRow[])

  // Multi-chunk hydrates previously paid one worker round-trip per chunk;
  // queryBatch sends the whole hydrate as ONE RPC and one scheduler slot
  // (exploration 0263). Single chunks keep query()'s coalescing.
  if (reads.length > 1 && typeof db.queryBatch === 'function') {
    const results = await db.queryBatch(reads)
    const nodes: NodeState[] = []
    for (const rows of results) {
      nodes.push(...parse(rows))
    }
    return nodes
  }

  const nodes: NodeState[] = []
  for (const read of reads) {
    const rows = await db.query(read.sql, read.params)
    nodes.push(...parse(rows))
  }
  return nodes
}
