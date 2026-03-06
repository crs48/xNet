/**
 * Database View - Table/Board view with dynamic schema
 *
 * Schema (columns) and data (rows) are stored in Y.Doc, not hardcoded.
 * - doc.getMap('data').get('columns') -> PropertyDefinition[]
 * - doc.getMap('data').get('rows') -> TableRow[]
 * - doc.getMap('data').get('tableView') -> ViewConfig
 * - doc.getMap('data').get('boardView') -> ViewConfig
 */

import {
  DatabaseSchema,
  decodeAnchor,
  type PropertyType,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor,
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
import { useNode, useIdentity, useMutate, useQuery } from '@xnetjs/react'
import { CommentPopover, CommentsSidebar, type CommentThreadData } from '@xnetjs/ui'
import {
  TableView,
  BoardView,
  CardDetailModal,
  useDatabaseComments,
  AddColumnModal,
  SchemaInfoModal,
  CloneSchemaModal,
  type ViewConfig,
  type TableRow,
  type CellPresence,
  type ColumnUpdate,
  type NewColumnDefinition
} from '@xnetjs/views'
import { Table, LayoutGrid, Plus, Info, Copy } from 'lucide-react'
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

/**
 * Build default view config from columns
 */
function buildDefaultTableView(columns: StoredColumn[]): ViewConfig {
  const visibleProperties = columns.map((c) => c.id)
  const propertyWidths: Record<string, number> = {}
  columns.forEach((c) => {
    propertyWidths[c.id] = c.type === 'text' ? 200 : 120
  })

  // Find first select column for grouping
  const selectColumn = columns.find((c) => c.type === 'select')

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

function buildDefaultBoardView(columns: StoredColumn[]): ViewConfig {
  const visibleProperties = columns.map((c) => c.id)
  const selectColumn = columns.find((c) => c.type === 'select')

  return {
    id: 'default-board',
    name: 'Board View',
    type: 'board',
    visibleProperties,
    sorts: [],
    groupByProperty: selectColumn?.id
  }
}

export function DatabaseView({ docId, minimalChrome = false }: DatabaseViewProps) {
  const { did } = useIdentity()

  const {
    data: database,
    doc,
    loading,
    update,
    presence,
    awareness
  } = useNode(DatabaseSchema, docId, {
    createIfMissing: { title: 'Untitled Database' },
    did: did ?? undefined
  })

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [columns, setColumns] = useState<StoredColumn[]>([])
  const [rows, setRows] = useState<TableRow[]>([])
  const [tableViewConfig, setTableViewConfig] = useState<ViewConfig | null>(null)
  const [boardViewConfig, setBoardViewConfig] = useState<ViewConfig | null>(null)
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
    if (!doc) {
      undoManagerRef.current = null
      return
    }

    const dataMap = doc.getMap('data')
    const manager = new Y.UndoManager([dataMap], { captureTimeout: 300 })
    undoManagerRef.current = manager

    return () => {
      manager.destroy()
      if (undoManagerRef.current === manager) {
        undoManagerRef.current = null
      }
    }
  }, [doc])

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
  const selectedRow = useMemo(
    () => (selectedCardId ? rows.find((r) => r.id === selectedCardId) || null : null),
    [selectedCardId, rows]
  )

  // Build schema from columns using database-scoped IRI
  const schema = useMemo(() => {
    // Use metadata if available, otherwise create initial metadata
    const metadata = schemaMetadata ?? createInitialSchemaMetadata(database?.title ?? 'Untitled')
    const personSuggestions = Array.from(
      new Set(
        [did, ...presence.map((user) => user.did)].filter(
          (entry): entry is string => typeof entry === 'string' && entry.length > 0
        )
      )
    )

    const schemaColumns = columns.map((column) => {
      if (column.type !== 'person') return column
      const nextConfig = {
        ...(column.config || {}),
        suggestions: personSuggestions
      }
      return {
        ...column,
        config: nextConfig
      }
    })

    return buildDatabaseSchema(docId, metadata, schemaColumns)
  }, [columns, docId, schemaMetadata, database?.title, presence, did])

  // Ensure we have valid view configs (use stored or build default)
  const effectiveTableView = useMemo(
    () => tableViewConfig || buildDefaultTableView(columns),
    [tableViewConfig, columns]
  )
  const effectiveBoardView = useMemo(
    () => boardViewConfig || buildDefaultBoardView(columns),
    [boardViewConfig, columns]
  )

  // Broadcast focused cell via awareness
  const handleCellFocus = useCallback(
    (rowId: string, columnId: string) => {
      if (!awareness) return
      awareness.setLocalStateField('cell', { rowId, columnId })
    },
    [awareness]
  )

  const handleCellBlur = useCallback(() => {
    if (!awareness) return
    awareness.setLocalStateField('cell', null)
  }, [awareness])

  // Listen for remote cell focus changes
  useEffect(() => {
    if (!awareness) return

    const updatePresences = () => {
      const states = awareness.getStates()
      const presences: CellPresence[] = []

      states.forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return
        const user = state.user as { did?: string; color?: string; name?: string } | undefined
        const cell = state.cell as { rowId: string; columnId: string } | undefined
        if (user?.did && cell) {
          presences.push({
            rowId: cell.rowId,
            columnId: cell.columnId,
            color: user.color || '#999',
            did: user.did,
            name: user.name || 'Anonymous'
          })
        }
      })

      setCellPresences(presences)
    }

    awareness.on('change', updatePresences)
    updatePresences()

    return () => {
      awareness.off('change', updatePresences)
    }
  }, [awareness])

  // Load data from Y.Doc
  useEffect(() => {
    if (!doc) return

    const dataMap = doc.getMap('data')

    const loadData = () => {
      // Load columns
      const storedColumns = dataMap.get('columns') as StoredColumn[] | undefined
      if (storedColumns && Array.isArray(storedColumns)) {
        setColumns(storedColumns)
      } else {
        // Default: empty database (no columns)
        setColumns([])
      }

      // Load rows
      const storedRows = dataMap.get('rows') as TableRow[] | undefined
      if (storedRows && Array.isArray(storedRows)) {
        setRows(storedRows)
      } else {
        // Default: no rows
        setRows([])
      }

      // Load view configs
      const storedTableView = dataMap.get('tableView') as ViewConfig | undefined
      if (storedTableView) setTableViewConfig(storedTableView)

      const storedBoardView = dataMap.get('boardView') as ViewConfig | undefined
      if (storedBoardView) setBoardViewConfig(storedBoardView)

      // Load or migrate schema metadata
      const storedSchema = dataMap.get('schema') as DatabaseSchemaMetadata | undefined
      if (storedSchema) {
        setSchemaMetadata(storedSchema)
      } else {
        // Migrate: create initial schema metadata for existing databases
        const initialMetadata = createInitialSchemaMetadata(database?.title ?? 'Untitled Database')
        dataMap.set('schema', initialMetadata)
        setSchemaMetadata(initialMetadata)
      }
    }

    loadData()

    const observer = () => loadData()
    dataMap.observe(observer)

    return () => dataMap.unobserve(observer)
  }, [doc, database?.title])

  // Open add column modal
  const handleAddColumn = useCallback(() => {
    setAddColumnModalOpen(true)
  }, [])

  // Handle schema metadata updates from SchemaInfoModal
  const handleUpdateSchemaMetadata = useCallback(
    (updates: Partial<Pick<DatabaseSchemaMetadata, 'name' | 'description'>>) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentMeta = dataMap.get('schema') as DatabaseSchemaMetadata | undefined

      if (currentMeta) {
        const updatedMeta: DatabaseSchemaMetadata = {
          ...currentMeta,
          ...updates,
          updatedAt: Date.now()
        }
        dataMap.set('schema', updatedMeta)
      }
    },
    [doc]
  )

  // Helper to bump schema version on column changes
  const bumpVersion = useCallback(
    (
      operation: 'add' | 'update' | 'rename' | 'delete' | 'changeType',
      changeDescription?: string
    ) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentMeta = dataMap.get('schema') as DatabaseSchemaMetadata | undefined
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

      if (currentMeta) {
        const bumpType = getVersionBumpType(operation)
        const newVersion = bumpSchemaVersion(currentMeta.version, bumpType)
        const updatedMeta: DatabaseSchemaMetadata = {
          ...currentMeta,
          version: newVersion,
          updatedAt: Date.now()
        }
        dataMap.set('schema', updatedMeta)

        // Store version history entry
        const changeType =
          operation === 'add'
            ? 'add'
            : operation === 'delete'
              ? 'delete'
              : operation === 'update' || operation === 'rename' || operation === 'changeType'
                ? 'update'
                : 'update'

        const historyEntry = createVersionEntry(
          newVersion,
          currentColumns,
          changeType,
          changeDescription
        )

        const currentHistory =
          (dataMap.get('schemaHistory') as SchemaVersionEntry[] | undefined) || []
        const updatedHistory = pruneVersionHistory([...currentHistory, historyEntry])
        dataMap.set('schemaHistory', updatedHistory)
      }
    },
    [doc]
  )

  // Handle cloning the database schema
  const handleCloneSchema = useCallback(
    async (options: { name: string; includeRows: boolean; maxSampleRows: number }) => {
      if (!doc || !schemaMetadata) return

      setIsCloning(true)
      try {
        // Prepare source data for cloning
        // Note: ViewConfig types differ between packages - views uses propertyId, data uses columnId
        // We map the field names when passing to cloneSchema
        type DataViewConfig = Parameters<typeof cloneSchema>[0]['tableView']
        const mapViewConfig = (vc: ViewConfig | null): DataViewConfig => {
          if (!vc) return undefined
          return {
            id: vc.id,
            name: vc.name,
            type: vc.type,
            visibleColumns: vc.visibleProperties,
            columnWidths: vc.propertyWidths,
            // Map sorts: propertyId -> columnId
            sorts: vc.sorts.map((s) => ({ columnId: s.propertyId, direction: s.direction })),
            groupBy: vc.groupByProperty,
            coverColumn: vc.coverProperty,
            dateColumn: vc.dateProperty,
            endDateColumn: vc.endDateProperty,
            // Filter types need mapping: propertyId -> columnId
            filters: vc.filter ? mapFilterGroup(vc.filter) : undefined
          }
        }

        // Helper to map filter groups (views uses type/filters, data uses operator/conditions)
        type DataFilterGroup = NonNullable<DataViewConfig>['filters']
        const mapFilterGroup = (fg: NonNullable<ViewConfig['filter']>): DataFilterGroup => ({
          operator: fg.type, // views uses 'type', data uses 'operator'
          conditions: fg.filters.map((f) => ({
            columnId: f.propertyId, // views uses propertyId, data uses columnId
            operator: f.operator,
            value: f.value
          }))
        })

        const sourceData = {
          columns,
          metadata: schemaMetadata,
          tableView: mapViewConfig(tableViewConfig),
          boardView: mapViewConfig(boardViewConfig),
          rows: options.includeRows ? (rows as Array<Record<string, unknown>>) : undefined
        }

        // Clone the schema
        const result = cloneSchema(sourceData, {
          name: options.name,
          includeRows: options.includeRows,
          maxSampleRows: options.maxSampleRows
        })

        // Create a new database node
        const newDb = await create(DatabaseSchema, { title: options.name })
        if (!newDb) {
          throw new Error('Failed to create new database')
        }

        // Note: The actual Y.Doc data needs to be set after the database is created
        // For now, we just create the database node. The new database will have
        // empty data until the user opens it. In a real implementation, we would
        // need to set up the Y.Doc content via the sync manager.
        // This is a simplified implementation that creates the node and shows success.

        setCloneSchemaModalOpen(false)

        // Show success message (in a real app, you'd want a toast notification)
        console.log(`Created new database "${options.name}" with ID: ${newDb.id}`)
        console.log('Clone result:', result)

        // TODO: Navigate to the new database or show a toast notification
      } catch (error) {
        console.error('Failed to clone schema:', error)
        // In a real app, show an error toast
      } finally {
        setIsCloning(false)
      }
    },
    [doc, schemaMetadata, columns, rows, tableViewConfig, boardViewConfig, create]
  )

  // Handle add column from modal
  const handleAddColumnFromModal = useCallback(
    (columnDef: NewColumnDefinition) => {
      if (!doc) return

      stopUndoCapture()
      doc.transact(() => {
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

        const newColumn: StoredColumn = {
          id: `col_${Date.now()}`,
          name: columnDef.name,
          type: columnDef.type as PropertyType,
          config: normalizedConfig
        }

        const dataMap = doc.getMap('data')
        const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
        dataMap.set('columns', [...currentColumns, newColumn])

        const currentTableView = dataMap.get('tableView') as ViewConfig | undefined
        if (currentTableView) {
          dataMap.set('tableView', {
            ...currentTableView,
            visibleProperties: [...currentTableView.visibleProperties, newColumn.id],
            propertyWidths: {
              ...currentTableView.propertyWidths,
              [newColumn.id]: columnDef.width ?? 150
            }
          })
        }

        const currentBoardView = dataMap.get('boardView') as ViewConfig | undefined
        if (currentBoardView) {
          dataMap.set('boardView', {
            ...currentBoardView,
            visibleProperties: [...currentBoardView.visibleProperties, newColumn.id]
          })
        }

        bumpVersion('add', `Added column "${newColumn.name}"`)
      })
    },
    [doc, bumpVersion, stopUndoCapture]
  )

  // Update column (rename, change type)
  const handleUpdateColumn = useCallback(
    (columnId: string, updates: ColumnUpdate) => {
      if (!doc) return

      stopUndoCapture()
      doc.transact(() => {
        const dataMap = doc.getMap('data')
        const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

        const existingColumn = currentColumns.find((col) => col.id === columnId)
        const isTypeChange = updates.type !== undefined && existingColumn?.type !== updates.type
        const isRename = updates.name !== undefined && existingColumn?.name !== updates.name

        const updatedColumns = currentColumns.map((col) => {
          if (col.id !== columnId) return col
          return {
            ...col,
            ...(updates.name !== undefined && { name: updates.name }),
            ...(updates.type !== undefined && { type: updates.type as PropertyType }),
            ...(updates.config !== undefined && { config: updates.config })
          }
        })

        dataMap.set('columns', updatedColumns)

        if (isTypeChange) {
          bumpVersion('changeType', `Changed type of column "${existingColumn?.name}"`)
        } else if (isRename) {
          bumpVersion('rename', `Renamed column "${existingColumn?.name}" to "${updates.name}"`)
        } else {
          bumpVersion('update', `Updated column "${existingColumn?.name}"`)
        }
      })
    },
    [doc, bumpVersion, stopUndoCapture]
  )

  // Delete column
  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      if (!doc) return

      stopUndoCapture()
      doc.transact(() => {
        const dataMap = doc.getMap('data')

        const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
        const updatedColumns = currentColumns.filter((col) => col.id !== columnId)
        dataMap.set('columns', updatedColumns)

        const currentTableView = dataMap.get('tableView') as ViewConfig | undefined
        if (currentTableView) {
          const restWidths = Object.fromEntries(
            Object.entries(currentTableView.propertyWidths || {}).filter(([k]) => k !== columnId)
          )
          dataMap.set('tableView', {
            ...currentTableView,
            visibleProperties: currentTableView.visibleProperties.filter((p) => p !== columnId),
            propertyWidths: restWidths
          })
        }

        const currentBoardView = dataMap.get('boardView') as ViewConfig | undefined
        if (currentBoardView) {
          dataMap.set('boardView', {
            ...currentBoardView,
            visibleProperties: currentBoardView.visibleProperties.filter((p) => p !== columnId),
            groupByProperty:
              currentBoardView.groupByProperty === columnId
                ? undefined
                : currentBoardView.groupByProperty
          })
        }

        const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
        const updatedRows = currentRows.map((row) => {
          const rest = Object.fromEntries(Object.entries(row).filter(([k]) => k !== columnId))
          return rest as TableRow
        })
        const deletedColumn = currentColumns.find((col) => col.id === columnId)
        dataMap.set('rows', updatedRows)

        bumpVersion('delete', `Deleted column "${deletedColumn?.name ?? columnId}"`)
      })
    },
    [doc, bumpVersion, stopUndoCapture]
  )

  const getDefaultCellValue = useCallback((column: StoredColumn): unknown => {
    switch (column.type) {
      case 'checkbox':
        return false
      case 'number':
      case 'date':
      case 'dateRange':
        return null
      case 'multiSelect':
        return []
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

  const mutateRows = useCallback(
    (mutator: (rows: TableRow[]) => TableRow[]) => {
      if (!doc) return
      stopUndoCapture()
      doc.transact(() => {
        const dataMap = doc.getMap('data')
        const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
        dataMap.set('rows', mutator(currentRows))
      })
    },
    [doc, stopUndoCapture]
  )

  // Add new row
  const handleAddRow = useCallback(() => {
    if (!doc) return

    const newRow: TableRow = {
      id: Date.now().toString()
    }

    columns.forEach((col) => {
      newRow[col.id] = getDefaultCellValue(col)
    })

    mutateRows((rows) => [...rows, newRow])
  }, [doc, columns, getDefaultCellValue, mutateRows])

  // Handle row updates
  const handleUpdateRow = useCallback(
    (rowId: string, propertyId: string, value: unknown) => {
      if (!doc) return

      mutateRows((rows) => {
        const existingRow = rows.find((row) => row.id === rowId)
        if (!existingRow) return rows

        const currentValue = existingRow[propertyId]
        if (Object.is(currentValue, value)) return rows

        return rows.map((row) => (row.id === rowId ? { ...row, [propertyId]: value } : row))
      })
    },
    [doc, mutateRows]
  )

  // Handle view config updates
  const handleUpdateTableView = useCallback(
    (changes: Partial<ViewConfig>) => {
      if (!doc) return
      const newConfig = { ...effectiveTableView, ...changes }
      setTableViewConfig(newConfig)
      doc.getMap('data').set('tableView', newConfig)
    },
    [doc, effectiveTableView]
  )

  const handleUpdateBoardView = useCallback(
    (changes: Partial<ViewConfig>) => {
      if (!doc) return
      const newConfig = { ...effectiveBoardView, ...changes }
      setBoardViewConfig(newConfig)
      doc.getMap('data').set('boardView', newConfig)
    },
    [doc, effectiveBoardView]
  )

  // Handle card add for board view
  const handleAddCard = useCallback(
    (columnId: string) => {
      if (!doc) return

      const newRow: TableRow = {
        id: Date.now().toString()
      }

      const groupByProp = effectiveBoardView.groupByProperty
      columns.forEach((col) => {
        if (col.id === groupByProp) {
          newRow[col.id] = columnId === '__none__' ? '' : columnId
        } else {
          newRow[col.id] = getDefaultCellValue(col)
        }
      })

      mutateRows((rows) => [...rows, newRow])
    },
    [doc, columns, effectiveBoardView.groupByProperty, getDefaultCellValue, mutateRows]
  )

  // Handle adding a new board column (= adding a new select option)
  const handleAddBoardColumn = useCallback(() => {
    if (!doc) return

    const groupByProp = effectiveBoardView.groupByProperty
    if (!groupByProp) return

    stopUndoCapture()
    doc.transact(() => {
      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

      const groupColumn = currentColumns.find((c) => c.id === groupByProp)
      if (!groupColumn || (groupColumn.type !== 'select' && groupColumn.type !== 'multiSelect')) {
        return
      }

      const options =
        (groupColumn.config?.options as Array<{ id: string; name: string; color?: string }>) || []
      const newOption = {
        id: `opt_${Date.now()}`,
        name: 'New Column',
        color: '#9ca3af'
      }

      const updatedColumns = currentColumns.map((col) => {
        if (col.id !== groupByProp) return col
        return {
          ...col,
          config: {
            ...col.config,
            options: [...options, newOption]
          }
        }
      })

      dataMap.set('columns', updatedColumns)
    })
  }, [doc, effectiveBoardView.groupByProperty, stopUndoCapture])

  // Handle renaming a board column (= renaming a select option)
  const handleRenameBoardColumn = useCallback(
    (columnId: string, newName: string) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      stopUndoCapture()
      doc.transact(() => {
        const dataMap = doc.getMap('data')
        const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

        const updatedColumns = currentColumns.map((col) => {
          if (col.id !== groupByProp) return col

          const options =
            (col.config?.options as Array<{ id: string; name: string; color?: string }>) || []
          const updatedOptions = options.map((opt) =>
            opt.id === columnId ? { ...opt, name: newName } : opt
          )

          return {
            ...col,
            config: {
              ...col.config,
              options: updatedOptions
            }
          }
        })

        dataMap.set('columns', updatedColumns)
      })
    },
    [doc, effectiveBoardView.groupByProperty, stopUndoCapture]
  )

  // Handle deleting a board column (= removing a select option)
  const handleDeleteBoardColumn = useCallback(
    (columnId: string) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      stopUndoCapture()
      doc.transact(() => {
        const dataMap = doc.getMap('data')
        const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

        const updatedColumns = currentColumns.map((col) => {
          if (col.id !== groupByProp) return col

          const options =
            (col.config?.options as Array<{ id: string; name: string; color?: string }>) || []
          const updatedOptions = options.filter((opt) => opt.id !== columnId)

          return {
            ...col,
            config: {
              ...col.config,
              options: updatedOptions
            }
          }
        })

        dataMap.set('columns', updatedColumns)

        const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
        const updatedRows = currentRows.map((row) => {
          const value = row[groupByProp]
          if (value === columnId) {
            return { ...row, [groupByProp]: '' }
          }
          if (Array.isArray(value)) {
            return { ...row, [groupByProp]: value.filter((entry) => entry !== columnId) }
          }
          return row
        })

        dataMap.set('rows', updatedRows)
      })
    },
    [doc, effectiveBoardView.groupByProperty, stopUndoCapture]
  )

  // Handle reordering board columns (= reordering select options)
  const handleReorderBoardColumns = useCallback(
    (newOrder: string[]) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      stopUndoCapture()
      doc.transact(() => {
        const dataMap = doc.getMap('data')
        const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

        const updatedColumns = currentColumns.map((col) => {
          if (col.id !== groupByProp) return col

          const options =
            (col.config?.options as Array<{ id: string; name: string; color?: string }>) || []

          const reorderedOptions = newOrder
            .map((id) => options.find((opt) => opt.id === id))
            .filter((opt): opt is { id: string; name: string; color?: string } => opt !== undefined)

          return {
            ...col,
            config: {
              ...col.config,
              options: reorderedOptions
            }
          }
        })

        dataMap.set('columns', updatedColumns)
      })
    },
    [doc, effectiveBoardView.groupByProperty, stopUndoCapture]
  )

  // Handle reordering cards (rows)
  const handleReorderCards = useCallback(
    (newRowOrder: string[]) => {
      if (!doc) return

      mutateRows((currentRows) => {
        const reorderedRows = newRowOrder
          .map((id) => currentRows.find((row) => row.id === id))
          .filter((row): row is TableRow => row !== undefined)

        currentRows.forEach((row) => {
          if (!newRowOrder.includes(row.id)) {
            reorderedRows.push(row)
          }
        })

        return reorderedRows
      })
    },
    [doc, mutateRows]
  )

  // Handle deleting a row
  const handleDeleteRow = useCallback(
    (rowId: string) => {
      if (!doc) return

      mutateRows((rows) => rows.filter((row) => row.id !== rowId))
    },
    [doc, mutateRows]
  )

  // Handle card click (open modal)
  const handleCardClick = useCallback((itemId: string) => {
    setSelectedCardId(itemId)
  }, [])

  // Handle modal close
  const handleCloseModal = useCallback(() => {
    setSelectedCardId(null)
  }, [])

  if (loading || !doc) {
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
        <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary">
          <input
            type="text"
            className="text-lg font-semibold border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            value={database?.title || ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Untitled"
          />
          <PresenceAvatars presence={presence} localDid={did} />
          <div className="flex-1" />
          <ShareButton docId={docId} docType="database" />
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

        {!minimalChrome && <PresenceAvatars presence={presence} localDid={did} />}

        {/* Schema version badge */}
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

        {/* Clone button */}
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
            title={`${commentUnresolvedCount} unresolved comment${commentUnresolvedCount !== 1 ? 's' : ''}`}
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            <span className="text-amber-500">{commentUnresolvedCount}</span>
            <span>comment{commentUnresolvedCount !== 1 ? 's' : ''}</span>
          </button>
        )}

        <div className="flex-1" />

        {/* View switcher */}
        <div className="flex items-center rounded-md bg-accent p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              viewMode === 'table'
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Table size={14} />
            <span>Table</span>
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              viewMode === 'board'
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid size={14} />
            <span>Board</span>
          </button>
        </div>

        <button
          onClick={handleAddRow}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-md text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={14} />
          <span>New</span>
        </button>

        {!minimalChrome && <ShareButton docId={docId} docType="database" />}
      </div>

      {/* View content + Sidebar horizontal layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          {viewMode === 'table' ? (
            <TableView
              schema={schema}
              view={effectiveTableView}
              data={rows}
              onUpdateRow={handleUpdateRow}
              onUpdateView={handleUpdateTableView}
              onAddColumn={handleAddColumn}
              onUpdateColumn={handleUpdateColumn}
              onDeleteColumn={handleDeleteColumn}
              onAddRow={handleAddRow}
              cellPresences={cellPresences}
              onCellFocus={handleCellFocus}
              onCellBlur={handleCellBlur}
              cellCommentCounts={cellCommentCounts}
              onCommentClick={handleCommentClick}
              onCommentHover={handleCommentHover}
              onCommentLeave={handleCommentLeave}
              onCommentCreate={handleCommentClick}
              onDeleteRow={handleDeleteRow}
            />
          ) : (
            <BoardView
              schema={schema}
              view={effectiveBoardView}
              data={rows}
              onUpdateRow={handleUpdateRow}
              onUpdateView={handleUpdateBoardView}
              onAddCard={handleAddCard}
              onAddColumn={handleAddBoardColumn}
              onRenameColumn={handleRenameBoardColumn}
              onDeleteColumn={handleDeleteBoardColumn}
              onReorderColumns={handleReorderBoardColumns}
              onReorderCards={handleReorderCards}
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
        onUpdateRow={handleUpdateRow}
        onDeleteRow={handleDeleteRow}
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
