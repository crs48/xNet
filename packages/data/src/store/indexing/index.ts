/**
 * Indexing strategies for the SQLite node storage adapter (exploration 0276).
 *
 * Three sidecar index families accelerate `queryNodes` — scalar
 * (`node_property_scalars`), full-text (`nodes_fts` / FTS5), and spatial
 * (`node_spatial_*` / R*Tree). Each family follows the same lifecycle: sync
 * rows for one node on write, rebuild whole schemas from materialized state,
 * prepare a query plan for a descriptor, and drop/clear. The families were
 * previously interleaved through `sqlite-adapter.ts`; each now lives in its
 * own module behind the shared {@link IndexingStrategy} shape, taking an
 * explicit {@link IndexingContext} instead of reaching into the adapter.
 *
 * SQL emitted by the strategies is byte-identical to the pre-split adapter:
 * prepared-statement and worker statement caches key on the SQL string, so
 * even whitespace-only reformatting would repartition those caches.
 */

import type { SchemaIRI } from '../../schema/node'
import type { NodeQueryDescriptor, NodeQueryStorageCapabilitiesMetadata } from '../query'
import type { NodeId, NodeState } from '../types'
import type { SQLiteAdapter } from '@xnetjs/sqlite'

/** The adapter capabilities an index family needs — nothing more. */
export interface IndexingContext {
  readonly db: SQLiteAdapter
  /** Memoized FTS5/R*Tree capability probe (owned by the adapter). */
  getStorageCapabilities(): Promise<NodeQueryStorageCapabilitiesMetadata>
  /** Serialize a write onto the adapter's single write lane. */
  enqueueWrite<T>(write: () => Promise<T>): Promise<T>
  /** List every node of a schema (deleted included) for index (re)builds. */
  listNodesForSchema(schemaId: SchemaIRI): Promise<NodeState[]>
  /** Hydrate one node from materialized state. */
  getNode(id: NodeId): Promise<NodeState | null>
}

/**
 * The write-path lifecycle every index family shares. Families expose
 * additional methods for their specifics (batch operation builders, table
 * probes, clears, query-plan preparation) — this is the common core the
 * adapter drives on every node write and schema rebuild.
 */
export interface IndexingStrategy<TQueryPlan = never> {
  /**
   * Refresh this family's rows for ONE node — the hot `setNode` / touched
   * batch-import path. Returns the number of index rows written.
   */
  syncNode(node: NodeState, indexProperties: boolean): Promise<number>
  /** Rebuild this family's rows for whole schemas from materialized state. */
  rebuildForSchemas(
    schemaIds: readonly SchemaIRI[],
    nodesBySchemaId: ReadonlyMap<SchemaIRI, readonly NodeState[]>,
    indexProperties: boolean
  ): Promise<void>
  /** Prepare this family's query plan for a descriptor (null: not applicable). */
  prepareQueryPlan?(descriptor: NodeQueryDescriptor): Promise<TQueryPlan | null>
}

export {
  ScalarIndexing,
  createDeleteRemovedPropertiesOperation,
  deleteRemovedProperties
} from './scalar'
export { FullTextIndexing } from './full-text'
export { SpatialIndexing } from './spatial'
