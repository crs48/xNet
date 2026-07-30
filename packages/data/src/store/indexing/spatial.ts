/**
 * Spatial index family (`node_spatial_indexes` / `node_spatial_ids` /
 * `node_spatial_rtree`) for the SQLite node storage adapter (exploration
 * 0276).
 *
 * Spatial indexes are created lazily, per (schema, field-mapping) config:
 * the first spatial query for a shape registers a config row and back-fills
 * the R*Tree from materialized state. Tables are created on demand (the DDL
 * is idempotent) and existence is memoized per session.
 */

import type { SchemaIRI } from '../../schema/node'
import type { NodeQueryDescriptor, NodeQuerySpatialFilter } from '../query'
import type { SpatialBoundingBox, SpatialQueryPlan } from '../query-compiler'
import type { NodeId, NodeState } from '../types'
import type { IndexingContext, IndexingStrategy } from './index'
import type { SQLValue } from '@xnetjs/sqlite'
import { hashScalarValue, stringifyStable } from '../query-compiler'
import { SQLITE_BIND_PARAMETER_BATCH_SIZE, chunkItems } from '../sql-batching'

type SpatialTablesState = 'unknown' | 'absent' | 'ready'

export interface SpatialIndexConfigRow {
  spatial_key: string
  schema_id: string
  x_key: string
  y_key: string
  width_key: string | null
  height_key: string | null
  [key: string]: SQLValue
}

export class SpatialIndexing implements IndexingStrategy<SpatialQueryPlan> {
  private tablesState: SpatialTablesState = 'unknown'

  constructor(private readonly ctx: IndexingContext) {}

  async prepareQueryPlan(descriptor: NodeQueryDescriptor): Promise<SpatialQueryPlan | null> {
    if (!descriptor.spatial) {
      return null
    }

    const capabilities = await this.ctx.getStorageCapabilities()
    if (!capabilities.rtree) {
      return null
    }

    await this.ensureTables()
    const spatialKey = this.buildIndexKey(descriptor.schemaId, descriptor.spatial)
    const existing = await this.ctx.db.queryOne<SpatialIndexConfigRow>(
      `SELECT spatial_key, schema_id, x_key, y_key, width_key, height_key
       FROM node_spatial_indexes
       WHERE spatial_key = ?`,
      [spatialKey]
    )

    if (!existing) {
      await this.createIndexConfig(descriptor.schemaId, descriptor.spatial, spatialKey)
    }

    return {
      spatialKey,
      bounds: this.getSearchBounds(descriptor.spatial)
    }
  }

  private async ensureTables(): Promise<void> {
    const capabilities = await this.ctx.getStorageCapabilities()
    if (!capabilities.rtree) {
      this.tablesState = 'absent'
      return
    }

    await this.ctx.db.exec(`
CREATE TABLE IF NOT EXISTS node_spatial_indexes (
  spatial_key TEXT PRIMARY KEY,
  schema_id TEXT NOT NULL,
  x_key TEXT NOT NULL,
  y_key TEXT NOT NULL,
  width_key TEXT,
  height_key TEXT,
  created_at INTEGER NOT NULL,
  last_built_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS node_spatial_ids (
  spatial_id INTEGER PRIMARY KEY,
  spatial_key TEXT NOT NULL,
  node_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  UNIQUE(spatial_key, node_id),
  FOREIGN KEY (spatial_key) REFERENCES node_spatial_indexes(spatial_key) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS node_spatial_rtree USING rtree(
  spatial_id,
  min_x,
  max_x,
  min_y,
  max_y
);

CREATE INDEX IF NOT EXISTS idx_node_spatial_ids_schema
  ON node_spatial_ids(schema_id, spatial_key, node_id);
`)
    this.tablesState = 'ready'
  }

  async hasTables(): Promise<boolean> {
    if (this.tablesState === 'ready') {
      return true
    }

    if (this.tablesState === 'absent') {
      return false
    }

    const table = await this.ctx.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM sqlite_master
       WHERE type IN ('table', 'virtual table')
         AND name IN ('node_spatial_ids', 'node_spatial_rtree')`
    )
    const ready = Number(table?.count ?? 0) === 2
    this.tablesState = ready ? 'ready' : 'absent'

    return ready
  }

  private async createIndexConfig(
    schemaId: SchemaIRI,
    spatial: NodeQuerySpatialFilter,
    spatialKey: string
  ): Promise<void> {
    const fields = this.getFieldConfig(spatial)
    const now = Date.now()

    await this.ctx.enqueueWrite(async () => {
      await this.ctx.db.beginTransaction()
      try {
        await this.ctx.db.run(
          `INSERT INTO node_spatial_indexes
            (spatial_key, schema_id, x_key, y_key, width_key, height_key, created_at, last_built_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            spatialKey,
            schemaId,
            fields.xKey,
            fields.yKey,
            fields.widthKey,
            fields.heightKey,
            now,
            now
          ]
        )

        const nodes = await this.ctx.listNodesForSchema(schemaId)
        const config: SpatialIndexConfigRow = {
          spatial_key: spatialKey,
          schema_id: schemaId,
          x_key: fields.xKey,
          y_key: fields.yKey,
          width_key: fields.widthKey,
          height_key: fields.heightKey
        }

        for (const node of nodes) {
          await this.replaceRowForConfig(node, config, true)
        }

        await this.ctx.db.commit()
      } catch (err) {
        await this.ctx.db.rollback()
        throw err
      }
    })
  }

  async syncNode(node: NodeState, indexProperties: boolean): Promise<number> {
    if (!(await this.hasTables())) {
      return 0
    }

    const configs = await this.ctx.db.query<SpatialIndexConfigRow>(
      `SELECT spatial_key, schema_id, x_key, y_key, width_key, height_key
       FROM node_spatial_indexes
       WHERE schema_id = ?`,
      [node.schemaId]
    )

    let rowsWritten = 0
    for (const config of configs) {
      rowsWritten += await this.replaceRowForConfig(node, config, indexProperties)
    }

    return rowsWritten
  }

  private async replaceRowForConfig(
    node: NodeState,
    config: SpatialIndexConfigRow,
    indexProperties: boolean
  ): Promise<number> {
    await this.deleteRow(config.spatial_key, node.id)

    if (!indexProperties) {
      return 0
    }

    const bounds = this.getNodeBounds(node, config)
    if (!bounds) {
      return 0
    }

    const result = await this.ctx.db.run(
      `INSERT INTO node_spatial_ids (spatial_key, node_id, schema_id)
       VALUES (?, ?, ?)`,
      [config.spatial_key, node.id, node.schemaId]
    )
    const spatialId = Number(result.lastInsertRowid)
    await this.ctx.db.run(
      `INSERT INTO node_spatial_rtree (spatial_id, min_x, max_x, min_y, max_y)
       VALUES (?, ?, ?, ?, ?)`,
      [spatialId, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]
    )
    return 1
  }

  async deleteNode(nodeId: NodeId): Promise<void> {
    if (!(await this.hasTables())) {
      return
    }

    const rows = await this.ctx.db.query<{ spatial_key: string }>(
      `SELECT spatial_key
       FROM node_spatial_ids
       WHERE node_id = ?`,
      [nodeId]
    )

    for (const row of rows) {
      await this.deleteRow(row.spatial_key, nodeId)
    }
  }

  private async deleteRow(spatialKey: string, nodeId: NodeId): Promise<void> {
    const existing = await this.ctx.db.queryOne<{ spatial_id: number }>(
      `SELECT spatial_id
       FROM node_spatial_ids
       WHERE spatial_key = ? AND node_id = ?`,
      [spatialKey, nodeId]
    )

    if (!existing) {
      return
    }

    await this.ctx.db.run('DELETE FROM node_spatial_rtree WHERE spatial_id = ?', [
      existing.spatial_id
    ])
    await this.ctx.db.run('DELETE FROM node_spatial_ids WHERE spatial_id = ?', [
      existing.spatial_id
    ])
  }

  private async clearRowsForConfig(spatialKey: string): Promise<void> {
    const rows = await this.ctx.db.query<{ spatial_id: number }>(
      `SELECT spatial_id
       FROM node_spatial_ids
       WHERE spatial_key = ?`,
      [spatialKey]
    )

    for (const batch of chunkItems(rows, SQLITE_BIND_PARAMETER_BATCH_SIZE)) {
      const placeholders = batch.map(() => '?').join(', ')
      await this.ctx.db.run(
        `DELETE FROM node_spatial_rtree WHERE spatial_id IN (${placeholders})`,
        [...batch.map((row) => row.spatial_id)]
      )
    }

    await this.ctx.db.run('DELETE FROM node_spatial_ids WHERE spatial_key = ?', [spatialKey])
  }

  /** Drop every spatial row AND config (the adapter's `clear()`). */
  async clear(): Promise<void> {
    if (!(await this.hasTables())) {
      return
    }

    await this.ctx.db.run('DELETE FROM node_spatial_rtree')
    await this.ctx.db.run('DELETE FROM node_spatial_ids')
    await this.ctx.db.run('DELETE FROM node_spatial_indexes')
  }

  async rebuildForSchemas(
    schemaIds: readonly SchemaIRI[],
    nodesBySchemaId: ReadonlyMap<SchemaIRI, readonly NodeState[]>,
    indexProperties: boolean
  ): Promise<void> {
    if (!(await this.hasTables())) {
      return
    }

    for (const schemaId of schemaIds) {
      const configs = await this.ctx.db.query<SpatialIndexConfigRow>(
        `SELECT spatial_key, schema_id, x_key, y_key, width_key, height_key
         FROM node_spatial_indexes
         WHERE schema_id = ?`,
        [schemaId]
      )

      for (const config of configs) {
        await this.clearRowsForConfig(config.spatial_key)

        if (!indexProperties) {
          continue
        }

        const nodes = nodesBySchemaId.get(schemaId) ?? []
        for (const node of nodes) {
          await this.replaceRowForConfig(node, config, true)
        }
      }
    }
  }

  private buildIndexKey(schemaId: SchemaIRI, spatial: NodeQuerySpatialFilter): string {
    const fields = this.getFieldConfig(spatial)
    return hashScalarValue(
      stringifyStable({
        schemaId,
        x: fields.xKey,
        y: fields.yKey,
        width: fields.widthKey,
        height: fields.heightKey
      })
    )
  }

  private getFieldConfig(spatial: NodeQuerySpatialFilter): {
    xKey: string
    yKey: string
    widthKey: string | null
    heightKey: string | null
  } {
    return {
      xKey: spatial.fields.x,
      yKey: spatial.fields.y,
      widthKey: spatial.kind === 'window' ? (spatial.fields.width ?? null) : null,
      heightKey: spatial.kind === 'window' ? (spatial.fields.height ?? null) : null
    }
  }

  private getSearchBounds(spatial: NodeQuerySpatialFilter): SpatialBoundingBox {
    if (spatial.kind === 'radius') {
      const radius = Math.abs(spatial.radius)
      return {
        minX: spatial.center.x - radius,
        maxX: spatial.center.x + radius,
        minY: spatial.center.y - radius,
        maxY: spatial.center.y + radius
      }
    }

    const overscan = spatial.overscan ?? 0
    const left = spatial.rect.x - overscan
    const right = spatial.rect.x + spatial.rect.width + overscan
    const top = spatial.rect.y - overscan
    const bottom = spatial.rect.y + spatial.rect.height + overscan

    return {
      minX: Math.min(left, right),
      maxX: Math.max(left, right),
      minY: Math.min(top, bottom),
      maxY: Math.max(top, bottom)
    }
  }

  private getNodeBounds(node: NodeState, config: SpatialIndexConfigRow): SpatialBoundingBox | null {
    const x = this.getFiniteNumberProperty(node, config.x_key)
    const y = this.getFiniteNumberProperty(node, config.y_key)

    if (x === null || y === null) {
      return null
    }

    const width = this.getFiniteNumberProperty(node, config.width_key) ?? 0
    const height = this.getFiniteNumberProperty(node, config.height_key) ?? 0

    return {
      minX: Math.min(x, x + width),
      maxX: Math.max(x, x + width),
      minY: Math.min(y, y + height),
      maxY: Math.max(y, y + height)
    }
  }

  private getFiniteNumberProperty(node: NodeState, key: string | null): number | null {
    if (!key) {
      return null
    }

    const value = node.properties[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    // `parent.sub` addresses one numeric subfield of an object property
    // (e.g. `cell_<fieldId>.lat` on a geo database cell) — must mirror
    // `getNumericProperty` in store/query.ts, the JS parity guard for
    // rows this index admits.
    if (value === undefined) {
      const dot = key.indexOf('.')
      if (dot > 0) {
        const parent = node.properties[key.slice(0, dot)]
        if (typeof parent === 'object' && parent !== null && !Array.isArray(parent)) {
          const sub = (parent as Record<string, unknown>)[key.slice(dot + 1)]
          if (typeof sub === 'number' && Number.isFinite(sub)) {
            return sub
          }
        }
      }
    }

    return null
  }
}
