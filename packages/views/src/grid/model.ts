/**
 * Grid surface data model — the prop shapes the React grid consumes.
 *
 * The surface is deliberately store-agnostic: the app layer (or the
 * useGridDatabase hook) maps Field/View/Row nodes into these shapes and
 * provides mutation callbacks. This keeps the grid component testable
 * with plain fixtures.
 */

import type { CellValue, FieldType, FileRef, SortConfig } from '@xnetjs/data'

export interface GridFieldOption {
  id: string
  name: string
  color?: string
}

export interface GridField {
  id: string
  name: string
  type: FieldType
  config: Record<string, unknown>
  /** Effective width (view override or field default) */
  width: number
  isTitle?: boolean
  /** Select/multiSelect options (resolved from SelectOption nodes) */
  options?: GridFieldOption[]
  /**
   * Structurally locked column: the grid must not offer rename / retype /
   * delete (cell values stay editable). Set for schema-defined ("core")
   * columns when a typed schema is rendered in the universal grid; user-added
   * extension columns are never locked. See `buildEffectiveSchema`.
   */
  readonly?: boolean
  /**
   * Optional human explanation of why this column's cells are read-only, shown
   * on hover (and, in edit mode, alongside a small lock glyph). Purely
   * informational and opt-in: callers that leave it unset keep the prior
   * behavior (no tooltip, no glyph). Used by the dev tools to make editability
   * legible — e.g. "System field", "json fields aren't editable here".
   */
  readonlyReason?: string
}

export interface GridRowData {
  id: string
  cells: Record<string, CellValue>
}

export interface CellRef {
  rowId: string
  fieldId: string
}

export interface GridCallbacks {
  /** Persist a committed cell edit */
  onUpdateCell?: (rowId: string, fieldId: string, value: CellValue) => void
  /** Clear a set of cells (Delete/Backspace, cut) */
  onClearCells?: (cells: CellRef[]) => void
  /** Add a row at the end (or after a specific row) */
  onAddRow?: (afterRowId?: string) => void
  /** Typing in the ghost row: create a row with this initial cell */
  onAddRowWithCells?: (cells: Record<string, CellValue>) => void
  /** Typing in the ghost column: create a text field and set this row's cell */
  onAddFieldWithCell?: (rowId: string, value: CellValue) => void
  /** Delete whole rows */
  onDeleteRows?: (rowIds: string[]) => void
  /** Reorder a row to sit at targetIndex in the current row list */
  onMoveRow?: (rowId: string, targetIndex: number) => void
  /** Reorder a field to sit at targetIndex in the visible field list */
  onMoveField?: (fieldId: string, targetIndex: number) => void
  /** Persist a column resize */
  onResizeField?: (fieldId: string, width: number) => void
  /** Toggle sorting on a field (header click) */
  onToggleSort?: (fieldId: string) => void
  /** Open the field menu (rename/type/hide/delete UI owned by the app) */
  onFieldMenu?: (fieldId: string, anchorEl: HTMLElement) => void
  /** Add a new field (the + header button) */
  onAddField?: (anchorEl: HTMLElement) => void
  /** Create a select option inline (typeahead create). Returns the option ID. */
  onCreateOption?: (fieldId: string, name: string) => Promise<string | null>
  /** Upload a file for a file cell; returns the stored FileRef */
  onUploadFile?: (file: File) => Promise<FileRef | null>
  /** Resolve a FileRef CID to a displayable URL */
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
  /** Resolve a ref's small preview, preferred over the full file (0385 W4) */
  onResolveThumbUrl?: (ref: FileRef) => Promise<string | null>
  /** Open row peek */
  onOpenRow?: (rowId: string) => void
  /** Undo/redo (wired to useUndoScope by the app layer) */
  onUndo?: () => void
  onRedo?: () => void
  /** Quick find (Cmd/Ctrl+F) */
  onFind?: () => void
  /** Comment on a cell (badge click, context menu, shortcut) */
  onCommentCell?: (rowId: string, fieldId: string, anchorEl: HTMLElement | null) => void
  /** Presence broadcast */
  onCellFocus?: (rowId: string, fieldId: string) => void
  onCellBlur?: () => void
}

export interface GridSortState {
  sorts: SortConfig[]
}
