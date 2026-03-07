/**
 * Database View - Electron table/board surface composed over the shared database hooks.
 */

import {
  type CellValue,
  type ColumnDefinition,
  DatabaseSchema,
  decodeAnchor,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor,
  type ViewConfig as DataViewConfig,
  // Schema utilities for database-defined schemas
  buildDatabaseSchema,
  createInitialSchemaMetadata,
  bumpSchemaVersion,
  getVersionBumpType,
  cloneSchema,
  createVersionEntry,
  pruneVersionHistory,
  type DatabaseSchemaMetadata,
  type StoredColumn,
  type SchemaVersionEntry
} from '@xnetjs/data'
import {
  useDatabase,
  useDatabaseDoc,
  useNode,
  useIdentity,
  useMutate,
  useQuery
} from '@xnetjs/react'
import {
  CommentPopover,
  CommentsSidebar,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  type CommentThreadData
} from '@xnetjs/ui'
import {
  TableView,
  BoardView,
  CardDetailModal,
  useDatabaseComments,
  AddColumnModal,
  SchemaInfoModal,
  CloneSchemaModal,
  type FilterOperator as SurfaceFilterOperator,
  type ViewConfig as SurfaceViewConfig,
  type TableRow,
  type CellPresence,
  type ColumnUpdate,
  type NewColumnDefinition
} from '@xnetjs/views'
import { Table, LayoutGrid, Plus, Info, Copy, Ellipsis, MessageSquare } from 'lucide-react'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as Y from 'yjs'
import { PresenceAvatars } from './PresenceAvatars'
import { ShareButton } from './ShareButton'

interface DatabaseViewProps {
  docId: string
  minimalChrome?: boolean
}

type ViewMode = 'table' | 'board'

interface CommentPopoverState {
  visible: boolean
  mode: 'preview' | 'full'
  threadId: string | null
  /** Snapshotted anchor position so layout changes don't shift the popover */
  anchorRect: { left: number; top: number; bottom: number; right: number } | null
  /** Cell being commented on (for new comment creation) */
  cellRowId: string | null
  cellPropertyKey: string | null
  /** Focus the reply textarea on open */
  focusReply: boolean
}

const INITIAL_COMMENT_STATE: CommentPopoverState = {
  visible: false,
  mode: 'preview',
  threadId: null,
  anchorRect: null,
  focusReply: false,
  cellRowId: null,
  cellPropertyKey: null
}

const SURFACE_FILTER_OPERATORS = new Set([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'greaterThan',
  'lessThan',
  'greaterOrEqual',
  'lessOrEqual',
  'isEmpty',
  'isNotEmpty',
  'before',
  'after',
  'between'
])

function toSurfaceViewConfig(view: DataViewConfig): SurfaceViewConfig {
  return {
    id: view.id,
    name: view.name,
    type: view.type,
    visibleProperties: view.visibleColumns,
    propertyWidths: view.columnWidths,
    sorts: (view.sorts ?? []).map((sort) => ({
      propertyId: sort.columnId,
      direction: sort.direction
    })),
    filter: view.filters
      ? {
          type: view.filters.operator,
          filters: view.filters.conditions.flatMap((condition) =>
            'conditions' in condition
              ? []
              : SURFACE_FILTER_OPERATORS.has(condition.operator)
                ? [
                    {
                      id: `${condition.columnId}:${condition.operator}`,
                      propertyId: condition.columnId,
                      operator: condition.operator as SurfaceFilterOperator,
                      value: condition.value
                    }
                  ]
                : []
          )
        }
      : undefined,
    groupByProperty: view.groupBy ?? undefined,
    coverProperty: view.coverColumn,
    dateProperty: view.dateColumn,
    endDateProperty: view.endDateColumn
  }
}

function toDataViewChanges(
  changes: Partial<SurfaceViewConfig>
): Partial<Omit<DataViewConfig, 'id'>> {
  return {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.type !== undefined ? { type: changes.type } : {}),
    ...(changes.visibleProperties !== undefined
      ? { visibleColumns: changes.visibleProperties }
      : {}),
    ...(changes.propertyWidths !== undefined ? { columnWidths: changes.propertyWidths } : {}),
    ...(changes.sorts !== undefined
      ? {
          sorts: changes.sorts.map((sort) => ({
            columnId: sort.propertyId,
            direction: sort.direction
          }))
        }
      : {}),
    ...(changes.filter !== undefined
      ? {
          filters: changes.filter
            ? {
                operator: changes.filter.type,
                conditions: changes.filter.filters.map((filter) => ({
                  columnId: filter.propertyId,
                  operator: filter.operator,
                  value: filter.value
                }))
              }
            : null
        }
      : {}),
    ...(changes.groupByProperty !== undefined ? { groupBy: changes.groupByProperty } : {}),
    ...(changes.coverProperty !== undefined ? { coverColumn: changes.coverProperty } : {}),
    ...(changes.dateProperty !== undefined ? { dateColumn: changes.dateProperty } : {}),
    ...(changes.endDateProperty !== undefined ? { endDateColumn: changes.endDateProperty } : {})
  }
}

function buildDefaultTableView(columns: ColumnDefinition[]): SurfaceViewConfig {
  const visibleProperties = columns.map((column) => column.id)
  const propertyWidths = Object.fromEntries(
    columns.map((column) => [column.id, column.width ?? (column.type === 'text' ? 200 : 120)])
  )
  const selectColumn = columns.find((column) => column.type === 'select')

  return {
    id: 'default-table',
    name: 'Table View',
    type: 'table',
    visibleProperties,
    propertyWidths,
    sorts: [],
    groupByProperty: selectColumn?.id
  }
}

function buildDefaultBoardView(columns: ColumnDefinition[]): SurfaceViewConfig {
  const visibleProperties = columns.map((column) => column.id)
  const selectColumn = columns.find((column) => column.type === 'select')

  return {
    id: 'default-board',
    name: 'Board View',
    type: 'board',
    visibleProperties,
    sorts: [],
    groupByProperty: selectColumn?.id
  }
}

function buildDefaultDataView(
  type: 'table' | 'board',
  columns: ColumnDefinition[]
): Omit<DataViewConfig, 'id'> {
  const columnIds = columns.map((column) => column.id)

  if (type === 'board') {
    const selectColumn = columns.find((column) => column.type === 'select')

    return {
      name: 'Board View',
      type: 'board',
      visibleColumns: columnIds,
      sorts: [],
      groupBy: selectColumn?.id ?? null
    }
  }

  return {
    name: 'Table View',
    type: 'table',
    visibleColumns: columnIds,
    columnWidths: Object.fromEntries(
      columns.map((column) => [column.id, column.width ?? (column.type === 'text' ? 200 : 120)])
    ),
    sorts: []
  }
}

function flattenRows(rows: Array<{ id: string; cells: Record<string, CellValue> }>): TableRow[] {
  return rows.map((row) => ({
    id: row.id,
    ...row.cells
  }))
}

function toStoredColumns(columns: ColumnDefinition[]): StoredColumn[] {
  return columns.map((column) => ({
    id: column.id,
    name: column.name,
    type: column.type,
    config: column.config
  }))
}

function inferMovedRow(currentOrder: string[], nextOrder: string[]): string | null {
  if (currentOrder.length !== nextOrder.length) return null

  const start = currentOrder.findIndex((rowId, index) => rowId !== nextOrder[index])
  if (start === -1) return null

  let currentEnd = currentOrder.length - 1
  let nextEnd = nextOrder.length - 1

  while (currentEnd > start && nextEnd > start && currentOrder[currentEnd] === nextOrder[nextEnd]) {
    currentEnd -= 1
    nextEnd -= 1
  }

  if (currentOrder[start] === nextOrder[nextEnd]) {
    return currentOrder[start]
  }

  if (currentOrder[currentEnd] === nextOrder[start]) {
    return currentOrder[currentEnd]
  }

  return nextOrder[start] ?? null
}

function DatabaseViewModeToggle({
  viewMode,
  onChange,
  compact = false
}: {
  viewMode: ViewMode
  onChange: (mode: ViewMode) => void
  compact?: boolean
}): React.ReactElement {
  return (
    <div
      className={[
        'flex items-center rounded-full bg-accent/80',
        compact ? 'p-0.5' : 'rounded-md p-1'
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onChange('table')}
        className={[
          'flex items-center gap-1 rounded-full transition-colors',
          compact ? 'px-2.5 py-1 text-xs' : 'px-2 py-1 text-sm',
          viewMode === 'table'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        ].join(' ')}
        aria-pressed={viewMode === 'table'}
      >
        <Table size={14} />
        <span>Table</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('board')}
        className={[
          'flex items-center gap-1 rounded-full transition-colors',
          compact ? 'px-2.5 py-1 text-xs' : 'px-2 py-1 text-sm',
          viewMode === 'board'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        ].join(' ')}
        aria-pressed={viewMode === 'board'}
      >
        <LayoutGrid size={14} />
        <span>Board</span>
      </button>
    </div>
  )
}

function DatabaseOverflowMenu({
  docId,
  columnsCount,
  rowsCount,
  schemaMetadata,
  onOpenSchemaInfo,
  onOpenCloneSchema
}: {
  docId: string
  columnsCount: number
  rowsCount: number
  schemaMetadata: DatabaseSchemaMetadata | null
  onOpenSchemaInfo: () => void
  onOpenCloneSchema: () => void
}): React.ReactElement {
  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label="Open database actions"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          <Ellipsis size={16} />
        </button>
      }
      align="end"
      sideOffset={8}
      className="min-w-[240px]"
    >
      <MenuLabel>Database</MenuLabel>
      {schemaMetadata && (
        <MenuItem onSelect={onOpenSchemaInfo}>
          <span className="flex w-full items-center gap-2">
            <Info size={14} />
            <span className="flex-1">Schema info</span>
            <span className="text-xs font-mono text-muted-foreground">
              v{schemaMetadata.version}
            </span>
          </span>
        </MenuItem>
      )}
      {columnsCount > 0 && (
        <MenuItem onSelect={onOpenCloneSchema}>
          <span className="flex w-full items-center gap-2">
            <Copy size={14} />
            <span className="flex-1">Clone schema</span>
            <span className="text-xs text-muted-foreground">{rowsCount} rows</span>
          </span>
        </MenuItem>
      )}

      <MenuSeparator />
      <MenuLabel>Share</MenuLabel>
      <div className="px-1 py-1">
        <ShareButton docId={docId} docType="database" />
      </div>
    </Menu>
  )
}

export function DatabaseView({ docId, minimalChrome = false }: DatabaseViewProps) {
  const { did } = useIdentity()

  const {
    data: database,
    loading: nodeLoading,
    update,
    presence,
    awareness
  } = useNode(DatabaseSchema, docId, {
    createIfMissing: { title: 'Untitled Database' },
    did: did ?? undefined
  })
  const {
    columns,
    views,
    doc: databaseDoc,
    loading: databaseDocLoading,
    createColumn,
    updateColumn,
    deleteColumn,
    createView,
    updateView
  } = useDatabaseDoc(docId)
  const {
    rows,
    loading: rowsLoading,
    createRow,
    updateRow,
    deleteRow,
    reorderRow
  } = useDatabase(docId)

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [cellPresences, setCellPresences] = useState<CellPresence[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [addColumnModalOpen, setAddColumnModalOpen] = useState(false)
  const [schemaInfoModalOpen, setSchemaInfoModalOpen] = useState(false)
  const [cloneSchemaModalOpen, setCloneSchemaModalOpen] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [schemaMetadata, setSchemaMetadata] = useState<DatabaseSchemaMetadata | null>(null)

  // Mutations for creating new databases
  const { create } = useMutate()
  const { data: databases } = useQuery(DatabaseSchema, { limit: 200 })

  const availableDatabases = useMemo(
    () =>
      databases
        .filter((entry) => entry.id !== docId)
        .map((entry) => ({ id: entry.id, name: entry.title || 'Untitled' })),
    [databases, docId]
  )

  // ─── Comments Integration ─────────────────────────────────────────────────────

  const {
    threads: commentThreads,
    cellCommentCounts,
    unresolvedCount: commentUnresolvedCount,
    commentOnCell,
    getThreadsForCell,
    replyTo: commentReplyTo,
    resolveThread: commentResolveThread,
    reopenThread: commentReopenThread,
    deleteComment: commentDeleteComment,
    editComment: commentEditComment
  } = useDatabaseComments({
    databaseNodeId: docId,
    databaseSchema: DatabaseSchema.schema['@id']
  })

  const [commentState, setCommentState] = useState<CommentPopoverState>(INITIAL_COMMENT_STATE)
  const [newCommentText, setNewCommentText] = useState('')
  const commentHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const commentDismissTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const commentIndicatorHoveredRef = useRef(false)
  const commentPopoverHoveredRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const undoManagerRef = useRef<Y.UndoManager | null>(null)

  const isTextInputLikeElement = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    )
  }, [])

  const isDatabaseEditableTarget = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false
    return target.closest('[data-xnet-db-editable="true"]') !== null
  }, [])

  useEffect(() => {
    if (!databaseDoc) {
      undoManagerRef.current = null
      return
    }

    const dataMap = databaseDoc.getMap('data')
    const manager = new Y.UndoManager([dataMap], { captureTimeout: 300 })
    undoManagerRef.current = manager

    return () => {
      manager.destroy()
      if (undoManagerRef.current === manager) {
        undoManagerRef.current = null
      }
    }
  }, [databaseDoc])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const manager = undoManagerRef.current
      const container = containerRef.current
      if (!manager || !container) return

      const key = e.key.toLowerCase()
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return

      const targetNode = e.target instanceof Node ? e.target : null
      const activeElement = document.activeElement
      const isInDatabaseView =
        (targetNode !== null && container.contains(targetNode)) ||
        (activeElement !== null && container.contains(activeElement))
      if (!isInDatabaseView) return

      const targetIsTextInputLike = isTextInputLikeElement(e.target)
      const activeIsTextInputLike = isTextInputLikeElement(activeElement)
      const targetIsDatabaseEditable = isDatabaseEditableTarget(e.target)
      const activeIsDatabaseEditable = isDatabaseEditableTarget(activeElement)

      if (
        (targetIsTextInputLike && !targetIsDatabaseEditable) ||
        (activeIsTextInputLike && !activeIsDatabaseEditable)
      ) {
        return
      }

      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          manager.redo()
        } else {
          manager.undo()
        }
        return
      }

      if (!e.metaKey && e.ctrlKey && !e.shiftKey && key === 'y') {
        e.preventDefault()
        manager.redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTextInputLikeElement, isDatabaseEditableTarget])

  const stopUndoCapture = useCallback(() => {
    undoManagerRef.current?.stopCapturing()
  }, [])

  const scheduleCommentDismiss = useCallback(() => {
    if (commentDismissTimeoutRef.current) clearTimeout(commentDismissTimeoutRef.current)
    commentDismissTimeoutRef.current = setTimeout(() => {
      if (!commentIndicatorHoveredRef.current && !commentPopoverHoveredRef.current) {
        setCommentState(INITIAL_COMMENT_STATE)
      }
    }, 200)
  }, [])

  // Convert threads to format expected by CommentPopover
  const commentThreadDataMap = useMemo(() => {
    const map = new Map<string, CommentThreadData>()
    for (const thread of commentThreads) {
      map.set(thread.root.id, {
        root: {
          id: thread.root.id,
          author: thread.root.properties.createdBy,
          authorDisplayName: undefined,
          content: thread.root.properties.content,
          createdAt: thread.root.createdAt,
          edited: thread.root.properties.edited,
          editedAt: thread.root.properties.editedAt
        },
        replies: thread.replies.map((r) => ({
          id: r.id,
          author: r.properties.createdBy,
          authorDisplayName: undefined,
          content: r.properties.content,
          createdAt: r.createdAt,
          edited: r.properties.edited,
          editedAt: r.properties.editedAt
        })),
        resolved: thread.root.properties.resolved
      })
    }
    return map
  }, [commentThreads])

  // Comment indicator handlers
  const handleCommentClick = useCallback(
    (rowId: string, propertyKey: string, anchorEl: HTMLElement) => {
      if (commentHoverTimeoutRef.current) {
        clearTimeout(commentHoverTimeoutRef.current)
        commentHoverTimeoutRef.current = null
      }
      if (commentDismissTimeoutRef.current) {
        clearTimeout(commentDismissTimeoutRef.current)
        commentDismissTimeoutRef.current = null
      }

      // Snapshot the cell rect so layout changes don't shift the popover
      const rect = anchorEl.getBoundingClientRect()
      const snappedRect = { left: rect.left, top: rect.top, bottom: rect.bottom, right: rect.right }

      // Find the first thread for this cell
      const cellThreads = getThreadsForCell(rowId, propertyKey)
      if (cellThreads.length > 0) {
        setCommentState((prev) => {
          if (prev.visible && prev.threadId === cellThreads[0].root.id) {
            return prev.focusReply ? prev : { ...prev, focusReply: true }
          }
          return {
            visible: true,
            mode: 'full',
            threadId: cellThreads[0].root.id,
            anchorRect: snappedRect,
            cellRowId: rowId,
            cellPropertyKey: propertyKey,
            focusReply: true
          }
        })
      } else {
        // No threads yet — open new comment input
        setCommentState({
          visible: true,
          mode: 'full',
          threadId: null,
          anchorRect: snappedRect,
          cellRowId: rowId,
          cellPropertyKey: propertyKey,
          focusReply: true
        })
      }
    },
    [getThreadsForCell]
  )

  const handleCommentHover = useCallback(
    (rowId: string, propertyKey: string, anchorEl: HTMLElement) => {
      commentIndicatorHoveredRef.current = true
      if (commentDismissTimeoutRef.current) {
        clearTimeout(commentDismissTimeoutRef.current)
        commentDismissTimeoutRef.current = null
      }
      if (commentHoverTimeoutRef.current) clearTimeout(commentHoverTimeoutRef.current)
      commentHoverTimeoutRef.current = setTimeout(() => {
        const cellThreads = getThreadsForCell(rowId, propertyKey)
        if (cellThreads.length > 0) {
          const rect = anchorEl.getBoundingClientRect()
          const snappedRect = {
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
            right: rect.right
          }
          setCommentState((prev) => {
            if (prev.visible && prev.threadId === cellThreads[0].root.id) return prev
            return {
              visible: true,
              mode: 'full',
              threadId: cellThreads[0].root.id,
              anchorRect: snappedRect,
              cellRowId: rowId,
              cellPropertyKey: propertyKey,
              focusReply: false
            }
          })
        }
      }, 300)
    },
    [getThreadsForCell]
  )

  const handleCommentLeave = useCallback(() => {
    commentIndicatorHoveredRef.current = false
    if (commentHoverTimeoutRef.current) {
      clearTimeout(commentHoverTimeoutRef.current)
      commentHoverTimeoutRef.current = null
    }
    scheduleCommentDismiss()
  }, [scheduleCommentDismiss])

  const handleCommentPopoverMouseEnter = useCallback(() => {
    commentPopoverHoveredRef.current = true
    if (commentDismissTimeoutRef.current) {
      clearTimeout(commentDismissTimeoutRef.current)
      commentDismissTimeoutRef.current = null
    }
  }, [])

  const handleCommentPopoverMouseLeave = useCallback(() => {
    commentPopoverHoveredRef.current = false
    scheduleCommentDismiss()
  }, [scheduleCommentDismiss])

  const handleCommentDismiss = useCallback(() => {
    if (commentHoverTimeoutRef.current) {
      clearTimeout(commentHoverTimeoutRef.current)
      commentHoverTimeoutRef.current = null
    }
    if (commentDismissTimeoutRef.current) {
      clearTimeout(commentDismissTimeoutRef.current)
      commentDismissTimeoutRef.current = null
    }
    commentIndicatorHoveredRef.current = false
    commentPopoverHoveredRef.current = false
    setCommentState(INITIAL_COMMENT_STATE)
    setNewCommentText('')
  }, [])

  // Comment actions
  const handleCommentReply = useCallback(
    async (content: string) => {
      if (!commentState.threadId) return
      await commentReplyTo(commentState.threadId, content)
    },
    [commentState.threadId, commentReplyTo]
  )

  const handleCommentResolve = useCallback(async () => {
    if (!commentState.threadId) return
    await commentResolveThread(commentState.threadId)
  }, [commentState.threadId, commentResolveThread])

  const handleCommentReopen = useCallback(async () => {
    if (!commentState.threadId) return
    await commentReopenThread(commentState.threadId)
  }, [commentState.threadId, commentReopenThread])

  const handleCommentDelete = useCallback(
    async (commentId: string) => {
      await commentDeleteComment(commentId)
      const thread = commentState.threadId ? commentThreadDataMap.get(commentState.threadId) : null
      if (thread && commentId === thread.root.id && thread.replies.length === 0) {
        handleCommentDismiss()
      }
    },
    [commentDeleteComment, commentState.threadId, commentThreadDataMap, handleCommentDismiss]
  )

  const handleCommentEdit = useCallback(
    async (commentId: string, newContent: string) => {
      await commentEditComment(commentId, newContent)
    },
    [commentEditComment]
  )

  // Create new comment on a cell
  const handleSubmitNewCellComment = useCallback(async () => {
    if (!newCommentText.trim() || !commentState.cellRowId || !commentState.cellPropertyKey) return
    const commentId = await commentOnCell(
      commentState.cellRowId,
      commentState.cellPropertyKey,
      newCommentText.trim()
    )
    setNewCommentText('')
    if (commentId) {
      // Show the newly created thread
      setCommentState((prev) => ({ ...prev, threadId: commentId }))
    }
  }, [newCommentText, commentState.cellRowId, commentState.cellPropertyKey, commentOnCell])

  // ─── Sidebar Handlers ─────────────────────────────────────────────────────────

  const sidebarThreads = useMemo(
    () => Array.from(commentThreadDataMap.values()),
    [commentThreadDataMap]
  )

  const handleSidebarReply = useCallback(
    async (threadId: string, content: string) => {
      await commentReplyTo(threadId, content)
    },
    [commentReplyTo]
  )

  const handleSidebarResolve = useCallback(
    async (threadId: string) => {
      await commentResolveThread(threadId)
    },
    [commentResolveThread]
  )

  const handleSidebarReopen = useCallback(
    async (threadId: string) => {
      await commentReopenThread(threadId)
    },
    [commentReopenThread]
  )

  const handleSidebarDelete = useCallback(
    async (commentId: string) => {
      await commentDeleteComment(commentId)
    },
    [commentDeleteComment]
  )

  const handleSidebarEdit = useCallback(
    async (commentId: string, newContent: string) => {
      await commentEditComment(commentId, newContent)
    },
    [commentEditComment]
  )

  // Build a map from thread ID to its anchor coordinates for hover highlighting
  const threadAnchorMap = useMemo(() => {
    const map = new Map<
      string,
      | { type: 'cell'; rowId: string; propertyKey: string }
      | { type: 'row'; rowId: string }
      | { type: 'column'; propertyKey: string }
    >()
    for (const thread of commentThreads) {
      const anchorType = thread.root.properties.anchorType
      const anchorData = thread.root.properties.anchorData
      try {
        if (anchorType === 'cell') {
          const anchor = decodeAnchor<CellAnchor>(anchorData)
          map.set(thread.root.id, {
            type: 'cell',
            rowId: anchor.rowId,
            propertyKey: anchor.propertyKey
          })
        } else if (anchorType === 'row') {
          const anchor = decodeAnchor<RowAnchor>(anchorData)
          map.set(thread.root.id, { type: 'row', rowId: anchor.rowId })
        } else if (anchorType === 'column') {
          const anchor = decodeAnchor<ColumnAnchor>(anchorData)
          map.set(thread.root.id, { type: 'column', propertyKey: anchor.propertyKey })
        }
      } catch {
        // Skip malformed anchors
      }
    }
    return map
  }, [commentThreads])

  const hoveredDbThreadRef = useRef<string | null>(null)
  const dbLeaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const HIGHLIGHT_CLASS = 'xnet-db-comment-hover'

  const handleSidebarHoverThread = useCallback(
    (threadId: string) => {
      // Cancel pending leave
      if (dbLeaveTimerRef.current) {
        clearTimeout(dbLeaveTimerRef.current)
        dbLeaveTimerRef.current = null
      }

      // Clear previous highlights
      if (hoveredDbThreadRef.current && hoveredDbThreadRef.current !== threadId) {
        document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
          el.classList.remove(HIGHLIGHT_CLASS)
        })
      }

      hoveredDbThreadRef.current = threadId

      const anchor = threadAnchorMap.get(threadId)
      if (!anchor) return

      let cells: NodeListOf<Element> | null = null

      if (anchor.type === 'cell') {
        cells = document.querySelectorAll(
          `td[data-row-id="${anchor.rowId}"][data-column-id="${anchor.propertyKey}"]`
        )
      } else if (anchor.type === 'row') {
        cells = document.querySelectorAll(`td[data-row-id="${anchor.rowId}"]`)
      } else if (anchor.type === 'column') {
        cells = document.querySelectorAll(`td[data-column-id="${anchor.propertyKey}"]`)
      }

      if (cells && cells.length > 0) {
        cells.forEach((el) => el.classList.add(HIGHLIGHT_CLASS))
        // Scroll the first matching cell into view (both axes)
        cells[0].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
    },
    [threadAnchorMap]
  )

  const handleSidebarLeaveThread = useCallback(() => {
    if (dbLeaveTimerRef.current) clearTimeout(dbLeaveTimerRef.current)
    dbLeaveTimerRef.current = setTimeout(() => {
      hoveredDbThreadRef.current = null
      document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
        el.classList.remove(HIGHLIGHT_CLASS)
      })
    }, 150)
  }, [])

  const currentCommentThread = commentState.threadId
    ? commentThreadDataMap.get(commentState.threadId)
    : null

  // Get selected row for modal
  const flatRows = useMemo(() => flattenRows(rows), [rows])
  const selectedRow = useMemo(
    () => (selectedCardId ? (flatRows.find((row) => row.id === selectedCardId) ?? null) : null),
    [flatRows, selectedCardId]
  )
  const tableView = useMemo(() => views.find((view) => view.type === 'table') ?? null, [views])
  const boardView = useMemo(() => views.find((view) => view.type === 'board') ?? null, [views])

  useEffect(() => {
    if (!databaseDoc) return

    const dataMap = databaseDoc.getMap('data')

    const syncSchemaMetadata = () => {
      const storedSchema = dataMap.get('schema') as DatabaseSchemaMetadata | undefined

      if (storedSchema) {
        setSchemaMetadata(storedSchema)
        return
      }

      const initialMetadata = createInitialSchemaMetadata(database?.title ?? 'Untitled Database')
      dataMap.set('schema', initialMetadata)
      setSchemaMetadata(initialMetadata)
    }

    syncSchemaMetadata()
    dataMap.observe(syncSchemaMetadata)

    return () => {
      dataMap.unobserve(syncSchemaMetadata)
    }
  }, [databaseDoc, database?.title])

  const writeSchemaMetadata = useCallback(
    (metadata: DatabaseSchemaMetadata, history?: SchemaVersionEntry[]) => {
      if (!databaseDoc) return

      const dataMap = databaseDoc.getMap('data')
      dataMap.set('schema', metadata)
      if (history) {
        dataMap.set('schemaHistory', history)
      }
      setSchemaMetadata(metadata)
    },
    [databaseDoc]
  )

  const recordSchemaVersion = useCallback(
    (
      operation: 'add' | 'update' | 'rename' | 'delete' | 'changeType',
      nextColumns: ColumnDefinition[],
      changeDescription?: string
    ) => {
      if (!databaseDoc) return

      const dataMap = databaseDoc.getMap('data')
      const currentMeta =
        (dataMap.get('schema') as DatabaseSchemaMetadata | undefined) ??
        createInitialSchemaMetadata(database?.title ?? 'Untitled Database')
      const currentHistory =
        (dataMap.get('schemaHistory') as SchemaVersionEntry[] | undefined) ?? []

      const nextVersion = bumpSchemaVersion(currentMeta.version, getVersionBumpType(operation))
      const nextMeta: DatabaseSchemaMetadata = {
        ...currentMeta,
        version: nextVersion,
        updatedAt: Date.now()
      }
      const changeType = operation === 'add' ? 'add' : operation === 'delete' ? 'delete' : 'update'
      const nextHistory = pruneVersionHistory([
        ...currentHistory,
        createVersionEntry(nextVersion, toStoredColumns(nextColumns), changeType, changeDescription)
      ])

      writeSchemaMetadata(nextMeta, nextHistory)
    },
    [databaseDoc, database?.title, writeSchemaMetadata]
  )

  const schema = useMemo(() => {
    const metadata = schemaMetadata ?? createInitialSchemaMetadata(database?.title ?? 'Untitled')
    const personSuggestions = Array.from(
      new Set(
        [did, ...presence.map((user) => user.did)].filter(
          (entry): entry is string => typeof entry === 'string' && entry.length > 0
        )
      )
    )

    const schemaColumns: StoredColumn[] = columns.map((column) => ({
      id: column.id,
      name: column.name,
      type: column.type,
      config:
        column.type === 'person'
          ? {
              ...(column.config || {}),
              suggestions: personSuggestions
            }
          : column.config
    }))

    return buildDatabaseSchema(docId, metadata, schemaColumns)
  }, [columns, database?.title, did, docId, presence, schemaMetadata])

  const effectiveTableView = useMemo(
    () => (tableView ? toSurfaceViewConfig(tableView) : buildDefaultTableView(columns)),
    [columns, tableView]
  )
  const effectiveBoardView = useMemo(
    () => (boardView ? toSurfaceViewConfig(boardView) : buildDefaultBoardView(columns)),
    [boardView, columns]
  )

  const ensureView = useCallback(
    (type: 'table' | 'board'): string | null => {
      const existingView = views.find((view) => view.type === type)
      if (existingView) return existingView.id
      return createView(buildDefaultDataView(type, columns))
    },
    [columns, createView, views]
  )

  const handleCellFocus = useCallback(
    (rowId: string, columnId: string) => {
      awareness?.setLocalStateField('cell', { rowId, columnId })
    },
    [awareness]
  )

  const handleCellBlur = useCallback(() => {
    awareness?.setLocalStateField('cell', null)
  }, [awareness])

  useEffect(() => {
    if (!awareness) return

    const updatePresences = () => {
      const presences: CellPresence[] = []

      awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return

        const user = state.user as { did?: string; color?: string; name?: string } | undefined
        const cell = state.cell as { rowId?: string; columnId?: string } | undefined
        if (!user?.did || !cell?.rowId || !cell?.columnId) return

        presences.push({
          rowId: cell.rowId,
          columnId: cell.columnId,
          color: user.color || '#999',
          did: user.did,
          name: user.name || 'Anonymous'
        })
      })

      setCellPresences(presences)
    }

    awareness.on('change', updatePresences)
    updatePresences()

    return () => {
      awareness.off('change', updatePresences)
    }
  }, [awareness])

  const handleAddColumn = useCallback(() => {
    setAddColumnModalOpen(true)
  }, [])

  const handleUpdateSchemaMetadata = useCallback(
    (updates: Partial<Pick<DatabaseSchemaMetadata, 'name' | 'description'>>) => {
      if (!databaseDoc) return

      const currentMeta =
        schemaMetadata ?? createInitialSchemaMetadata(database?.title ?? 'Untitled Database')

      writeSchemaMetadata({
        ...currentMeta,
        ...updates,
        updatedAt: Date.now()
      })
    },
    [database?.title, databaseDoc, schemaMetadata, writeSchemaMetadata]
  )

  const handleCloneSchema = useCallback(
    async (options: { name: string; includeRows: boolean; maxSampleRows: number }) => {
      if (!databaseDoc || !schemaMetadata) return

      setIsCloning(true)
      try {
        const result = cloneSchema(
          {
            columns: toStoredColumns(columns),
            metadata: schemaMetadata,
            tableView: tableView ?? undefined,
            boardView: boardView ?? undefined,
            rows: options.includeRows ? (flatRows as Array<Record<string, unknown>>) : undefined
          },
          {
            name: options.name,
            includeRows: options.includeRows,
            maxSampleRows: options.maxSampleRows
          }
        )

        const newDb = await create(DatabaseSchema, { title: options.name })
        if (!newDb) {
          throw new Error('Failed to create new database')
        }

        setCloneSchemaModalOpen(false)
        console.log(`Created new database "${options.name}" with ID: ${newDb.id}`)
        console.log('Clone result:', result)
      } catch (error) {
        console.error('Failed to clone schema:', error)
      } finally {
        setIsCloning(false)
      }
    },
    [boardView, columns, create, databaseDoc, flatRows, schemaMetadata, tableView]
  )

  const getDefaultCellValue = useCallback((column: ColumnDefinition): CellValue => {
    switch (column.type) {
      case 'checkbox':
        return false
      case 'multiSelect':
        return []
      case 'number':
      case 'date':
      case 'dateRange':
      case 'select':
      case 'file':
        return null
      case 'relation': {
        const allowMultiple =
          typeof column.config?.allowMultiple === 'boolean' ? column.config.allowMultiple : true
        return allowMultiple ? [] : ''
      }
      case 'person': {
        const multiple =
          typeof column.config?.multiple === 'boolean'
            ? column.config.multiple
            : typeof column.config?.allowMultiple === 'boolean'
              ? column.config.allowMultiple
              : false
        return multiple ? [] : ''
      }
      default:
        return ''
    }
  }, [])

  const handleAddColumnFromModal = useCallback(
    (columnDef: NewColumnDefinition) => {
      stopUndoCapture()

      const normalizedConfig: Record<string, unknown> = {
        ...(columnDef.config as Record<string, unknown>)
      }
      if (
        columnDef.type === 'person' &&
        Object.prototype.hasOwnProperty.call(normalizedConfig, 'allowMultiple')
      ) {
        normalizedConfig.multiple = normalizedConfig.allowMultiple
        delete normalizedConfig.allowMultiple
      }

      const nextColumnDefinition: Omit<ColumnDefinition, 'id'> = {
        name: columnDef.name,
        type: columnDef.type,
        config: normalizedConfig,
        ...(columnDef.width !== undefined ? { width: columnDef.width } : {})
      }

      const newColumnId = createColumn(nextColumnDefinition)
      if (!newColumnId) return

      recordSchemaVersion(
        'add',
        [...columns, { id: newColumnId, ...nextColumnDefinition }],
        `Added column "${columnDef.name}"`
      )
    },
    [columns, createColumn, recordSchemaVersion, stopUndoCapture]
  )

  const handleUpdateColumn = useCallback(
    (columnId: string, updates: ColumnUpdate) => {
      const existingColumn = columns.find((column) => column.id === columnId)
      if (!existingColumn) return

      stopUndoCapture()

      const nextColumns = columns.map((column) =>
        column.id !== columnId
          ? column
          : {
              ...column,
              ...(updates.name !== undefined ? { name: updates.name } : {}),
              ...(updates.type !== undefined
                ? { type: updates.type as ColumnDefinition['type'] }
                : {}),
              ...(updates.config !== undefined ? { config: updates.config } : {})
            }
      )

      updateColumn(columnId, {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.type !== undefined ? { type: updates.type as ColumnDefinition['type'] } : {}),
        ...(updates.config !== undefined ? { config: updates.config } : {})
      })

      if (updates.type !== undefined && existingColumn.type !== updates.type) {
        recordSchemaVersion(
          'changeType',
          nextColumns,
          `Changed type of column "${existingColumn.name}"`
        )
        return
      }

      if (updates.name !== undefined && existingColumn.name !== updates.name) {
        recordSchemaVersion(
          'rename',
          nextColumns,
          `Renamed column "${existingColumn.name}" to "${updates.name}"`
        )
        return
      }

      recordSchemaVersion('update', nextColumns, `Updated column "${existingColumn.name}"`)
    },
    [columns, recordSchemaVersion, stopUndoCapture, updateColumn]
  )

  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      const deletedColumn = columns.find((column) => column.id === columnId)
      if (!deletedColumn) return

      stopUndoCapture()
      deleteColumn(columnId)
      recordSchemaVersion(
        'delete',
        columns.filter((column) => column.id !== columnId),
        `Deleted column "${deletedColumn.name}"`
      )
    },
    [columns, deleteColumn, recordSchemaVersion, stopUndoCapture]
  )

  const handleAddRow = useCallback(async () => {
    const values = Object.fromEntries(
      columns.map((column) => [column.id, getDefaultCellValue(column)])
    ) as Record<string, CellValue>

    await createRow(values)
  }, [columns, createRow, getDefaultCellValue])

  const handleUpdateRow = useCallback(
    async (rowId: string, propertyId: string, value: unknown) => {
      await updateRow(rowId, { [propertyId]: value as CellValue })
    },
    [updateRow]
  )

  const handleDeleteRow = useCallback(
    async (rowId: string) => {
      await deleteRow(rowId)
    },
    [deleteRow]
  )

  const handleUpdateTableView = useCallback(
    (changes: Partial<SurfaceViewConfig>) => {
      const viewId = ensureView('table')
      if (!viewId) return
      updateView(viewId, toDataViewChanges(changes))
    },
    [ensureView, updateView]
  )

  const handleUpdateBoardView = useCallback(
    (changes: Partial<SurfaceViewConfig>) => {
      const viewId = ensureView('board')
      if (!viewId) return
      updateView(viewId, toDataViewChanges(changes))
    },
    [ensureView, updateView]
  )

  const handleAddCard = useCallback(
    async (columnId: string) => {
      const groupByProperty = effectiveBoardView.groupByProperty
      const values = Object.fromEntries(
        columns.map((column) => [
          column.id,
          column.id === groupByProperty
            ? columnId === '__none__'
              ? null
              : columnId
            : getDefaultCellValue(column)
        ])
      ) as Record<string, CellValue>

      await createRow(values)
    },
    [columns, createRow, effectiveBoardView.groupByProperty, getDefaultCellValue]
  )

  const handleAddBoardColumn = useCallback(() => {
    const groupByProp = effectiveBoardView.groupByProperty
    if (!groupByProp) return

    const groupColumn = columns.find((column) => column.id === groupByProp)
    if (!groupColumn || (groupColumn.type !== 'select' && groupColumn.type !== 'multiSelect')) {
      return
    }

    const options =
      (groupColumn.config?.options as Array<{ id: string; name: string; color?: string }>) ?? []

    stopUndoCapture()
    updateColumn(groupByProp, {
      config: {
        ...groupColumn.config,
        options: [
          ...options,
          {
            id: `opt_${Date.now()}`,
            name: 'New Column',
            color: '#9ca3af'
          }
        ]
      }
    })
  }, [columns, effectiveBoardView.groupByProperty, stopUndoCapture, updateColumn])

  const handleRenameBoardColumn = useCallback(
    (columnId: string, newName: string) => {
      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      const groupColumn = columns.find((column) => column.id === groupByProp)
      if (!groupColumn) return

      const options =
        (groupColumn.config?.options as Array<{ id: string; name: string; color?: string }>) ?? []

      stopUndoCapture()
      updateColumn(groupByProp, {
        config: {
          ...groupColumn.config,
          options: options.map((option) =>
            option.id === columnId ? { ...option, name: newName } : option
          )
        }
      })
    },
    [columns, effectiveBoardView.groupByProperty, stopUndoCapture, updateColumn]
  )

  const handleDeleteBoardColumn = useCallback(
    async (columnId: string) => {
      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      const groupColumn = columns.find((column) => column.id === groupByProp)
      if (!groupColumn) return

      const options =
        (groupColumn.config?.options as Array<{ id: string; name: string; color?: string }>) ?? []

      stopUndoCapture()
      updateColumn(groupByProp, {
        config: {
          ...groupColumn.config,
          options: options.filter((option) => option.id !== columnId)
        }
      })

      await Promise.all(
        rows.flatMap((row) => {
          const value = row.cells[groupByProp]

          if (value === columnId) {
            return [updateRow(row.id, { [groupByProp]: null })]
          }

          if (Array.isArray(value) && value.includes(columnId)) {
            return [
              updateRow(row.id, {
                [groupByProp]: value.filter((entry) => entry !== columnId) as CellValue
              })
            ]
          }

          return []
        })
      )
    },
    [columns, effectiveBoardView.groupByProperty, rows, stopUndoCapture, updateColumn, updateRow]
  )

  const handleReorderBoardColumns = useCallback(
    (newOrder: string[]) => {
      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      const groupColumn = columns.find((column) => column.id === groupByProp)
      if (!groupColumn) return

      const options =
        (groupColumn.config?.options as Array<{ id: string; name: string; color?: string }>) ?? []

      stopUndoCapture()
      updateColumn(groupByProp, {
        config: {
          ...groupColumn.config,
          options: newOrder
            .map((optionId) => options.find((option) => option.id === optionId))
            .filter(
              (option): option is { id: string; name: string; color?: string } =>
                option !== undefined
            )
        }
      })
    },
    [columns, effectiveBoardView.groupByProperty, stopUndoCapture, updateColumn]
  )

  const handleReorderCards = useCallback(
    async (newRowOrder: string[]) => {
      const currentOrder = rows.map((row) => row.id)
      const movedRowId = inferMovedRow(currentOrder, newRowOrder)
      if (!movedRowId) return

      const targetIndex = newRowOrder.indexOf(movedRowId)
      if (targetIndex === -1) return

      await reorderRow(movedRowId, newRowOrder[targetIndex + 1], newRowOrder[targetIndex - 1])
    },
    [reorderRow, rows]
  )

  const handleCardClick = useCallback((itemId: string) => {
    setSelectedCardId(itemId)
  }, [])

  const handleCloseModal = useCallback(() => {
    setSelectedCardId(null)
  }, [])

  const minimalCommentCountLabel =
    commentUnresolvedCount > 0
      ? `${commentUnresolvedCount} unresolved comment${commentUnresolvedCount !== 1 ? 's' : ''}`
      : 'Open comments'

  if (nodeLoading || databaseDocLoading || rowsLoading || !databaseDoc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading database...</p>
      </div>
    )
  }

  // Empty state when no columns
  if (columns.length === 0) {
    return (
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className={[
            'flex items-center gap-2 border-b border-border',
            minimalChrome ? 'bg-background/80 px-5 py-3 backdrop-blur-xl' : 'bg-secondary p-3'
          ].join(' ')}
        >
          <input
            type="text"
            className={[
              'border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground',
              minimalChrome ? 'text-base font-semibold' : 'text-lg font-semibold'
            ].join(' ')}
            value={database?.title || ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Untitled"
          />

          {minimalChrome ? (
            presence.length > 0 ? (
              <div className="scale-90">
                <PresenceAvatars presence={presence} localDid={did} />
              </div>
            ) : null
          ) : (
            <PresenceAvatars presence={presence} localDid={did} />
          )}

          <div className="flex-1" />

          {minimalChrome ? (
            <>
              <button
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                title={minimalCommentCountLabel}
              >
                <MessageSquare size={14} />
                <span>Comments</span>
                {commentUnresolvedCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600">
                    {commentUnresolvedCount}
                  </span>
                )}
              </button>
              <DatabaseOverflowMenu
                docId={docId}
                columnsCount={columns.length}
                rowsCount={rows.length}
                schemaMetadata={schemaMetadata}
                onOpenSchemaInfo={() => setSchemaInfoModalOpen(true)}
                onOpenCloneSchema={() => setCloneSchemaModalOpen(true)}
              />
            </>
          ) : (
            <ShareButton docId={docId} docType="database" />
          )}
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <p className="mb-4">This database has no columns yet.</p>
          <button
            onClick={handleAddColumn}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
            Add Column
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div
        className={[
          'flex items-center gap-2 border-b border-border',
          minimalChrome ? 'bg-background/80 px-5 py-3 backdrop-blur-xl' : 'bg-secondary p-3'
        ].join(' ')}
      >
        {/* Title */}
        <input
          type="text"
          className={[
            'border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground',
            minimalChrome ? 'text-base font-semibold' : 'text-lg font-semibold'
          ].join(' ')}
          value={database?.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled"
        />

        {minimalChrome ? (
          presence.length > 0 ? (
            <div className="scale-90">
              <PresenceAvatars presence={presence} localDid={did} />
            </div>
          ) : null
        ) : (
          <PresenceAvatars presence={presence} localDid={did} />
        )}

        {!minimalChrome && schemaMetadata && (
          <button
            className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-muted-foreground hover:text-foreground bg-accent rounded transition-colors cursor-pointer"
            title="View schema info"
            onClick={() => setSchemaInfoModalOpen(true)}
          >
            <Info size={12} />
            <span>v{schemaMetadata.version}</span>
          </button>
        )}

        {!minimalChrome && columns.length > 0 && (
          <button
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground bg-accent rounded transition-colors cursor-pointer"
            title="Clone schema to new database"
            onClick={() => setCloneSchemaModalOpen(true)}
          >
            <Copy size={12} />
            <span>Clone</span>
          </button>
        )}

        {!minimalChrome && commentUnresolvedCount > 0 && (
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={minimalCommentCountLabel}
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            <span className="text-amber-500">{commentUnresolvedCount}</span>
            <span>comment{commentUnresolvedCount !== 1 ? 's' : ''}</span>
          </button>
        )}

        <div className="flex-1" />

        <DatabaseViewModeToggle
          viewMode={viewMode}
          onChange={setViewMode}
          compact={minimalChrome}
        />

        <button
          onClick={() => {
            void handleAddRow()
          }}
          className={[
            'flex items-center gap-1 bg-primary text-primary-foreground transition-colors hover:bg-primary/90',
            minimalChrome ? 'rounded-full px-3.5 py-2 shadow-sm' : 'rounded-md px-3 py-1.5'
          ].join(' ')}
        >
          <Plus size={14} />
          <span>{minimalChrome ? 'Add row' : 'New'}</span>
        </button>

        {minimalChrome ? (
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            title={minimalCommentCountLabel}
          >
            <MessageSquare size={14} />
            <span>Comments</span>
            {commentUnresolvedCount > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600">
                {commentUnresolvedCount}
              </span>
            )}
          </button>
        ) : (
          <ShareButton docId={docId} docType="database" />
        )}

        {minimalChrome && (
          <DatabaseOverflowMenu
            docId={docId}
            columnsCount={columns.length}
            rowsCount={rows.length}
            schemaMetadata={schemaMetadata}
            onOpenSchemaInfo={() => setSchemaInfoModalOpen(true)}
            onOpenCloneSchema={() => setCloneSchemaModalOpen(true)}
          />
        )}
      </div>

      {/* View content + Sidebar horizontal layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          {viewMode === 'table' ? (
            <TableView
              schema={schema}
              view={effectiveTableView}
              data={flatRows}
              onUpdateRow={(rowId, propertyId, value) => {
                void handleUpdateRow(rowId, propertyId, value)
              }}
              onUpdateView={handleUpdateTableView}
              onAddColumn={handleAddColumn}
              onUpdateColumn={handleUpdateColumn}
              onDeleteColumn={handleDeleteColumn}
              onAddRow={() => {
                void handleAddRow()
              }}
              cellPresences={cellPresences}
              onCellFocus={handleCellFocus}
              onCellBlur={handleCellBlur}
              cellCommentCounts={cellCommentCounts}
              onCommentClick={handleCommentClick}
              onCommentHover={handleCommentHover}
              onCommentLeave={handleCommentLeave}
              onCommentCreate={handleCommentClick}
              onDeleteRow={(rowId) => {
                void handleDeleteRow(rowId)
              }}
            />
          ) : (
            <BoardView
              schema={schema}
              view={effectiveBoardView}
              data={flatRows}
              onUpdateRow={(rowId, propertyId, value) => {
                void handleUpdateRow(rowId, propertyId, value)
              }}
              onUpdateView={handleUpdateBoardView}
              onAddCard={(columnId) => {
                void handleAddCard(columnId)
              }}
              onAddColumn={handleAddBoardColumn}
              onRenameColumn={handleRenameBoardColumn}
              onDeleteColumn={(columnId) => {
                void handleDeleteBoardColumn(columnId)
              }}
              onReorderColumns={handleReorderBoardColumns}
              onReorderCards={(nextRowOrder) => {
                void handleReorderCards(nextRowOrder)
              }}
              onCardClick={handleCardClick}
            />
          )}
        </div>

        {/* Comments Sidebar */}
        <CommentsSidebar
          threads={sidebarThreads}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          selectedThreadId={commentState.threadId}
          onReply={handleSidebarReply}
          onResolve={handleSidebarResolve}
          onReopen={handleSidebarReopen}
          onDelete={handleSidebarDelete}
          onEdit={handleSidebarEdit}
          onHoverThread={handleSidebarHoverThread}
          onLeaveThread={handleSidebarLeaveThread}
        />
      </div>

      {/* Card detail modal */}
      <CardDetailModal
        isOpen={selectedCardId !== null}
        onClose={handleCloseModal}
        row={selectedRow}
        schema={schema}
        onUpdateRow={(rowId, propertyId, value) => {
          void handleUpdateRow(rowId, propertyId, value)
        }}
        onDeleteRow={(rowId) => {
          void handleDeleteRow(rowId)
        }}
      />

      {/* Comment Popover */}
      {commentState.visible &&
        commentState.anchorRect &&
        (currentCommentThread ? (
          <CommentPopover
            thread={currentCommentThread}
            anchor={{ x: commentState.anchorRect.left, y: commentState.anchorRect.bottom + 8 }}
            mode={commentState.mode}
            open={commentState.visible}
            focusReply={commentState.focusReply}
            onReply={handleCommentReply}
            onResolve={handleCommentResolve}
            onReopen={handleCommentReopen}
            onDelete={handleCommentDelete}
            onEdit={handleCommentEdit}
            onDismiss={handleCommentDismiss}
            onMouseEnter={handleCommentPopoverMouseEnter}
            onMouseLeave={handleCommentPopoverMouseLeave}
          />
        ) : commentState.cellRowId && commentState.cellPropertyKey ? (
          /* New comment input for cells without existing threads */
          <div
            className="fixed z-50 animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
              left: commentState.anchorRect.left,
              top: commentState.anchorRect.bottom + 8
            }}
            onMouseEnter={handleCommentPopoverMouseEnter}
            onMouseLeave={handleCommentPopoverMouseLeave}
          >
            <div className="w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg p-3">
              <div className="text-sm font-medium mb-2">Add Comment</div>
              <textarea
                className="w-full p-2 text-sm rounded border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
                placeholder="Write a comment..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSubmitNewCellComment()
                  }
                  if (e.key === 'Escape') handleCommentDismiss()
                }}
              />
              {newCommentText.trim() && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleSubmitNewCellComment}
                    className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Comment
                  </button>
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-2">
                Cmd+Enter to submit, Esc to cancel
              </div>
            </div>
          </div>
        ) : null)}

      {/* Add Column Modal */}
      <AddColumnModal
        isOpen={addColumnModalOpen}
        onClose={() => setAddColumnModalOpen(false)}
        onAdd={handleAddColumnFromModal}
        availableDatabases={availableDatabases}
      />

      {/* Schema Info Modal */}
      <SchemaInfoModal
        isOpen={schemaInfoModalOpen}
        onClose={() => setSchemaInfoModalOpen(false)}
        metadata={schemaMetadata}
        schemaIRI={schema['@id']}
        onUpdate={handleUpdateSchemaMetadata}
      />

      {/* Clone Schema Modal */}
      <CloneSchemaModal
        isOpen={cloneSchemaModalOpen}
        onClose={() => setCloneSchemaModalOpen(false)}
        sourceMetadata={schemaMetadata}
        sourceColumns={columns}
        sourceRowCount={rows.length}
        onClone={handleCloneSchema}
        isCloning={isCloning}
      />
    </div>
  )
}
