/**
 * Grid state machine — a pure reducer over GridState.
 *
 * Owns selection, focus, and the editing lifecycle. Side effects
 * (persistence, clipboard, undo) live in the React layer; the reducer
 * only tracks *where* the user is and *what mode* they're in, so every
 * transition is unit-testable without DOM or store.
 */

import type { EditingState, GridPos, GridSelection, GridState, MoveDirection } from './types'

// ─── Initial state ───────────────────────────────────────────────────────────

export function createGridState(rowCount: number, colCount: number): GridState {
  return {
    rowCount,
    colCount,
    cursor: null,
    selection: { kind: 'none' },
    editing: null,
    peekRow: null
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type GridAction =
  /** Data dimensions changed (filter/sort/add/delete) — clamp everything */
  | { type: 'resize'; rowCount: number; colCount: number }
  | { type: 'focusCell'; pos: GridPos; extend?: boolean }
  | { type: 'blur' }
  | { type: 'move'; dir: MoveDirection; extend?: boolean; jump?: boolean }
  | { type: 'moveToEdge'; dir: 'home' | 'end'; extend?: boolean }
  | { type: 'dragTo'; pos: GridPos }
  | { type: 'selectRow'; row: number; extend?: boolean }
  | { type: 'selectColumn'; col: number; extend?: boolean }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'startEdit'; mode: 'edit' | 'replace'; seed?: string }
  | { type: 'commitEdit'; move?: MoveDirection }
  | { type: 'cancelEdit' }
  | { type: 'escape' }
  | { type: 'openPeek'; row?: number }
  | { type: 'closePeek' }

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case 'resize':
      return resize(state, action.rowCount, action.colCount)

    case 'focusCell': {
      const pos = clampPos(action.pos, state)
      if (!pos) return state
      if (action.extend && state.cursor) {
        // Shift+click extends from the existing anchor
        const anchor = currentAnchor(state) ?? state.cursor
        return {
          ...state,
          editing: null,
          selection: { kind: 'cells', range: { anchor, focus: pos } }
        }
      }
      return {
        ...state,
        cursor: pos,
        editing: null,
        selection: { kind: 'cells', range: { anchor: pos, focus: pos } }
      }
    }

    case 'blur':
      // Keep selection (so toolbar actions can apply to it) but end editing
      return state.editing ? { ...state, editing: null } : state

    case 'move': {
      if (state.rowCount === 0 || state.colCount === 0) return state
      const from = action.extend ? (currentFocus(state) ?? state.cursor) : state.cursor
      if (!from) {
        // No cursor yet: land on the first cell
        return gridReducer(state, { type: 'focusCell', pos: { row: 0, col: 0 } })
      }
      const next = step(from, action.dir, action.jump ?? false, state)
      if (action.extend) {
        const anchor = currentAnchor(state) ?? state.cursor ?? next
        return {
          ...state,
          editing: null,
          selection: { kind: 'cells', range: { anchor, focus: next } }
        }
      }
      return {
        ...state,
        cursor: next,
        editing: null,
        selection: { kind: 'cells', range: { anchor: next, focus: next } }
      }
    }

    case 'moveToEdge': {
      if (!state.cursor || state.rowCount === 0 || state.colCount === 0) return state
      const from = action.extend ? (currentFocus(state) ?? state.cursor) : state.cursor
      const next: GridPos =
        action.dir === 'home'
          ? { row: from.row, col: 0 }
          : { row: from.row, col: state.colCount - 1 }
      if (action.extend) {
        const anchor = currentAnchor(state) ?? state.cursor
        return {
          ...state,
          editing: null,
          selection: { kind: 'cells', range: { anchor, focus: next } }
        }
      }
      return {
        ...state,
        cursor: next,
        editing: null,
        selection: { kind: 'cells', range: { anchor: next, focus: next } }
      }
    }

    case 'dragTo': {
      const pos = clampPos(action.pos, state)
      if (!pos || !state.cursor) return state
      const anchor = currentAnchor(state) ?? state.cursor
      return { ...state, selection: { kind: 'cells', range: { anchor, focus: pos } } }
    }

    case 'selectRow': {
      const row = clampIndex(action.row, state.rowCount)
      if (row === null) return state
      if (action.extend && state.selection.kind === 'rows') {
        return { ...state, selection: { ...state.selection, focusRow: row }, editing: null }
      }
      return {
        ...state,
        cursor: { row, col: 0 },
        editing: null,
        selection: { kind: 'rows', anchorRow: row, focusRow: row }
      }
    }

    case 'selectColumn': {
      const col = clampIndex(action.col, state.colCount)
      if (col === null) return state
      if (action.extend && state.selection.kind === 'columns') {
        return { ...state, selection: { ...state.selection, focusCol: col }, editing: null }
      }
      return {
        ...state,
        cursor: { row: 0, col },
        editing: null,
        selection: { kind: 'columns', anchorCol: col, focusCol: col }
      }
    }

    case 'selectAll':
      if (state.rowCount === 0 || state.colCount === 0) return state
      return { ...state, selection: { kind: 'all' }, editing: null }

    case 'clearSelection':
      return { ...state, selection: { kind: 'none' }, cursor: null, editing: null }

    case 'startEdit': {
      if (!state.cursor) return state
      const editing: EditingState = {
        pos: state.cursor,
        mode: action.mode,
        ...(action.seed !== undefined ? { seed: action.seed } : {})
      }
      return {
        ...state,
        editing,
        selection: { kind: 'cells', range: { anchor: state.cursor, focus: state.cursor } }
      }
    }

    case 'commitEdit': {
      const base = { ...state, editing: null }
      if (action.move && state.cursor) {
        return gridReducer(base, { type: 'move', dir: action.move })
      }
      return base
    }

    case 'cancelEdit':
      return state.editing ? { ...state, editing: null } : state

    case 'escape':
      if (state.editing) return { ...state, editing: null }
      if (state.peekRow !== null) return { ...state, peekRow: null }
      if (state.selection.kind !== 'none') {
        // Collapse to the cursor cell
        if (state.cursor) {
          return {
            ...state,
            selection: { kind: 'cells', range: { anchor: state.cursor, focus: state.cursor } }
          }
        }
        return { ...state, selection: { kind: 'none' } }
      }
      return state

    case 'openPeek': {
      const row = action.row ?? state.cursor?.row
      if (row === undefined || row < 0 || row >= state.rowCount) return state
      return { ...state, peekRow: row, editing: null }
    }

    case 'closePeek':
      return state.peekRow === null ? state : { ...state, peekRow: null }
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

function resize(state: GridState, rowCount: number, colCount: number): GridState {
  const next: GridState = { ...state, rowCount, colCount }

  if (rowCount === 0 || colCount === 0) {
    return { ...next, cursor: null, selection: { kind: 'none' }, editing: null, peekRow: null }
  }

  if (next.cursor) {
    next.cursor = {
      row: Math.min(next.cursor.row, rowCount - 1),
      col: Math.min(next.cursor.col, colCount - 1)
    }
  }
  if (next.editing) {
    const pos = next.editing.pos
    if (pos.row >= rowCount || pos.col >= colCount) next.editing = null
  }
  if (next.peekRow !== null && next.peekRow >= rowCount) {
    next.peekRow = null
  }
  next.selection = clampSelection(next.selection, rowCount, colCount)
  return next
}

function clampSelection(
  selection: GridSelection,
  rowCount: number,
  colCount: number
): GridSelection {
  const cr = (r: number): number => Math.min(Math.max(r, 0), rowCount - 1)
  const cc = (c: number): number => Math.min(Math.max(c, 0), colCount - 1)
  switch (selection.kind) {
    case 'none':
    case 'all':
      return selection
    case 'cells':
      return {
        kind: 'cells',
        range: {
          anchor: { row: cr(selection.range.anchor.row), col: cc(selection.range.anchor.col) },
          focus: { row: cr(selection.range.focus.row), col: cc(selection.range.focus.col) }
        }
      }
    case 'rows':
      return { kind: 'rows', anchorRow: cr(selection.anchorRow), focusRow: cr(selection.focusRow) }
    case 'columns':
      return {
        kind: 'columns',
        anchorCol: cc(selection.anchorCol),
        focusCol: cc(selection.focusCol)
      }
  }
}

function clampPos(pos: GridPos, state: GridState): GridPos | null {
  if (state.rowCount === 0 || state.colCount === 0) return null
  return {
    row: Math.min(Math.max(pos.row, 0), state.rowCount - 1),
    col: Math.min(Math.max(pos.col, 0), state.colCount - 1)
  }
}

function clampIndex(index: number, count: number): number | null {
  if (count === 0) return null
  return Math.min(Math.max(index, 0), count - 1)
}

function step(from: GridPos, dir: MoveDirection, jump: boolean, state: GridState): GridPos {
  const lastRow = state.rowCount - 1
  const lastCol = state.colCount - 1
  switch (dir) {
    case 'up':
      return { row: jump ? 0 : Math.max(from.row - 1, 0), col: from.col }
    case 'down':
      return { row: jump ? lastRow : Math.min(from.row + 1, lastRow), col: from.col }
    case 'left':
      return { row: from.row, col: jump ? 0 : Math.max(from.col - 1, 0) }
    case 'right':
      return { row: from.row, col: jump ? lastCol : Math.min(from.col + 1, lastCol) }
  }
}

/** The anchor of the current cells-selection, if any. */
function currentAnchor(state: GridState): GridPos | null {
  return state.selection.kind === 'cells' ? state.selection.range.anchor : null
}

/** The focus corner of the current cells-selection, if any. */
function currentFocus(state: GridState): GridPos | null {
  return state.selection.kind === 'cells' ? state.selection.range.focus : null
}
