/**
 * Full-text index family (`nodes_fts` / FTS5) for the SQLite node storage
 * adapter (exploration 0276).
 *
 * Row writes go through `updateNodeFTS`/`deleteNodeFTS` from `@xnetjs/sqlite`
 * (which no-op when FTS5 is unavailable, e.g. sql.js); table existence is
 * probed once per session and memoized here.
 */

import type { SchemaIRI } from '../../schema/node'
import type { FullTextSearchQueryPlan } from '../query-compiler'
import type { NodeId, NodeState } from '../types'
import type { IndexingContext, IndexingStrategy } from './index'
import type { SQLValue } from '@xnetjs/sqlite'
import { deleteNodeFTS, extractSearchableContent, updateNodeFTS } from '@xnetjs/sqlite'
import { getNodeQuerySearchTokens, type NodeQueryDescriptor } from '../query'

type FullTextSearchTablesState = 'unknown' | 'absent' | 'ready'

export class FullTextIndexing implements IndexingStrategy<FullTextSearchQueryPlan> {
  private tablesState: FullTextSearchTablesState = 'unknown'

  constructor(private readonly ctx: IndexingContext) {}

  async hasTable(): Promise<boolean> {
    if (this.tablesState === 'ready') {
      return true
    }

    if (this.tablesState === 'absent') {
      return false
    }

    const table = await this.ctx.db.queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nodes_fts'"
    )

    this.tablesState = table ? 'ready' : 'absent'
    return table !== null
  }

  async prepareQueryPlan(descriptor: NodeQueryDescriptor): Promise<FullTextSearchQueryPlan | null> {
    if (!descriptor.search) {
      return null
    }

    const tokens = getNodeQuerySearchTokens(descriptor.search)
    if (tokens.length === 0) {
      return null
    }

    const capabilities = await this.ctx.getStorageCapabilities()
    if (!capabilities.fullTextSearch || !(await this.hasTable())) {
      return null
    }

    return {
      matchExpression: tokens.map((token) => `${token}*`).join(' AND ')
    }
  }

  /**
   * Touched-batch refresh for one node: deleted nodes leave the index,
   * live nodes re-index their searchable content. `indexProperties` is a
   * scalar/spatial concern; FTS always tracks the node's content.
   */
  async syncNode(node: NodeState, _indexProperties: boolean): Promise<number> {
    if (!(await this.hasTable())) {
      return 0
    }

    if (node.deleted) {
      await deleteNodeFTS(this.ctx.db, node.id)
      return 0
    }

    const title = typeof node.properties.title === 'string' ? node.properties.title : null
    const content = extractSearchableContent(node.properties)
    await updateNodeFTS(this.ctx.db, node.id, title, content)
    return title || content ? 1 : 0
  }

  /**
   * setNode-path refresh: unconditional update from the given properties
   * (updateNodeFTS itself no-ops when FTS5 is not supported).
   */
  async updateNode(nodeId: NodeId, properties: NodeState['properties']): Promise<void> {
    const title = typeof properties.title === 'string' ? properties.title : null
    const content = extractSearchableContent(properties)
    await updateNodeFTS(this.ctx.db, nodeId, title, content)
  }

  async deleteNode(nodeId: NodeId): Promise<void> {
    await deleteNodeFTS(this.ctx.db, nodeId)
  }

  async rebuildForSchemas(
    schemaIds: readonly SchemaIRI[],
    nodesBySchemaId: ReadonlyMap<SchemaIRI, readonly NodeState[]>,
    _indexProperties: boolean
  ): Promise<void> {
    if (!(await this.hasTable())) {
      return
    }

    for (const schemaId of schemaIds) {
      const nodes = nodesBySchemaId.get(schemaId) ?? []
      for (const node of nodes) {
        await this.syncNode(node, true)
      }
    }
  }

  /** The FTS delete+insert for one node, as batch operations (exact SQL). */
  createNodeOperations(node: NodeState): Array<{ sql: string; params?: SQLValue[] }> {
    const title = typeof node.properties.title === 'string' ? node.properties.title : null
    const content = extractSearchableContent(node.properties)
    const operations: Array<{ sql: string; params?: SQLValue[] }> = [
      {
        sql: 'DELETE FROM nodes_fts WHERE node_id = ?',
        params: [node.id]
      }
    ]

    if (title || content) {
      operations.push({
        sql: 'INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)',
        params: [node.id, title ?? '', content ?? '']
      })
    }

    return operations
  }

  hasSearchableContent(node: NodeState): boolean {
    const title = typeof node.properties.title === 'string' ? node.properties.title : null
    const content = extractSearchableContent(node.properties)
    return Boolean(title || content)
  }
}
