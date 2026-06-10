/**
 * Grid engine types — pure data model for the V2 database grid.
 *
 * The grid state machine is deliberately framework-free: positions are
 * row/column indexes into the *currently rendered* (filtered/sorted) data,
 * and the React layer maps indexes back to row/field IDs at the edges.
 */

// ─── Positions and ranges ────────────────────────────────────────────────────

export interface GridPos {
  /** Row index in the rendered row list */
  row: number
  /** Column index in the rendered field list */
  col: number
}

/**
 * A rectangular range. `anchor` is where the selection started; `focus`
 * is the active corner that moves with Shift+arrows / drag.
 */
export interface GridRange {
  anchor: GridPos
  focus: GridPos
}

/** Normalized bounds of a range (top-left / bottom-right, inclusive). */
export interface GridRect {
  top: number
  left: number
  bottom: number
  right: number
}

// ─── Selection ───────────────────────────────────────────────────────────────

export type GridSelection =
  | { kind: 'none' }
  /** One or more cells (single cell when anchor === focus) */
  | { kind: 'cells'; range: GridRange }
  /** Whole-row selection via the gutter (inclusive span) */
  | { kind: 'rows'; anchorRow: number; focusRow: number }
  /** Whole-column selection via the header */
  | { kind: 'columns'; anchorCol: number; focusCol: number }
  /** Everything (Cmd/Ctrl+A) */
  | { kind: 'all' }

// ─── Editing ─────────────────────────────────────────────────────────────────

/** Why an edit session ended (mirrors EDITOR_CONTRACT commit reasons). */
export type CommitReason = 'enter' | 'tab' | 'blur' | 'picker-select' | 'programmatic'

export interface EditingState {
  pos: GridPos
  /**
   * 'replace': started by typing a printable character — the editor starts
   *   from the seed text, discarding the existing value.
   * 'edit': started with Enter/F2/double-click — caret in existing value.
   */
  mode: 'replace' | 'edit'
  /** Seed character(s) for replace mode */
  seed?: string
}

// ─── State ───────────────────────────────────────────────────────────────────

export interface GridState {
  /** Rendered row count (after filter/sort) */
  rowCount: number
  /** Rendered column count (visible fields) */
  colCount: number
  /** The focused cell (null when the grid is not focused) */
  cursor: GridPos | null
  selection: GridSelection
  editing: EditingState | null
  /** Row peek panel (row index) */
  peekRow: number | null
}

// ─── Commands ────────────────────────────────────────────────────────────────

export type MoveDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Commands the keymap can produce. State commands are handled by the
 * reducer; effect commands bubble to the React layer (clipboard, undo,
 * mutations, comments) which owns the side effects.
 */
export type GridCommand =
  // State commands
  | { type: 'move'; dir: MoveDirection; extend?: boolean; jump?: boolean }
  | { type: 'moveToEdge'; dir: 'home' | 'end'; extend?: boolean }
  | { type: 'startEdit'; mode: 'edit' | 'replace'; seed?: string }
  | { type: 'cancelEdit' }
  | { type: 'selectAll' }
  | { type: 'escape' }
  | { type: 'openPeek' }
  | { type: 'closePeek' }
  // Commit is both: reducer closes the editor, React persists the draft
  | { type: 'commitEdit'; reason: CommitReason; move?: MoveDirection }
  // Effect commands (React layer)
  | { type: 'copy'; cut?: boolean }
  | { type: 'paste' }
  | { type: 'clearCells' }
  | { type: 'fillDown' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'insertRowBelow' }
  | { type: 'deleteRows' }
  | { type: 'commentCell' }
  | { type: 'find' }

/** Normalized keyboard input, independent of React/DOM event types. */
export interface KeyInput {
  key: string
  shift: boolean
  /** Cmd on macOS, Ctrl elsewhere */
  mod: boolean
  alt: boolean
  /** True only for ctrlKey (used to distinguish mac Ctrl combos) */
  ctrl: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize a range to inclusive rect bounds. */
export function rangeToRect(range: GridRange): GridRect {
  return {
    top: Math.min(range.anchor.row, range.focus.row),
    left: Math.min(range.anchor.col, range.focus.col),
    bottom: Math.max(range.anchor.row, range.focus.row),
    right: Math.max(range.anchor.col, range.focus.col)
  }
}

/** Whether a position is inside a selection. */
export function isSelected(selection: GridSelection, pos: GridPos): boolean {
  switch (selection.kind) {
    case 'none':
      return false
    case 'all':
      return true
    case 'cells': {
      const rect = rangeToRect(selection.range)
      return (
        pos.row >= rect.top &&
        pos.row <= rect.bottom &&
        pos.col >= rect.left &&
        pos.col <= rect.right
      )
    }
    case 'rows': {
      const top = Math.min(selection.anchorRow, selection.focusRow)
      const bottom = Math.max(selection.anchorRow, selection.focusRow)
      return pos.row >= top && pos.row <= bottom
    }
    case 'columns': {
      const left = Math.min(selection.anchorCol, selection.focusCol)
      const right = Math.max(selection.anchorCol, selection.focusCol)
      return pos.col >= left && pos.col <= right
    }
  }
}

/**
 * The effective rect a selection covers, given grid dimensions.
 * Returns null for 'none' or an empty grid.
 */
export function selectionRect(
  selection: GridSelection,
  rowCount: number,
  colCount: number
): GridRect | null {
  if (rowCount === 0 || colCount === 0) return null
  switch (selection.kind) {
    case 'none':
      return null
    case 'cells':
      return rangeToRect(selection.range)
    case 'rows':
      return {
        top: Math.min(selection.anchorRow, selection.focusRow),
        bottom: Math.max(selection.anchorRow, selection.focusRow),
        left: 0,
        right: colCount - 1
      }
    case 'columns':
      return {
        top: 0,
        bottom: rowCount - 1,
        left: Math.min(selection.anchorCol, selection.focusCol),
        right: Math.max(selection.anchorCol, selection.focusCol)
      }
    case 'all':
      return { top: 0, left: 0, bottom: rowCount - 1, right: colCount - 1 }
  }
}
