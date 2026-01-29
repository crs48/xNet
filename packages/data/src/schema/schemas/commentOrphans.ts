/**
 * Comment orphan detection utilities.
 *
 * An anchor is "orphaned" when its target no longer exists:
 * - Text anchor: The relative positions can't be resolved (text was deleted)
 * - Cell anchor: The row or column was deleted
 * - Row anchor: The row was deleted
 * - Column anchor: The column was deleted
 * - Canvas position: Never orphans (coordinates are absolute)
 * - Canvas object: The object was deleted
 * - Node anchor: Never orphans (points to the target node itself)
 */

import {
  type AnchorType,
  type TextAnchor,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor,
  type CanvasObjectAnchor,
  decodeAnchor
} from './commentAnchors'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Why an anchor is orphaned */
export type OrphanReason =
  | 'text-deleted'
  | 'row-deleted'
  | 'column-deleted'
  | 'object-deleted'
  | 'invalid-anchor'

/** Result of orphan detection */
export interface OrphanStatus {
  /** Whether the anchor is orphaned */
  orphaned: boolean
  /** If orphaned, the reason */
  reason?: OrphanReason
  /** Human-readable context (quoted text, row title, etc.) */
  context?: string
}

/** Functions to check if entities exist */
export interface OrphanResolvers {
  /** Check if text anchor positions are still valid */
  resolveTextAnchor?: (anchor: TextAnchor) => { from: number; to: number } | null
  /** Check if a row exists in a database */
  rowExists?: (rowId: string) => boolean
  /** Check if a column/property exists in a database */
  columnExists?: (propertyKey: string) => boolean
  /** Check if a canvas object exists */
  objectExists?: (objectId: string) => boolean
  /** Check if a node exists */
  nodeExists?: (nodeId: string) => boolean
}

// ─── Detection ─────────────────────────────────────────────────────────────────

/**
 * Check if a comment anchor is orphaned.
 *
 * @param anchorType - Type of anchor
 * @param anchorData - JSON-encoded anchor data
 * @param resolvers - Functions to check entity existence
 * @returns OrphanStatus with orphaned flag and reason
 *
 * @example
 * ```ts
 * const status = checkOrphanStatus('text', anchorData, {
 *   resolveTextAnchor: (anchor) => resolveTextAnchor(editor, anchor)
 * })
 *
 * if (status.orphaned) {
 *   console.log(`Comment orphaned: ${status.reason}`)
 * }
 * ```
 */
export function checkOrphanStatus(
  anchorType: AnchorType | string,
  anchorData: string,
  resolvers: OrphanResolvers
): OrphanStatus {
  try {
    switch (anchorType) {
      case 'text': {
        if (!resolvers.resolveTextAnchor) {
          // Can't check without resolver
          return { orphaned: false }
        }
        const anchor = decodeAnchor<TextAnchor>(anchorData)
        const resolved = resolvers.resolveTextAnchor(anchor)
        if (resolved === null) {
          return {
            orphaned: true,
            reason: 'text-deleted',
            context: anchor.quotedText
          }
        }
        return { orphaned: false }
      }

      case 'cell': {
        const anchor = decodeAnchor<CellAnchor>(anchorData)
        // Check row first
        if (resolvers.rowExists && !resolvers.rowExists(anchor.rowId)) {
          return {
            orphaned: true,
            reason: 'row-deleted',
            context: `Row ${anchor.rowId.slice(0, 8)}`
          }
        }
        // Then check column
        if (resolvers.columnExists && !resolvers.columnExists(anchor.propertyKey)) {
          return {
            orphaned: true,
            reason: 'column-deleted',
            context: `Column "${anchor.propertyKey}"`
          }
        }
        return { orphaned: false }
      }

      case 'row': {
        const anchor = decodeAnchor<RowAnchor>(anchorData)
        if (resolvers.rowExists && !resolvers.rowExists(anchor.rowId)) {
          return {
            orphaned: true,
            reason: 'row-deleted',
            context: `Row ${anchor.rowId.slice(0, 8)}`
          }
        }
        return { orphaned: false }
      }

      case 'column': {
        const anchor = decodeAnchor<ColumnAnchor>(anchorData)
        if (resolvers.columnExists && !resolvers.columnExists(anchor.propertyKey)) {
          return {
            orphaned: true,
            reason: 'column-deleted',
            context: `Column "${anchor.propertyKey}"`
          }
        }
        return { orphaned: false }
      }

      case 'canvas-object': {
        const anchor = decodeAnchor<CanvasObjectAnchor>(anchorData)
        if (resolvers.objectExists && !resolvers.objectExists(anchor.objectId)) {
          return {
            orphaned: true,
            reason: 'object-deleted',
            context: `Object ${anchor.objectId.slice(0, 8)}`
          }
        }
        return { orphaned: false }
      }

      case 'canvas-position':
        // Canvas positions are absolute coordinates, never orphan
        return { orphaned: false }

      case 'node':
        // Node anchors point to the target itself, never orphan
        return { orphaned: false }

      default:
        // Unknown anchor type
        return { orphaned: false }
    }
  } catch {
    // Invalid anchor data
    return {
      orphaned: true,
      reason: 'invalid-anchor',
      context: 'Invalid anchor data'
    }
  }
}

/**
 * Filter orphaned comments from a list.
 *
 * @param comments - Array of comments to check
 * @param resolvers - Functions to check entity existence
 * @returns Object with active and orphaned comments
 */
export function filterOrphanedComments<
  T extends { properties: { anchorType: string; anchorData: string } }
>(
  comments: T[],
  resolvers: OrphanResolvers
): { active: T[]; orphaned: { comment: T; status: OrphanStatus }[] } {
  const active: T[] = []
  const orphaned: { comment: T; status: OrphanStatus }[] = []

  for (const comment of comments) {
    const status = checkOrphanStatus(
      comment.properties.anchorType,
      comment.properties.anchorData,
      resolvers
    )

    if (status.orphaned) {
      orphaned.push({ comment, status })
    } else {
      active.push(comment)
    }
  }

  return { active, orphaned }
}
