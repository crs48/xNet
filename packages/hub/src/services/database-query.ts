/**
 * @xnetjs/hub - Database query service for large database queries.
 *
 * Provides SQL-powered filtering, sorting, and pagination for databases
 * with 10K+ rows where client-side queries would be too slow.
 */

import type {
  HubStorage,
  DatabaseRowRecord,
  DatabaseRowQueryOptions,
  DatabaseFilterGroup
} from '../storage/interface'

// ─── Request/Response Types ────────────────────────────────────────────────────

export type DatabaseQueryRequest = {
  type: 'database-query'
  id: string
  databaseId: string
  filters?: DatabaseFilterGroup
  sorts?: Array<{ columnId: string; direction: 'asc' | 'desc' }>
  search?: string
  limit?: number
  cursor?: string
  select?: string[]
  includeComputed?: boolean
}

export type DatabaseQueryResponse = {
  type: 'database-query-result'
  id: string
  rows: SerializedRow[]
  total: number
  cursor?: string
  hasMore: boolean
  computed?: Record<string, Record<string, unknown>>
  source: 'sqlite' | 'memory'
  queryTime: number
}

export type DatabaseQueryError = {
  type: 'database-query-error'
  id: string
  error: string
}

export type SerializedRow = {
  id: string
  sortKey: string
  cells: Record<string, unknown>
  createdAt: number
  createdBy: string
}

export type DatabaseRowInsertRequest = {
  type: 'database-row-insert'
  id: string
  row: DatabaseRowRecord
}

export type DatabaseRowUpdateRequest = {
  type: 'database-row-update'
  id: string
  rowId: string
  updates: Partial<Omit<DatabaseRowRecord, 'id' | 'databaseId' | 'createdAt' | 'createdBy'>>
}

export type DatabaseRowDeleteRequest = {
  type: 'database-row-delete'
  id: string
  rowId: string
}

export type DatabaseRowAck = {
  type: 'database-row-ack'
  id: string
  success: boolean
  error?: string
}

export type DatabaseCountRequest = {
  type: 'database-count'
  id: string
  databaseId: string
}

export type DatabaseCountResponse = {
  type: 'database-count-result'
  id: string
  count: number
}

// ─── Service ───────────────────────────────────────────────────────────────────

export class DatabaseQueryService {
  constructor(private storage: HubStorage) {}

  /**
   * Execute a database query with filtering, sorting, and pagination.
   */
  async query(request: DatabaseQueryRequest): Promise<DatabaseQueryResponse> {
    const options: DatabaseRowQueryOptions = {
      databaseId: request.databaseId,
      filters: request.filters,
      sorts: request.sorts,
      search: request.search,
      limit: Math.min(request.limit ?? 50, 1000), // Cap at 1000 rows per request
      cursor: request.cursor,
      select: request.select
    }

    const result = await this.storage.queryDatabaseRows(options)

    return {
      type: 'database-query-result',
      id: request.id,
      rows: result.rows.map(this.serializeRow),
      total: result.total,
      cursor: result.cursor,
      hasMore: result.hasMore,
      source: 'sqlite',
      queryTime: result.queryTime
    }
  }

  /**
   * Get the total row count for a database.
   */
  async getCount(request: DatabaseCountRequest): Promise<DatabaseCountResponse> {
    const count = await this.storage.getDatabaseRowCount(request.databaseId)
    return {
      type: 'database-count-result',
      id: request.id,
      count
    }
  }

  /**
   * Insert a new row into a database.
   */
  async insertRow(request: DatabaseRowInsertRequest): Promise<DatabaseRowAck> {
    try {
      await this.storage.insertDatabaseRow(request.row)
      return { type: 'database-row-ack', id: request.id, success: true }
    } catch (err) {
      return {
        type: 'database-row-ack',
        id: request.id,
        success: false,
        error: err instanceof Error ? err.message : 'Insert failed'
      }
    }
  }

  /**
   * Update an existing row.
   */
  async updateRow(request: DatabaseRowUpdateRequest): Promise<DatabaseRowAck> {
    try {
      await this.storage.updateDatabaseRow(request.rowId, request.updates)
      return { type: 'database-row-ack', id: request.id, success: true }
    } catch (err) {
      return {
        type: 'database-row-ack',
        id: request.id,
        success: false,
        error: err instanceof Error ? err.message : 'Update failed'
      }
    }
  }

  /**
   * Delete a row.
   */
  async deleteRow(request: DatabaseRowDeleteRequest): Promise<DatabaseRowAck> {
    try {
      await this.storage.deleteDatabaseRow(request.rowId)
      return { type: 'database-row-ack', id: request.id, success: true }
    } catch (err) {
      return {
        type: 'database-row-ack',
        id: request.id,
        success: false,
        error: err instanceof Error ? err.message : 'Delete failed'
      }
    }
  }

  /**
   * Get a single row by ID.
   */
  async getRow(rowId: string): Promise<DatabaseRowRecord | null> {
    return this.storage.getDatabaseRow(rowId)
  }

  /**
   * Batch insert multiple rows (for imports).
   */
  async batchInsert(rows: DatabaseRowRecord[]): Promise<{ inserted: number; errors: string[] }> {
    const errors: string[] = []
    let inserted = 0

    try {
      await this.storage.batchInsertDatabaseRows(rows)
      inserted = rows.length
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Batch insert failed')
    }

    return { inserted, errors }
  }

  /**
   * Rebuild the FTS index for a database.
   */
  async rebuildFtsIndex(databaseId: string): Promise<void> {
    await this.storage.rebuildDatabaseRowsFts(databaseId)
  }

  /**
   * Convert a DatabaseRowRecord to a SerializedRow for the wire format.
   */
  private serializeRow(row: DatabaseRowRecord): SerializedRow {
    return {
      id: row.id,
      sortKey: row.sortKey,
      cells: row.data,
      createdAt: row.createdAt,
      createdBy: row.createdBy
    }
  }
}
