/**
 * Database View - Table/Board view with dynamic schema
 *
 * Schema (columns) and data (rows) are stored in Y.Doc, not hardcoded.
 * - doc.getMap('data').get('columns') -> PropertyDefinition[]
 * - doc.getMap('data').get('rows') -> TableRow[]
 * - doc.getMap('data').get('tableView') -> ViewConfig
 * - doc.getMap('data').get('boardView') -> ViewConfig
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNode, useIdentity } from '@xnet/react'
import {
  DatabaseSchema,
  decodeAnchor,
  type Schema,
  type PropertyDefinition,
  type PropertyType,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor
} from '@xnet/data'
import {
  TableView,
  BoardView,
  CardDetailModal,
  useDatabaseComments,
  type ViewConfig,
  type TableRow,
  type CellPresence,
  type ColumnUpdate
} from '@xnet/views'
import { CommentPopover, CommentsSidebar, type CommentThreadData } from '@xnet/ui'
import { Table, LayoutGrid, Plus } from 'lucide-react'
import { ShareButton } from './ShareButton'
import { PresenceAvatars } from './PresenceAvatars'

interface DatabaseViewProps {
  docId: string
}

type ViewMode = 'table' | 'board'

/**
 * Stored column definition (simplified PropertyDefinition for storage)
 */
interface StoredColumn {
  id: string
  name: string
  type: PropertyType
  config?: Record<string, unknown>
}

/**
 * Build a Schema object from stored columns
 */
function buildSchema(columns: StoredColumn[], _dbId: string): Schema {
  const properties: PropertyDefinition[] = columns.map((col) => ({
    '@id': `xnet://xnet.fyi/DynamicDatabase#${col.id}`,
    name: col.name,
    type: col.type,
    required: false,
    config: col.config
  }))

  return {
    '@id': `xnet://xnet.fyi/DynamicDatabase` as const,
    '@type': 'xnet://xnet.fyi/Schema',
    name: 'DynamicDatabase',
    namespace: 'xnet://xnet.fyi/',
    properties
  }
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

export function DatabaseView({ docId }: DatabaseViewProps) {
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

  // Comment popover state
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

  const [commentState, setCommentState] = useState<CommentPopoverState>(INITIAL_COMMENT_STATE)
  const [newCommentText, setNewCommentText] = useState('')
  const commentHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const commentDismissTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const commentIndicatorHoveredRef = useRef(false)
  const commentPopoverHoveredRef = useRef(false)

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

  // Build schema from columns
  const schema = useMemo(() => buildSchema(columns, docId), [columns, docId])

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
    }

    loadData()

    const observer = () => loadData()
    dataMap.observe(observer)

    return () => dataMap.unobserve(observer)
  }, [doc])

  // Add new column
  const handleAddColumn = useCallback(() => {
    if (!doc) return

    const newColumn: StoredColumn = {
      id: `col_${Date.now()}`,
      name: 'New Column',
      type: 'text'
    }

    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
    const updatedColumns = [...currentColumns, newColumn]
    dataMap.set('columns', updatedColumns)

    // Update view configs to include new column
    const currentTableView = dataMap.get('tableView') as ViewConfig | undefined
    if (currentTableView) {
      dataMap.set('tableView', {
        ...currentTableView,
        visibleProperties: [...currentTableView.visibleProperties, newColumn.id],
        propertyWidths: { ...currentTableView.propertyWidths, [newColumn.id]: 150 }
      })
    }

    const currentBoardView = dataMap.get('boardView') as ViewConfig | undefined
    if (currentBoardView) {
      dataMap.set('boardView', {
        ...currentBoardView,
        visibleProperties: [...currentBoardView.visibleProperties, newColumn.id]
      })
    }
  }, [doc])

  // Update column (rename, change type)
  const handleUpdateColumn = useCallback(
    (columnId: string, updates: ColumnUpdate) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

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
    },
    [doc]
  )

  // Delete column
  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      if (!doc) return

      const dataMap = doc.getMap('data')

      // Remove from columns
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
      const updatedColumns = currentColumns.filter((col) => col.id !== columnId)
      dataMap.set('columns', updatedColumns)

      // Remove from view configs
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
          // If deleted column was groupBy, clear it
          groupByProperty:
            currentBoardView.groupByProperty === columnId
              ? undefined
              : currentBoardView.groupByProperty
        })
      }

      // Remove column data from all rows
      const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
      const updatedRows = currentRows.map((row) => {
        const rest = Object.fromEntries(Object.entries(row).filter(([k]) => k !== columnId))
        return rest as TableRow
      })
      dataMap.set('rows', updatedRows)
    },
    [doc]
  )

  // Add new row
  const handleAddRow = useCallback(() => {
    if (!doc) return

    const newRow: TableRow = {
      id: Date.now().toString()
    }

    // Initialize all columns with empty/default values
    columns.forEach((col) => {
      switch (col.type) {
        case 'checkbox':
          newRow[col.id] = false
          break
        case 'number':
          newRow[col.id] = null
          break
        case 'multiSelect':
          newRow[col.id] = []
          break
        default:
          newRow[col.id] = ''
      }
    })

    const dataMap = doc.getMap('data')
    const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
    const updatedRows = [...currentRows, newRow]
    dataMap.set('rows', updatedRows)
  }, [doc, columns])

  // Handle row updates
  const handleUpdateRow = useCallback(
    (rowId: string, propertyId: string, value: unknown) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentRows = dataMap.get('rows') as TableRow[] | undefined
      if (!currentRows) return

      const updatedRows = currentRows.map((row) =>
        row.id === rowId ? { ...row, [propertyId]: value } : row
      )

      dataMap.set('rows', updatedRows)
    },
    [doc]
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

      // Initialize columns, setting the groupBy column to the clicked column
      const groupByProp = effectiveBoardView.groupByProperty
      columns.forEach((col) => {
        if (col.id === groupByProp) {
          // Don't set __none__ as a value
          newRow[col.id] = columnId === '__none__' ? '' : columnId
        } else {
          switch (col.type) {
            case 'checkbox':
              newRow[col.id] = false
              break
            case 'number':
              newRow[col.id] = null
              break
            case 'multiSelect':
              newRow[col.id] = []
              break
            default:
              newRow[col.id] = ''
          }
        }
      })

      const dataMap = doc.getMap('data')
      const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
      const updatedRows = [...currentRows, newRow]
      dataMap.set('rows', updatedRows)
    },
    [doc, columns, effectiveBoardView.groupByProperty]
  )

  // Handle adding a new board column (= adding a new select option)
  const handleAddBoardColumn = useCallback(() => {
    if (!doc) return

    const groupByProp = effectiveBoardView.groupByProperty
    if (!groupByProp) return

    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

    // Find the groupBy column
    const groupColumn = currentColumns.find((c) => c.id === groupByProp)
    if (!groupColumn || (groupColumn.type !== 'select' && groupColumn.type !== 'multiSelect'))
      return

    // Add new option
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
  }, [doc, effectiveBoardView.groupByProperty])

  // Handle renaming a board column (= renaming a select option)
  const handleRenameBoardColumn = useCallback(
    (columnId: string, newName: string) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

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
    },
    [doc, effectiveBoardView.groupByProperty]
  )

  // Handle deleting a board column (= removing a select option)
  const handleDeleteBoardColumn = useCallback(
    (columnId: string) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

      // Remove option from the select column
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

      // Clear the deleted option value from all rows
      const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
      const updatedRows = currentRows.map((row) => {
        const value = row[groupByProp]
        if (value === columnId) {
          return { ...row, [groupByProp]: '' }
        }
        // Handle multiSelect
        if (Array.isArray(value)) {
          return { ...row, [groupByProp]: value.filter((v) => v !== columnId) }
        }
        return row
      })

      dataMap.set('rows', updatedRows)
    },
    [doc, effectiveBoardView.groupByProperty]
  )

  // Handle reordering board columns (= reordering select options)
  const handleReorderBoardColumns = useCallback(
    (newOrder: string[]) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

      const updatedColumns = currentColumns.map((col) => {
        if (col.id !== groupByProp) return col

        const options =
          (col.config?.options as Array<{ id: string; name: string; color?: string }>) || []

        // Reorder options based on newOrder
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
    },
    [doc, effectiveBoardView.groupByProperty]
  )

  // Handle reordering cards (rows)
  const handleReorderCards = useCallback(
    (newRowOrder: string[]) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []

      // Reorder rows based on the new order
      const reorderedRows = newRowOrder
        .map((id) => currentRows.find((row) => row.id === id))
        .filter((row): row is TableRow => row !== undefined)

      // Add any rows that weren't in the new order (shouldn't happen but be safe)
      currentRows.forEach((row) => {
        if (!newRowOrder.includes(row.id)) {
          reorderedRows.push(row)
        }
      })

      dataMap.set('rows', reorderedRows)
    },
    [doc]
  )

  // Handle deleting a row
  const handleDeleteRow = useCallback(
    (rowId: string) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
      const updatedRows = currentRows.filter((row) => row.id !== rowId)
      dataMap.set('rows', updatedRows)
    },
    [doc]
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
      <div className="flex-1 flex flex-col overflow-hidden">
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary">
        {/* Title */}
        <input
          type="text"
          className="text-lg font-semibold border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          value={database?.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled"
        />

        <PresenceAvatars presence={presence} localDid={did} />
        {commentUnresolvedCount > 0 && (
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
        <div className="flex items-center bg-accent rounded-md p-1">
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

        <ShareButton docId={docId} docType="database" />
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
    </div>
  )
}
