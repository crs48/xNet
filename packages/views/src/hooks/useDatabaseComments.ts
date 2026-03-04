/**
 * useDatabaseComments - Database-specific comment hook.
 *
 * Extends the universal useComments hook with database-specific helpers:
 * - Comment counts per cell, row, and column
 * - Helper functions to create comments on cells/rows/columns
 * - Thread retrieval by anchor position
 *
 * Following the Universal Social Primitives pattern from plan03_6Comments.
 */
import {
  encodeAnchor,
  decodeAnchor,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor
} from '@xnetjs/data'
import { useComments, type CommentThread } from '@xnetjs/react'
import { useMemo, useCallback } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UseDatabaseCommentsOptions {
  /** The database Node ID (target for all comments) */
  databaseNodeId: string
  /** Schema IRI of the database (optimization hint) */
  databaseSchema?: string
}

export interface UseDatabaseCommentsResult {
  /** All comment threads for this database */
  threads: CommentThread[]
  /** Total comment count */
  count: number
  /** Count of unresolved threads */
  unresolvedCount: number
  /** Whether loading */
  loading: boolean
  /** Any error */
  error: Error | null

  // ─── Comment Counts ─────────────────────────────────────────────────────────
  /** Map of "rowId:propertyKey" -> thread count */
  cellCommentCounts: Map<string, number>
  /** Map of rowId -> thread count for row comments */
  rowCommentCounts: Map<string, number>
  /** Map of propertyKey -> thread count for column comments */
  columnCommentCounts: Map<string, number>

  // ─── Create Comment Actions ─────────────────────────────────────────────────
  /** Create a comment on a cell */
  commentOnCell: (rowId: string, propertyKey: string, content: string) => Promise<string | null>
  /** Create a comment on a row */
  commentOnRow: (rowId: string, content: string) => Promise<string | null>
  /** Create a comment on a column */
  commentOnColumn: (propertyKey: string, content: string) => Promise<string | null>

  // ─── Thread Retrieval ───────────────────────────────────────────────────────
  /** Get all threads for a specific cell */
  getThreadsForCell: (rowId: string, propertyKey: string) => CommentThread[]
  /** Get all threads for a specific row */
  getThreadsForRow: (rowId: string) => CommentThread[]
  /** Get all threads for a specific column */
  getThreadsForColumn: (propertyKey: string) => CommentThread[]

  // ─── Thread Actions (from base hook) ────────────────────────────────────────
  /** Reply to a thread */
  replyTo: (rootCommentId: string, content: string) => Promise<string | null>
  /** Resolve a thread */
  resolveThread: (rootCommentId: string) => Promise<void>
  /** Reopen a thread */
  reopenThread: (rootCommentId: string) => Promise<void>
  /** Delete a comment */
  deleteComment: (commentId: string) => Promise<void>
  /** Delete an entire thread */
  deleteThread: (rootCommentId: string) => Promise<void>
  /** Edit a comment */
  editComment: (commentId: string, content: string) => Promise<void>
  /** Reload comments */
  reload: () => Promise<void>
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Database-specific comment hook that extends useComments.
 *
 * @example
 * ```tsx
 * const {
 *   cellCommentCounts,
 *   commentOnCell,
 *   getThreadsForCell
 * } = useDatabaseComments({
 *   databaseNodeId: database.id,
 *   databaseSchema: 'xnet://xnet.fyi/Database'
 * })
 *
 * // Check if a cell has comments
 * const count = cellCommentCounts.get(`${rowId}:${propertyKey}`) ?? 0
 *
 * // Create a comment on a cell
 * await commentOnCell(rowId, 'status', 'Please update this status')
 *
 * // Get threads for a cell
 * const threads = getThreadsForCell(rowId, 'status')
 * ```
 */
export function useDatabaseComments({
  databaseNodeId,
  databaseSchema
}: UseDatabaseCommentsOptions): UseDatabaseCommentsResult {
  // Use the universal hook (no anchorType filter - we want all database comments)
  const {
    threads,
    count,
    unresolvedCount,
    loading,
    error,
    addComment,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    deleteThread,
    editComment,
    reload
  } = useComments({ nodeId: databaseNodeId })

  // ─── Comment Count Indices ──────────────────────────────────────────────────

  /** Index: "rowId:propertyKey" -> thread count */
  const cellCommentCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const thread of threads) {
      if (thread.root.properties.anchorType === 'cell') {
        try {
          const anchor = decodeAnchor<CellAnchor>(thread.root.properties.anchorData)
          const key = `${anchor.rowId}:${anchor.propertyKey}`
          map.set(key, (map.get(key) ?? 0) + 1)
        } catch {
          // Invalid anchor data, skip
        }
      }
    }
    return map
  }, [threads])

  /** Index: rowId -> thread count */
  const rowCommentCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const thread of threads) {
      if (thread.root.properties.anchorType === 'row') {
        try {
          const anchor = decodeAnchor<RowAnchor>(thread.root.properties.anchorData)
          map.set(anchor.rowId, (map.get(anchor.rowId) ?? 0) + 1)
        } catch {
          // Invalid anchor data, skip
        }
      }
    }
    return map
  }, [threads])

  /** Index: propertyKey -> thread count */
  const columnCommentCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const thread of threads) {
      if (thread.root.properties.anchorType === 'column') {
        try {
          const anchor = decodeAnchor<ColumnAnchor>(thread.root.properties.anchorData)
          map.set(anchor.propertyKey, (map.get(anchor.propertyKey) ?? 0) + 1)
        } catch {
          // Invalid anchor data, skip
        }
      }
    }
    return map
  }, [threads])

  // ─── Create Comment Actions ─────────────────────────────────────────────────

  /** Create a comment on a cell */
  const commentOnCell = useCallback(
    async (rowId: string, propertyKey: string, content: string): Promise<string | null> => {
      const anchor: CellAnchor = { rowId, propertyKey }
      return addComment({
        content,
        anchorType: 'cell',
        anchorData: encodeAnchor(anchor),
        targetSchema: databaseSchema
      })
    },
    [addComment, databaseSchema]
  )

  /** Create a comment on a row */
  const commentOnRow = useCallback(
    async (rowId: string, content: string): Promise<string | null> => {
      const anchor: RowAnchor = { rowId }
      return addComment({
        content,
        anchorType: 'row',
        anchorData: encodeAnchor(anchor),
        targetSchema: databaseSchema
      })
    },
    [addComment, databaseSchema]
  )

  /** Create a comment on a column */
  const commentOnColumn = useCallback(
    async (propertyKey: string, content: string): Promise<string | null> => {
      const anchor: ColumnAnchor = { propertyKey }
      return addComment({
        content,
        anchorType: 'column',
        anchorData: encodeAnchor(anchor),
        targetSchema: databaseSchema
      })
    },
    [addComment, databaseSchema]
  )

  // ─── Thread Retrieval ───────────────────────────────────────────────────────

  /** Get all threads for a specific cell */
  const getThreadsForCell = useCallback(
    (rowId: string, propertyKey: string): CommentThread[] => {
      return threads.filter((t) => {
        if (t.root.properties.anchorType !== 'cell') return false
        try {
          const anchor = decodeAnchor<CellAnchor>(t.root.properties.anchorData)
          return anchor.rowId === rowId && anchor.propertyKey === propertyKey
        } catch {
          return false
        }
      })
    },
    [threads]
  )

  /** Get all threads for a specific row */
  const getThreadsForRow = useCallback(
    (rowId: string): CommentThread[] => {
      return threads.filter((t) => {
        if (t.root.properties.anchorType !== 'row') return false
        try {
          const anchor = decodeAnchor<RowAnchor>(t.root.properties.anchorData)
          return anchor.rowId === rowId
        } catch {
          return false
        }
      })
    },
    [threads]
  )

  /** Get all threads for a specific column */
  const getThreadsForColumn = useCallback(
    (propertyKey: string): CommentThread[] => {
      return threads.filter((t) => {
        if (t.root.properties.anchorType !== 'column') return false
        try {
          const anchor = decodeAnchor<ColumnAnchor>(t.root.properties.anchorData)
          return anchor.propertyKey === propertyKey
        } catch {
          return false
        }
      })
    },
    [threads]
  )

  return {
    // From base hook
    threads,
    count,
    unresolvedCount,
    loading,
    error,
    replyTo,
    resolveThread,
    reopenThread,
    deleteComment,
    deleteThread,
    editComment,
    reload,

    // Database-specific indices
    cellCommentCounts,
    rowCommentCounts,
    columnCommentCounts,

    // Database-specific actions
    commentOnCell,
    commentOnRow,
    commentOnColumn,

    // Thread retrieval
    getThreadsForCell,
    getThreadsForRow,
    getThreadsForColumn
  }
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Check if a database anchor is orphaned.
 * Orphaned anchors reference rows or columns that no longer exist.
 */
export function isDatabaseAnchorOrphaned(
  anchorType: 'cell' | 'row' | 'column',
  anchorData: string,
  existingRowIds: Set<string>,
  existingPropertyKeys: Set<string>
): boolean {
  try {
    if (anchorType === 'cell') {
      const anchor = decodeAnchor<CellAnchor>(anchorData)
      return !existingRowIds.has(anchor.rowId) || !existingPropertyKeys.has(anchor.propertyKey)
    }
    if (anchorType === 'row') {
      const anchor = decodeAnchor<RowAnchor>(anchorData)
      return !existingRowIds.has(anchor.rowId)
    }
    if (anchorType === 'column') {
      const anchor = decodeAnchor<ColumnAnchor>(anchorData)
      return !existingPropertyKeys.has(anchor.propertyKey)
    }
    return false
  } catch {
    // Invalid anchor data is considered orphaned
    return true
  }
}

/**
 * Create a cell key from rowId and propertyKey.
 */
export function createCellKey(rowId: string, propertyKey: string): string {
  return `${rowId}:${propertyKey}`
}

/**
 * Parse a cell key into rowId and propertyKey.
 */
export function parseCellKey(key: string): { rowId: string; propertyKey: string } | null {
  const colonIndex = key.indexOf(':')
  if (colonIndex === -1) return null
  return {
    rowId: key.slice(0, colonIndex),
    propertyKey: key.slice(colonIndex + 1)
  }
}
