/**
 * @xnet/hub - Database WebSocket message handlers.
 *
 * Handles database query, subscription, and row mutation messages.
 */

import type { AuthContext } from '../auth/ucan'
import type { DatabaseFilterGroup } from '../storage/interface'
import type { WebSocket } from 'ws'
import {
  DatabaseQueryService,
  type DatabaseQueryRequest,
  type DatabaseRowInsertRequest,
  type DatabaseRowUpdateRequest,
  type DatabaseRowDeleteRequest,
  type DatabaseCountRequest
} from '../services/database-query'
import {
  DatabaseSubscriptionManager,
  type DatabaseSubscribeRequest,
  type DatabaseUnsubscribeRequest
} from '../services/database-subscriptions'

// ─── Type Guards ───────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

export const isDatabaseQueryRequest = (value: unknown): value is DatabaseQueryRequest => {
  if (!isRecord(value)) return false
  return (
    value.type === 'database-query' &&
    typeof value.id === 'string' &&
    typeof value.databaseId === 'string'
  )
}

export const isDatabaseCountRequest = (value: unknown): value is DatabaseCountRequest => {
  if (!isRecord(value)) return false
  return (
    value.type === 'database-count' &&
    typeof value.id === 'string' &&
    typeof value.databaseId === 'string'
  )
}

export const isDatabaseRowInsertRequest = (value: unknown): value is DatabaseRowInsertRequest => {
  if (!isRecord(value)) return false
  if (value.type !== 'database-row-insert') return false
  if (typeof value.id !== 'string') return false
  if (!isRecord(value.row)) return false
  return typeof value.row.id === 'string' && typeof value.row.databaseId === 'string'
}

export const isDatabaseRowUpdateRequest = (value: unknown): value is DatabaseRowUpdateRequest => {
  if (!isRecord(value)) return false
  return (
    value.type === 'database-row-update' &&
    typeof value.id === 'string' &&
    typeof value.rowId === 'string' &&
    isRecord(value.updates)
  )
}

export const isDatabaseRowDeleteRequest = (value: unknown): value is DatabaseRowDeleteRequest => {
  if (!isRecord(value)) return false
  return (
    value.type === 'database-row-delete' &&
    typeof value.id === 'string' &&
    typeof value.rowId === 'string'
  )
}

export const isDatabaseSubscribeRequest = (value: unknown): value is DatabaseSubscribeRequest => {
  if (!isRecord(value)) return false
  return value.type === 'database-subscribe' && typeof value.databaseId === 'string'
}

export const isDatabaseUnsubscribeRequest = (
  value: unknown
): value is DatabaseUnsubscribeRequest => {
  if (!isRecord(value)) return false
  return value.type === 'database-unsubscribe' && typeof value.databaseId === 'string'
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export class DatabaseHandler {
  constructor(
    private queryService: DatabaseQueryService,
    private subscriptions: DatabaseSubscriptionManager
  ) {}

  /**
   * Handle a database query request.
   */
  async handleQuery(
    ws: WebSocket,
    request: DatabaseQueryRequest,
    _authContext: AuthContext
  ): Promise<void> {
    try {
      const response = await this.queryService.query(request)
      this.send(ws, response)
    } catch (error) {
      this.send(ws, {
        type: 'database-query-error',
        id: request.id,
        error: error instanceof Error ? error.message : 'Query failed'
      })
    }
  }

  /**
   * Handle a database count request.
   */
  async handleCount(
    ws: WebSocket,
    request: DatabaseCountRequest,
    _authContext: AuthContext
  ): Promise<void> {
    try {
      const response = await this.queryService.getCount(request)
      this.send(ws, response)
    } catch (error) {
      this.send(ws, {
        type: 'database-query-error',
        id: request.id,
        error: error instanceof Error ? error.message : 'Count failed'
      })
    }
  }

  /**
   * Handle a row insert request.
   */
  async handleRowInsert(
    ws: WebSocket,
    request: DatabaseRowInsertRequest,
    _authContext: AuthContext
  ): Promise<void> {
    const response = await this.queryService.insertRow(request)
    this.send(ws, response)

    // Notify subscribers
    if (response.success) {
      this.subscriptions.notify(request.row.databaseId, [
        {
          type: 'insert',
          rowId: request.row.id,
          row: {
            id: request.row.id,
            sortKey: request.row.sortKey,
            cells: request.row.data,
            createdAt: request.row.createdAt,
            createdBy: request.row.createdBy
          }
        }
      ])
    }
  }

  /**
   * Handle a row update request.
   */
  async handleRowUpdate(
    ws: WebSocket,
    request: DatabaseRowUpdateRequest,
    _authContext: AuthContext
  ): Promise<void> {
    // Get the row first to know its database ID
    const existingRow = await this.queryService.getRow(request.rowId)
    const response = await this.queryService.updateRow(request)
    this.send(ws, response)

    // Notify subscribers
    if (response.success && existingRow) {
      const updatedRow = await this.queryService.getRow(request.rowId)
      if (updatedRow) {
        this.subscriptions.notify(existingRow.databaseId, [
          {
            type: 'update',
            rowId: request.rowId,
            row: {
              id: updatedRow.id,
              sortKey: updatedRow.sortKey,
              cells: updatedRow.data,
              createdAt: updatedRow.createdAt,
              createdBy: updatedRow.createdBy
            },
            changedColumns: Object.keys(request.updates.data ?? {})
          }
        ])
      }
    }
  }

  /**
   * Handle a row delete request.
   */
  async handleRowDelete(
    ws: WebSocket,
    request: DatabaseRowDeleteRequest,
    _authContext: AuthContext
  ): Promise<void> {
    // Get the row first to know its database ID
    const existingRow = await this.queryService.getRow(request.rowId)
    const response = await this.queryService.deleteRow(request)
    this.send(ws, response)

    // Notify subscribers
    if (response.success && existingRow) {
      this.subscriptions.notify(existingRow.databaseId, [
        {
          type: 'delete',
          rowId: request.rowId
        }
      ])
    }
  }

  /**
   * Handle a subscription request.
   */
  handleSubscribe(
    ws: WebSocket,
    request: DatabaseSubscribeRequest,
    _authContext: AuthContext
  ): void {
    this.subscriptions.subscribe(ws, request.databaseId, request.filters as DatabaseFilterGroup)
    this.send(ws, {
      type: 'database-subscribed',
      databaseId: request.databaseId
    })
  }

  /**
   * Handle an unsubscribe request.
   */
  handleUnsubscribe(
    ws: WebSocket,
    request: DatabaseUnsubscribeRequest,
    _authContext: AuthContext
  ): void {
    this.subscriptions.unsubscribe(ws, request.databaseId)
    this.send(ws, {
      type: 'database-unsubscribed',
      databaseId: request.databaseId
    })
  }

  /**
   * Send a message to a WebSocket.
   */
  private send(ws: WebSocket, message: unknown): void {
    if (ws.readyState === 1 /* WebSocket.OPEN */) {
      ws.send(JSON.stringify(message))
    }
  }
}
