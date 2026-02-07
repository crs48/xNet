/**
 * @xnet/hub - Database subscription manager for real-time updates.
 *
 * Manages WebSocket subscriptions to database changes and pushes
 * notifications when rows are inserted, updated, or deleted.
 */

import type { SerializedRow } from './database-query'
import type { DatabaseFilterGroup, DatabaseFilterCondition } from '../storage/interface'
import type { WebSocket } from 'ws'
import { EventEmitter } from 'events'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DatabaseSubscribeRequest = {
  type: 'database-subscribe'
  databaseId: string
  filters?: DatabaseFilterGroup
}

export type DatabaseUnsubscribeRequest = {
  type: 'database-unsubscribe'
  databaseId: string
}

export type DatabaseSubscribedAck = {
  type: 'database-subscribed'
  databaseId: string
}

export type DatabaseUnsubscribedAck = {
  type: 'database-unsubscribed'
  databaseId: string
}

export type DatabaseChange = {
  type: 'insert' | 'update' | 'delete'
  rowId: string
  row?: SerializedRow
  changedColumns?: string[]
}

export type DatabaseChangeNotification = {
  type: 'database-change'
  databaseId: string
  changes: DatabaseChange[]
}

type Subscription = {
  ws: WebSocket
  databaseId: string
  filters?: DatabaseFilterGroup
}

// ─── Service ───────────────────────────────────────────────────────────────────

export class DatabaseSubscriptionManager extends EventEmitter {
  private subscriptionsByDatabase = new Map<string, Set<Subscription>>()
  private subscriptionsBySocket = new Map<WebSocket, Set<string>>()

  /**
   * Subscribe a WebSocket to database changes.
   */
  subscribe(ws: WebSocket, databaseId: string, filters?: DatabaseFilterGroup): void {
    // Add to database -> subscriptions map
    if (!this.subscriptionsByDatabase.has(databaseId)) {
      this.subscriptionsByDatabase.set(databaseId, new Set())
    }

    const subscription: Subscription = { ws, databaseId, filters }
    this.subscriptionsByDatabase.get(databaseId)!.add(subscription)

    // Add to socket -> databases map for cleanup
    if (!this.subscriptionsBySocket.has(ws)) {
      this.subscriptionsBySocket.set(ws, new Set())

      // Cleanup on disconnect
      ws.on('close', () => {
        this.removeAllSubscriptions(ws)
      })
    }
    this.subscriptionsBySocket.get(ws)!.add(databaseId)

    this.emit('subscribe', { databaseId, filters })
  }

  /**
   * Unsubscribe a WebSocket from a specific database.
   */
  unsubscribe(ws: WebSocket, databaseId: string): void {
    const subs = this.subscriptionsByDatabase.get(databaseId)
    if (!subs) return

    for (const sub of subs) {
      if (sub.ws === ws) {
        subs.delete(sub)
        break
      }
    }

    if (subs.size === 0) {
      this.subscriptionsByDatabase.delete(databaseId)
    }

    // Update socket -> databases map
    const socketDbs = this.subscriptionsBySocket.get(ws)
    if (socketDbs) {
      socketDbs.delete(databaseId)
      if (socketDbs.size === 0) {
        this.subscriptionsBySocket.delete(ws)
      }
    }

    this.emit('unsubscribe', { databaseId })
  }

  /**
   * Remove all subscriptions for a WebSocket (on disconnect).
   */
  removeAllSubscriptions(ws: WebSocket): void {
    const databaseIds = this.subscriptionsBySocket.get(ws)
    if (!databaseIds) return

    for (const databaseId of databaseIds) {
      const subs = this.subscriptionsByDatabase.get(databaseId)
      if (!subs) continue

      for (const sub of subs) {
        if (sub.ws === ws) {
          subs.delete(sub)
          break
        }
      }

      if (subs.size === 0) {
        this.subscriptionsByDatabase.delete(databaseId)
      }
    }

    this.subscriptionsBySocket.delete(ws)
  }

  /**
   * Notify all subscribers of changes to a database.
   */
  notify(databaseId: string, changes: DatabaseChange[]): void {
    const subs = this.subscriptionsByDatabase.get(databaseId)
    if (!subs || subs.size === 0) return

    for (const sub of subs) {
      // Filter changes based on subscription filter
      const relevantChanges = sub.filters
        ? changes.filter((c) => this.matchesFilter(c, sub.filters!))
        : changes

      if (relevantChanges.length === 0) continue

      const notification: DatabaseChangeNotification = {
        type: 'database-change',
        databaseId,
        changes: relevantChanges
      }

      if (sub.ws.readyState === 1 /* WebSocket.OPEN */) {
        try {
          sub.ws.send(JSON.stringify(notification))
        } catch {
          // Socket may have closed, will be cleaned up on close event
        }
      }
    }

    this.emit('notify', { databaseId, changeCount: changes.length })
  }

  /**
   * Get the number of subscribers for a database.
   */
  getSubscriberCount(databaseId: string): number {
    return this.subscriptionsByDatabase.get(databaseId)?.size ?? 0
  }

  /**
   * Get all database IDs with active subscriptions.
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptionsByDatabase.keys())
  }

  /**
   * Check if a change matches a subscription filter.
   */
  private matchesFilter(change: DatabaseChange, filters: DatabaseFilterGroup): boolean {
    // Always notify deletes (we don't have the row data to filter)
    if (change.type === 'delete') return true
    if (!change.row) return false

    return this.evaluateFilterGroup(change.row.cells, filters)
  }

  /**
   * Evaluate a filter group against row data.
   */
  private evaluateFilterGroup(cells: Record<string, unknown>, group: DatabaseFilterGroup): boolean {
    const results = group.conditions.map((condition) => {
      if ('conditions' in condition) {
        return this.evaluateFilterGroup(cells, condition as DatabaseFilterGroup)
      }
      return this.evaluateCondition(cells, condition as DatabaseFilterCondition)
    })

    return group.operator === 'and' ? results.every(Boolean) : results.some(Boolean)
  }

  /**
   * Evaluate a single filter condition.
   */
  private evaluateCondition(
    cells: Record<string, unknown>,
    condition: DatabaseFilterCondition
  ): boolean {
    const { columnId, operator, value } = condition
    const cellValue = cells[columnId]

    switch (operator) {
      case 'equals':
        return cellValue === value
      case 'notEquals':
        return cellValue !== value
      case 'contains':
        return String(cellValue ?? '').includes(String(value))
      case 'notContains':
        return !String(cellValue ?? '').includes(String(value))
      case 'startsWith':
        return String(cellValue ?? '').startsWith(String(value))
      case 'endsWith':
        return String(cellValue ?? '').endsWith(String(value))
      case 'isEmpty':
        return cellValue == null || cellValue === ''
      case 'isNotEmpty':
        return cellValue != null && cellValue !== ''
      case 'greaterThan':
        return Number(cellValue) > Number(value)
      case 'lessThan':
        return Number(cellValue) < Number(value)
      case 'greaterOrEqual':
        return Number(cellValue) >= Number(value)
      case 'lessOrEqual':
        return Number(cellValue) <= Number(value)
      case 'before':
        return String(cellValue ?? '') < String(value)
      case 'after':
        return String(cellValue ?? '') > String(value)
      case 'between': {
        const [start, end] = value as [unknown, unknown]
        const cv = cellValue as string | number
        return cv >= (start as string | number) && cv <= (end as string | number)
      }
      case 'hasAny': {
        const arr = Array.isArray(cellValue) ? cellValue : []
        const vals = value as unknown[]
        return vals.some((v) => arr.includes(v))
      }
      case 'hasAll': {
        const arr = Array.isArray(cellValue) ? cellValue : []
        const vals = value as unknown[]
        return vals.every((v) => arr.includes(v))
      }
      case 'hasNone': {
        const arr = Array.isArray(cellValue) ? cellValue : []
        const vals = value as unknown[]
        return !vals.some((v) => arr.includes(v))
      }
      default:
        return true
    }
  }
}
