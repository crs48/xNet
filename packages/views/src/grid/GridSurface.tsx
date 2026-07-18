/**
 * GridSurface — the V2 database grid (exploration 0159).
 *
 * DOM grid with:
 * - TanStack Virtual row virtualization
 * - GridState reducer + full keyboard map (see keymap.ts)
 * - TSV clipboard copy/cut/paste with typed coercion
 * - dnd-kit column reorder (header) and row reorder (gutter handle)
 * - pointer column resize
 * - presence rings and comment badges per cell
 *
 * The surface is store-agnostic: data comes in as GridField/GridRowData
 * props, mutations leave through GridCallbacks. View nodes remain the
 * single source of truth — no internal mirror of sort/filter/visibility.
 */

import type { CellPresence } from '../types.js'
import type { CellRef, GridCallbacks, GridField, GridRowData } from './model.js'
import type { GridCommand, GridPos, GridState, KeyInput } from './types.js'
import type { CellValue, SortConfig } from '@xnetjs/data'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@xnetjs/ui'
import { Expand, GripVertical, Plus } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { coerceCellText, parseTsv, serializeTsv, type PasteField } from './clipboard.js'
import { GridCell } from './GridCell.js'
import { GridHeader } from './GridHeader.js'
import { interpretKeyDown } from './keymap.js'
import { createGridState, gridReducer } from './state.js'
import { isSelected, selectionRect } from './types.js'

const GUTTER_WIDTH = 56
const DEFAULT_ROW_HEIGHT = 36
const GHOST_COL_WIDTH = 140
/**
 * Column virtualization kicks in above this many columns. Below it every
 * field renders (simpler DOM, dnd/tests unchanged); above it vertical
 * scrolling would mount O(columns) cells per overscan row — measured sub-60fps
 * from ~32 columns, 8.6fps at 128 (exploration 0340).
 */
const COLUMN_VIRTUALIZE_MIN = 20
/** Grow the row window when scroll comes within this many rows of the end. */
const REACH_END_THRESHOLD_ROWS = 50

/** Synthetic field for ghost cells (typing creates the real thing). */
const GHOST_FIELD: GridField = {
  id: '__ghost__',
  name: '',
  type: 'text',
  config: {},
  width: GHOST_COL_WIDTH
}

/** Synthetic row for the ghost row (typing creates the real thing). */
const GHOST_ROW: GridRowData = { id: '__ghost__', cells: {} }

/**
 * Rendered column range for virtualized rows: absolute indexes [start, end]
 * plus spacer widths standing in for the unrendered columns on each side.
 */
interface ColWindow {
  start: number
  end: number
  padLeft: number
  padRight: number
}

export interface GridSurfaceProps extends GridCallbacks {
  fields: GridField[]
  rows: GridRowData[]
  sorts?: SortConfig[]
  presences?: CellPresence[]
  /** "rowId:fieldId" -> thread count */
  cellCommentCounts?: Map<string, number>
  /**
   * Per-cell edit lock keyed "rowId:fieldId" -> short reason. A present entry
   * makes that cell non-editable (beyond the global `readOnly` / column
   * `field.readonly`) and surfaces the reason on hover. Used e.g. to reflect
   * authorization per cell.
   */
  cellLockReasons?: ReadonlyMap<string, string>
  rowHeight?: number
  readOnly?: boolean
  className?: string
  /**
   * True matching row count for the whole table (not just the loaded
   * window). When it exceeds `rows.length` the footer reads "N of M rows"
   * instead of presenting the window size as the total (exploration 0340).
   */
  totalRowCount?: number | null
  /** More rows exist past the loaded window. */
  hasMoreRows?: boolean
  /** A window grow is in flight (footer shows a loading hint). */
  loadingMoreRows?: boolean
  /**
   * Called when scrolling nears the end of the loaded rows — wire to the
   * data hook's `fetchMoreRows` for infinite scroll.
   */
  onReachEnd?: () => void
  /** Extra footer annotation (e.g. "filtered within loaded rows"). */
  footerNotice?: string
}

export function GridSurface({
  fields,
  rows,
  sorts,
  presences,
  cellCommentCounts,
  cellLockReasons,
  rowHeight = DEFAULT_ROW_HEIGHT,
  readOnly,
  className,
  totalRowCount,
  hasMoreRows,
  loadingMoreRows,
  onReachEnd,
  footerNotice,
  onUpdateCell,
  onClearCells,
  onAddRow,
  onAddRowWithCells,
  onAddFieldWithCell,
  onDeleteRows,
  onMoveRow,
  onMoveField,
  onResizeField,
  onToggleSort,
  onFieldMenu,
  onAddField,
  onCreateOption,
  onUploadFile,
  onResolveFileUrl,
  onOpenRow,
  onUndo,
  onRedo,
  onFind,
  onCommentCell,
  onCellFocus,
  onCellBlur
}: GridSurfaceProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Spreadsheet-style ghost row/column: empty cells past the data that
  // create a row (or a new text field) when you type into them
  const hasGhostRow = Boolean(onAddRowWithCells) && !readOnly
  const hasGhostCol = Boolean(onAddFieldWithCell) && !readOnly
  const rowCount = rows.length + (hasGhostRow ? 1 : 0)
  const colCount = fields.length + (hasGhostCol ? 1 : 0)
  const [state, dispatch] = useReducer(gridReducer, undefined, () =>
    createGridState(rowCount, colCount)
  )
  /** Latest editor draft (commit reads this when the keymap closes an edit) */
  const draftRef = useRef<CellValue>(null)

  // Keep the state machine in sync with data dimensions
  useEffect(() => {
    if (state.rowCount !== rowCount || state.colCount !== colCount) {
      dispatch({ type: 'resize', rowCount, colCount })
    }
  }, [rowCount, colCount, state.rowCount, state.colCount])

  // Reclaim keyboard focus when an edit session ends. Runs as an effect so
  // the editor has already rendered closed (and GridCell's session guard is
  // set) before the editor input blurs — a synchronous focus() would fire
  // that blur first and re-commit the stale draft.
  const wasEditingRef = useRef(false)
  useEffect(() => {
    const isEditing = state.editing !== null
    if (wasEditingRef.current && !isEditing) {
      containerRef.current?.focus()
    }
    wasEditingRef.current = isEditing
  }, [state.editing])

  // Presence broadcast on cursor change
  const cursorKey = state.cursor ? `${state.cursor.row}:${state.cursor.col}` : null
  useEffect(() => {
    if (state.cursor) {
      const row = rows[state.cursor.row]
      const field = fields[state.cursor.col]
      if (row && field) onCellFocus?.(row.id, field.id)
    } else {
      onCellBlur?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorKey])

  // ─── Virtualization ────────────────────────────────────────────────────────

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10
  })

  // Columns virtualize only past the threshold — vertical scrolling mounts
  // every rendered column per overscan row, which is the measured fps killer
  // on wide tables (0340). Horizontal overscan of 3 matches the TanStack
  // column example; paddingStart accounts for the row gutter so item offsets
  // line up with the scroll element's coordinate space.
  const virtualizeColumns = colCount > COLUMN_VIRTUALIZE_MIN
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    enabled: virtualizeColumns,
    count: colCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => fields[i]?.width ?? GHOST_COL_WIDTH,
    paddingStart: GUTTER_WIDTH,
    overscan: 3
  })
  // Field widths live outside the virtualizer (resize/view overrides) — force
  // re-measure when they change so column offsets stay correct.
  useEffect(() => {
    if (virtualizeColumns) columnVirtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, virtualizeColumns])

  // Keep the focused cell scrolled into view (both axes)
  useEffect(() => {
    if (state.cursor) {
      rowVirtualizer.scrollToIndex(state.cursor.row)
      if (virtualizeColumns) columnVirtualizer.scrollToIndex(state.cursor.col)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorKey])

  const totalWidth = useMemo(
    () => GUTTER_WIDTH + fields.reduce((sum, f) => sum + f.width, 0),
    [fields]
  )

  // Rendered column window for rows: absolute field range plus flex spacers
  // standing in for the unrendered columns (keeps row layout, dnd, and
  // selection index math unchanged).
  const virtualCols = columnVirtualizer.getVirtualItems()
  const colWindow = useMemo<ColWindow | undefined>(() => {
    if (!virtualizeColumns || virtualCols.length === 0) return undefined
    const first = virtualCols[0]
    const last = virtualCols[virtualCols.length - 1]
    const totalColsEnd = columnVirtualizer.getTotalSize()
    return {
      start: first.index,
      end: last.index,
      padLeft: Math.max(0, first.start - GUTTER_WIDTH),
      padRight: Math.max(0, totalColsEnd - last.end)
    }
  }, [virtualizeColumns, virtualCols, columnVirtualizer])

  // ─── Mutation helpers ──────────────────────────────────────────────────────

  const cellAt = useCallback(
    (pos: GridPos): { row: GridRowData; field: GridField } | null => {
      const row = rows[pos.row]
      const field = fields[pos.col]
      return row && field ? { row, field } : null
    },
    [rows, fields]
  )

  const selectedRect = useCallback(() => {
    return selectionRect(state.selection, rowCount, colCount)
  }, [state.selection, rowCount, colCount])

  // Single source of truth for the per-cell lock — consulted by every write
  // path (edit session, paste, fill-down, cut/clear, file-drop) so a locked
  // cell can't be mutated by any of them.
  const isCellLocked = useCallback(
    (rowId: string, fieldId: string) => cellLockReasons?.has(`${rowId}:${fieldId}`) ?? false,
    [cellLockReasons]
  )

  const refsInRect = useCallback(
    (rect: { top: number; left: number; bottom: number; right: number }): CellRef[] => {
      const refs: CellRef[] = []
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          const cell = cellAt({ row: r, col: c })
          // refsInRect feeds onClearCells (cut + clear), both writes — omit locked cells.
          if (cell && !isCellLocked(cell.row.id, cell.field.id)) {
            refs.push({ rowId: cell.row.id, fieldId: cell.field.id })
          }
        }
      }
      return refs
    },
    [cellAt, isCellLocked]
  )

  // Drag-a-file-onto-a-cell → upload + write the FileRef directly
  const handleDropFile = useCallback(
    (rowIndex: number, colIndex: number, file: File) => {
      if (!onUploadFile) return
      const cell = cellAt({ row: rowIndex, col: colIndex })
      if (!cell || cell.field.type !== 'file') return
      if (isCellLocked(cell.row.id, cell.field.id)) return
      void onUploadFile(file).then((ref) => {
        if (ref) onUpdateCell?.(cell.row.id, cell.field.id, ref as unknown as CellValue)
      })
    },
    [onUploadFile, cellAt, onUpdateCell, isCellLocked]
  )

  /** Persist a value at a position — real cell, ghost row, or ghost column. */
  const commitValueAt = useCallback(
    (pos: GridPos, value: CellValue) => {
      const cell = cellAt(pos)
      if (cell) {
        onUpdateCell?.(cell.row.id, cell.field.id, value)
        return
      }
      if (value === null || value === '') return
      const inGhostRow = pos.row === rows.length
      const inGhostCol = pos.col === fields.length
      if (inGhostRow && !inGhostCol) {
        const field = fields[pos.col]
        if (field) onAddRowWithCells?.({ [field.id]: value })
      } else if (inGhostCol && !inGhostRow) {
        const row = rows[pos.row]
        if (row) onAddFieldWithCell?.(row.id, value)
      }
      // Ghost corner (new row AND new field at once) is a no-op
    },
    [cellAt, rows, fields, onUpdateCell, onAddRowWithCells, onAddFieldWithCell]
  )

  const commitDraft = useCallback(() => {
    if (!state.editing) return
    commitValueAt(state.editing.pos, draftRef.current)
  }, [state.editing, commitValueAt])

  // ─── Clipboard ─────────────────────────────────────────────────────────────

  const copySelection = useCallback(
    async (cut: boolean) => {
      const rect = selectedRect()
      if (!rect) return
      const block: (CellValue | undefined)[][] = []
      for (let r = rect.top; r <= rect.bottom; r++) {
        const rowValues: (CellValue | undefined)[] = []
        for (let c = rect.left; c <= rect.right; c++) {
          const cell = cellAt({ row: r, col: c })
          rowValues.push(cell ? cell.row.cells[cell.field.id] : undefined)
        }
        block.push(rowValues)
      }
      const copyFields = fields.slice(rect.left, rect.right + 1).map((f) => ({
        id: f.id,
        type: f.type,
        optionName: (id: string) => f.options?.find((o) => o.id === id)?.name
      }))
      try {
        await navigator.clipboard.writeText(serializeTsv(block, copyFields))
      } catch {
        // Clipboard may be unavailable (permissions); ignore
      }
      if (cut && !readOnly) {
        onClearCells?.(refsInRect(rect))
      }
    },
    [selectedRect, cellAt, fields, refsInRect, onClearCells, readOnly]
  )

  const pasteAtCursor = useCallback(async () => {
    if (readOnly || !state.cursor) return
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      return
    }
    if (!text) return
    const matrix = parseTsv(text)
    const origin = state.cursor

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const pos = { row: origin.row + r, col: origin.col + c }
        const cell = cellAt(pos)
        if (!cell) continue
        if (isCellLocked(cell.row.id, cell.field.id)) continue
        const pasteField: PasteField = {
          id: cell.field.id,
          type: cell.field.type,
          optionIdByName: (name) =>
            cell.field.options?.find((o) => o.name.toLowerCase() === name.toLowerCase())?.id
        }
        const result = coerceCellText(matrix[r][c], pasteField)
        let value = result.value

        // Inline-create unresolved select options when allowed
        if (result.unresolvedOptions && onCreateOption) {
          const created: string[] = []
          for (const name of result.unresolvedOptions) {
            const id = await onCreateOption(cell.field.id, name)
            if (id) created.push(id)
          }
          if (cell.field.type === 'multiSelect') {
            const existing = Array.isArray(value) ? value : []
            value = [...existing, ...created]
          } else if (cell.field.type === 'select' && created.length > 0) {
            value = created[0]
          }
        }

        if (!result.lossy || value !== null) {
          onUpdateCell?.(cell.row.id, cell.field.id, value)
        }
      }
    }
  }, [readOnly, state.cursor, cellAt, onCreateOption, onUpdateCell, isCellLocked])

  const fillDown = useCallback(() => {
    if (readOnly) return
    const rect = selectedRect()
    if (!rect || rect.bottom === rect.top) return
    for (let c = rect.left; c <= rect.right; c++) {
      const source = cellAt({ row: rect.top, col: c })
      if (!source) continue
      const value = source.row.cells[source.field.id] ?? null
      for (let r = rect.top + 1; r <= rect.bottom; r++) {
        const target = cellAt({ row: r, col: c })
        if (target && !isCellLocked(target.row.id, target.field.id)) {
          onUpdateCell?.(target.row.id, target.field.id, value)
        }
      }
    }
  }, [readOnly, selectedRect, cellAt, onUpdateCell, isCellLocked])

  // ─── Command execution ─────────────────────────────────────────────────────

  const runCommand = useCallback(
    (command: GridCommand): void => {
      switch (command.type) {
        case 'move':
          dispatch({ type: 'move', dir: command.dir, extend: command.extend, jump: command.jump })
          break
        case 'moveToEdge':
          dispatch({ type: 'moveToEdge', dir: command.dir, extend: command.extend })
          break
        case 'startEdit': {
          if (readOnly) break
          const target = state.cursor ? cellAt(state.cursor) : null
          // Structurally locked columns are never editable.
          if (target?.field.readonly) break
          // Per-cell lock (e.g. authorization) — never editable.
          if (target && isCellLocked(target.row.id, target.field.id)) break
          // Computed/auto fields have no editor
          if (
            target &&
            ['formula', 'rollup', 'created', 'createdBy', 'updated', 'updatedBy'].includes(
              target.field.type
            )
          ) {
            break
          }
          // Checkboxes toggle in place — no edit session (Sheets/Notion behavior)
          if (target && target.field.type === 'checkbox') {
            onUpdateCell?.(
              target.row.id,
              target.field.id,
              target.row.cells[target.field.id] !== true
            )
            break
          }
          dispatch({ type: 'startEdit', mode: command.mode, seed: command.seed })
          break
        }
        case 'commitEdit':
          commitDraft()
          dispatch({ type: 'commitEdit', move: command.move })
          break
        case 'cancelEdit':
          dispatch({ type: 'cancelEdit' })
          break
        case 'selectAll':
          dispatch({ type: 'selectAll' })
          break
        case 'escape':
          dispatch({ type: 'escape' })
          break
        case 'openPeek': {
          const row = state.cursor ? rows[state.cursor.row] : undefined
          if (row) onOpenRow?.(row.id)
          dispatch({ type: 'openPeek' })
          break
        }
        case 'closePeek':
          dispatch({ type: 'closePeek' })
          break
        case 'copy':
          void copySelection(command.cut ?? false)
          break
        case 'paste':
          void pasteAtCursor()
          break
        case 'clearCells': {
          if (readOnly) break
          const rect = selectedRect()
          if (rect) onClearCells?.(refsInRect(rect))
          break
        }
        case 'fillDown':
          fillDown()
          break
        case 'undo':
          onUndo?.()
          break
        case 'redo':
          onRedo?.()
          break
        case 'insertRowBelow': {
          const row = state.cursor ? rows[state.cursor.row] : undefined
          if (!readOnly) onAddRow?.(row?.id)
          break
        }
        case 'deleteRows': {
          if (readOnly) break
          if (state.selection.kind === 'rows') {
            const top = Math.min(state.selection.anchorRow, state.selection.focusRow)
            const bottom = Math.max(state.selection.anchorRow, state.selection.focusRow)
            const ids = rows.slice(top, bottom + 1).map((r) => r.id)
            onDeleteRows?.(ids)
          }
          break
        }
        case 'commentCell': {
          const cell = state.cursor ? cellAt(state.cursor) : null
          if (cell) {
            // Anchor the popover to the focused cell's element
            const el = containerRef.current?.querySelector<HTMLElement>(
              `[data-row-index="${state.cursor!.row}"][data-col-index="${state.cursor!.col}"]`
            )
            onCommentCell?.(cell.row.id, cell.field.id, el ?? null)
          }
          break
        }
        case 'find':
          onFind?.()
          break
      }
    },
    [
      readOnly,
      isCellLocked,
      rows,
      state.cursor,
      state.selection,
      commitDraft,
      copySelection,
      pasteAtCursor,
      fillDown,
      selectedRect,
      refsInRect,
      cellAt,
      onClearCells,
      onAddRow,
      onDeleteRows,
      onOpenRow,
      onUndo,
      onRedo,
      onFind,
      onCommentCell
    ]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const input: KeyInput = {
        key: e.key,
        shift: e.shiftKey,
        mod: e.metaKey || e.ctrlKey,
        alt: e.altKey,
        ctrl: e.ctrlKey
      }
      const command = interpretKeyDown(state, input)
      if (!command) return
      // While browsing, don't hijack typing that belongs to inputs rendered
      // inside toolbars/popovers — only handle keys when the event target is
      // the grid itself or a cell.
      const target = e.target as HTMLElement
      if (
        !state.editing &&
        target !== containerRef.current &&
        !target.closest('[data-grid-cell],[data-grid-body]')
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      runCommand(command)
    },
    [state, runCommand]
  )

  // ─── Mouse selection ───────────────────────────────────────────────────────

  const handleCellMouseDown = useCallback(
    (rowIndex: number, colIndex: number, shiftKey: boolean) => {
      if (state.editing) {
        commitDraft()
        dispatch({ type: 'commitEdit' })
      }
      dispatch({ type: 'focusCell', pos: { row: rowIndex, col: colIndex }, extend: shiftKey })
      containerRef.current?.focus()
    },
    [state.editing, commitDraft]
  )

  const handleCellMouseEnter = useCallback(
    (rowIndex: number, colIndex: number, buttons: number) => {
      if (buttons === 1 && !state.editing) {
        dispatch({ type: 'dragTo', pos: { row: rowIndex, col: colIndex } })
      }
    },
    [state.editing]
  )

  const handleCellDoubleClick = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (readOnly) return
      dispatch({ type: 'focusCell', pos: { row: rowIndex, col: colIndex } })
      const cell = cellAt({ row: rowIndex, col: colIndex })
      // Structurally locked columns are never editable.
      if (cell?.field.readonly) return
      // Per-cell lock (e.g. authorization) — never editable.
      if (cell && isCellLocked(cell.row.id, cell.field.id)) return
      // Checkboxes toggle in place — no edit session (Sheets/Notion behavior)
      if (cell?.field.type === 'checkbox') {
        onUpdateCell?.(cell.row.id, cell.field.id, cell.row.cells[cell.field.id] !== true)
        return
      }
      dispatch({ type: 'startEdit', mode: 'edit' })
    },
    [readOnly, isCellLocked, cellAt, onUpdateCell]
  )

  // ─── Editing callbacks (from GridCell) ─────────────────────────────────────

  const handleEditorCommit = useCallback(
    (value: CellValue) => {
      if (!state.editing) return
      commitValueAt(state.editing.pos, value)
      dispatch({ type: 'commitEdit' })
      containerRef.current?.focus()
    },
    [state.editing, commitValueAt]
  )

  const handleEditorCancel = useCallback(() => {
    dispatch({ type: 'cancelEdit' })
    containerRef.current?.focus()
  }, [])

  // Stable identity so memoized rows don't re-render on unrelated updates
  const handleSelectRow = useCallback((r: number, shiftKey: boolean) => {
    dispatch({ type: 'selectRow', row: r, extend: shiftKey })
  }, [])

  // ─── Row drag (gutter handles) ─────────────────────────────────────────────

  const rowSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Touch: long-press the gutter handle to drag
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  )
  const handleRowDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const targetIndex = rows.findIndex((r) => r.id === over.id)
      if (targetIndex >= 0) onMoveRow?.(String(active.id), targetIndex)
    },
    [rows, onMoveRow]
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalHeight = rowVirtualizer.getTotalSize()

  // Infinite scroll: grow the row window when scroll nears the end of the
  // loaded rows. Fires once per window size — a grow changes rows.length,
  // re-arming the sentinel.
  const lastReachEndAtRef = useRef(-1)
  const lastVirtualIndex = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : -1
  useEffect(() => {
    if (!onReachEnd || !hasMoreRows || loadingMoreRows) return
    if (rows.length === 0) return
    if (lastVirtualIndex < rows.length - REACH_END_THRESHOLD_ROWS) return
    if (lastReachEndAtRef.current === rows.length) return
    lastReachEndAtRef.current = rows.length
    onReachEnd()
  }, [onReachEnd, hasMoreRows, loadingMoreRows, lastVirtualIndex, rows.length])

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-rowcount={rows.length + 1}
      aria-colcount={fields.length}
      aria-multiselectable
      tabIndex={0}
      data-xnet-grid
      className={cn(
        'flex flex-col h-full outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100',
        className
      )}
      onKeyDown={handleKeyDown}
    >
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          <GridHeader
            fields={fields}
            gutterWidth={GUTTER_WIDTH}
            sorts={sorts}
            readOnly={readOnly}
            onToggleSort={onToggleSort}
            onMoveField={onMoveField}
            onResizeField={onResizeField}
            onFieldMenu={onFieldMenu}
            onAddField={onAddField}
            onSelectColumn={(col, shiftKey) =>
              dispatch({ type: 'selectColumn', col, extend: shiftKey })
            }
          />

          <DndContext
            sensors={rowSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleRowDragEnd}
          >
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div data-grid-body style={{ height: totalHeight, position: 'relative' }}>
                {rows.length === 0 && (
                  <div
                    data-testid="grid-empty-hint"
                    className="absolute inset-x-0 top-10 text-center text-xs text-gray-400 dark:text-gray-600 pointer-events-none"
                  >
                    {hasGhostRow
                      ? 'Click a cell above and start typing to add your first row'
                      : 'No rows'}
                  </div>
                )}
                {virtualRows.map((virtualRow) => {
                  const row =
                    rows[virtualRow.index] ??
                    (hasGhostRow && virtualRow.index === rows.length ? GHOST_ROW : null)
                  if (!row) return null
                  return (
                    <GridRow
                      key={row.id}
                      row={row}
                      rowIndex={virtualRow.index}
                      top={virtualRow.start}
                      height={rowHeight}
                      fields={fields}
                      state={state}
                      presences={presences}
                      cellCommentCounts={cellCommentCounts}
                      cellLockReasons={cellLockReasons}
                      readOnly={readOnly}
                      draftRef={draftRef}
                      onMouseDownCell={handleCellMouseDown}
                      onMouseEnterCell={handleCellMouseEnter}
                      onDoubleClickCell={handleCellDoubleClick}
                      onEditorCommit={handleEditorCommit}
                      onEditorCancel={handleEditorCancel}
                      onSelectRow={handleSelectRow}
                      onOpenRow={onOpenRow}
                      onCommentClick={onCommentCell ?? undefined}
                      onCreateOption={onCreateOption}
                      onUploadFile={onUploadFile}
                      onDropFile={handleDropFile}
                      onResolveFileUrl={onResolveFileUrl}
                      isGhostRow={row.id === '__ghost__'}
                      hasGhostCol={hasGhostCol}
                      colWindow={colWindow}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* Footer — shows the true total when the loaded window is smaller */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <span data-testid="grid-row-count">
          {totalRowCount != null && totalRowCount > rows.length
            ? `${rows.length.toLocaleString()} of ${totalRowCount.toLocaleString()} rows`
            : `${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}`}
          {loadingMoreRows && ' · loading more…'}
          {footerNotice && ` · ${footerNotice}`}
        </span>
        {!readOnly && onAddRow && (
          <button
            type="button"
            title="New row (Cmd/Ctrl+Shift+,)"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            onClick={() => onAddRow()}
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface GridRowProps {
  row: GridRowData
  rowIndex: number
  top: number
  height: number
  fields: GridField[]
  state: GridState
  presences?: CellPresence[]
  cellCommentCounts?: Map<string, number>
  cellLockReasons?: ReadonlyMap<string, string>
  readOnly?: boolean
  draftRef: React.MutableRefObject<CellValue>
  onMouseDownCell: (rowIndex: number, colIndex: number, shiftKey: boolean) => void
  onMouseEnterCell: (rowIndex: number, colIndex: number, buttons: number) => void
  onDoubleClickCell: (rowIndex: number, colIndex: number) => void
  onEditorCommit: (value: CellValue) => void
  onEditorCancel: () => void
  onSelectRow: (rowIndex: number, shiftKey: boolean) => void
  onOpenRow?: (rowId: string) => void
  onCommentClick?: (rowId: string, fieldId: string, anchorEl: HTMLElement | null) => void
  onCreateOption?: (fieldId: string, name: string) => Promise<string | null>
  onUploadFile?: (file: File) => Promise<import('@xnetjs/data').FileRef | null>
  onDropFile?: (rowIndex: number, colIndex: number, file: File) => void
  onResolveFileUrl?: (ref: import('@xnetjs/data').FileRef) => Promise<string>
  /** This is the ghost "type to add a row" row */
  isGhostRow?: boolean
  /** Append the ghost "type to add a field" column cell */
  hasGhostCol?: boolean
  /** When set, render only columns [start, end] with spacers on both sides */
  colWindow?: ColWindow
}

/**
 * Memoized: with stable row identity from the data hook (0340), a window
 * grow or an edit to one row re-renders only the rows whose props changed —
 * not every visible row. Interaction state (cursor/selection/editing) is a
 * single `state` prop, so interactions still repaint the visible window.
 */
const GridRow = React.memo(function GridRow({
  row,
  rowIndex,
  top,
  height,
  fields,
  state,
  presences,
  cellCommentCounts,
  cellLockReasons,
  readOnly,
  draftRef,
  onMouseDownCell,
  onMouseEnterCell,
  onDoubleClickCell,
  onEditorCommit,
  onEditorCancel,
  onSelectRow,
  onOpenRow,
  onCommentClick,
  onCreateOption,
  onUploadFile,
  onDropFile,
  onResolveFileUrl,
  isGhostRow,
  hasGhostCol,
  colWindow
}: GridRowProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: row.id,
    disabled: readOnly
  })

  const hostsEditing = state.editing?.pos.row === rowIndex

  const rowSelected =
    state.selection.kind === 'rows' &&
    rowIndex >= Math.min(state.selection.anchorRow, state.selection.focusRow) &&
    rowIndex <= Math.max(state.selection.anchorRow, state.selection.focusRow)

  return (
    <div
      ref={setNodeRef}
      role="row"
      aria-rowindex={rowIndex + 2}
      data-row-id={row.id}
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height,
        // The editing row paints above later (absolutely-positioned)
        // siblings so editor dropdowns aren't covered
        ...(hostsEditing ? { zIndex: 30 } : {}),
        ...(transform ? { transform: `translateY(${transform.y ?? 0}px)` } : {})
      }}
      className={cn(
        'flex group/row hover:bg-gray-50 dark:hover:bg-gray-800/40',
        rowSelected && 'bg-blue-50 dark:bg-blue-900/20',
        isDragging && 'opacity-60 z-20'
      )}
    >
      {/* Gutter: row number, drag handle, expand (ghost row: + affordance) */}
      <div
        style={{ width: GUTTER_WIDTH, minWidth: GUTTER_WIDTH }}
        className="flex items-center justify-between pl-1 pr-0.5 border-b border-r border-gray-100 dark:border-gray-800 text-[11px] text-gray-400"
        onClick={(e) => {
          if (!isGhostRow) onSelectRow(rowIndex, e.shiftKey)
        }}
      >
        {isGhostRow ? (
          <span className="mx-auto text-gray-300 dark:text-gray-600">＋</span>
        ) : (
          <>
            {!readOnly ? (
              <button
                type="button"
                aria-label="Drag row"
                data-testid={`row-handle-${row.id}`}
                className="opacity-0 group-hover/row:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                onClick={(e) => e.stopPropagation()}
                {...attributes}
                {...listeners}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span />
            )}
            <span className="tabular-nums">{rowIndex + 1}</span>
            <button
              type="button"
              aria-label="Open row"
              className="opacity-0 group-hover/row:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
              onClick={(e) => {
                e.stopPropagation()
                onOpenRow?.(row.id)
              }}
            >
              <Expand className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {colWindow && colWindow.padLeft > 0 && (
        <div style={{ width: colWindow.padLeft, minWidth: colWindow.padLeft }} aria-hidden />
      )}
      {(() => {
        const allCols = [...fields, ...(hasGhostCol ? [GHOST_FIELD] : [])]
        return colWindow ? allCols.slice(colWindow.start, colWindow.end + 1) : allCols
      })().map((field, i) => {
        const colIndex = colWindow ? colWindow.start + i : i
        const isGhostCell = isGhostRow || field.id === '__ghost__'
        const pos = { row: rowIndex, col: colIndex }
        const focused =
          state.cursor?.row === rowIndex && state.cursor?.col === colIndex && !state.editing
        const editing = state.editing?.pos.row === rowIndex && state.editing?.pos.col === colIndex
        const cellPresences = presences?.filter(
          (p) => p.rowId === row.id && p.columnId === field.id
        )
        if (isGhostCell && isGhostRow && field.id === '__ghost__') {
          // Ghost corner: visible but inert
          return (
            <div
              key="__corner__"
              style={{ width: GHOST_COL_WIDTH, minWidth: GHOST_COL_WIDTH }}
              className="border-b border-r border-dashed border-gray-100 dark:border-gray-800/60"
            />
          )
        }
        return (
          <GridCell
            key={field.id}
            rowId={row.id}
            field={field}
            value={row.cells[field.id]}
            rowIndex={rowIndex}
            colIndex={colIndex}
            focused={focused}
            selected={isSelected(state.selection, pos)}
            editing={Boolean(editing)}
            editSeed={editing ? state.editing?.seed : undefined}
            presences={cellPresences}
            commentCount={cellCommentCounts?.get(`${row.id}:${field.id}`) ?? 0}
            lockReason={cellLockReasons?.get(`${row.id}:${field.id}`)}
            width={field.width}
            readOnly={readOnly}
            onMouseDown={onMouseDownCell}
            onMouseEnter={onMouseEnterCell}
            onDoubleClick={onDoubleClickCell}
            onCommit={onEditorCommit}
            onDraftChange={(v) => {
              draftRef.current = v
            }}
            onCancel={onEditorCancel}
            onCreateOption={onCreateOption}
            onUploadFile={onUploadFile}
            onDropFile={onDropFile}
            onResolveFileUrl={onResolveFileUrl}
            onCommentClick={
              onCommentClick
                ? (rowId, fieldId, el) => onCommentClick(rowId, fieldId, el)
                : undefined
            }
          />
        )
      })}
      {colWindow && colWindow.padRight > 0 && (
        <div style={{ width: colWindow.padRight, minWidth: colWindow.padRight }} aria-hidden />
      )}
    </div>
  )
})
