/**
 * Grid state machine tests — selection, focus, editing lifecycle.
 */

import type { GridState } from './types'
import { describe, it, expect } from 'vitest'
import { createGridState, gridReducer, type GridAction } from './state'
import { isSelected, selectionRect } from './types'

function run(state: GridState, ...actions: GridAction[]): GridState {
  return actions.reduce(gridReducer, state)
}

const grid = (): GridState => createGridState(10, 5)

describe('gridReducer', () => {
  describe('focusCell', () => {
    it('focuses a cell and selects it', () => {
      const s = run(grid(), { type: 'focusCell', pos: { row: 2, col: 3 } })
      expect(s.cursor).toEqual({ row: 2, col: 3 })
      expect(s.selection).toEqual({
        kind: 'cells',
        range: { anchor: { row: 2, col: 3 }, focus: { row: 2, col: 3 } }
      })
    })

    it('clamps out-of-bounds positions', () => {
      const s = run(grid(), { type: 'focusCell', pos: { row: 99, col: -2 } })
      expect(s.cursor).toEqual({ row: 9, col: 0 })
    })

    it('ignores focus on an empty grid', () => {
      const s = run(createGridState(0, 5), { type: 'focusCell', pos: { row: 0, col: 0 } })
      expect(s.cursor).toBeNull()
    })

    it('shift+click extends from the anchor', () => {
      const s = run(
        grid(),
        { type: 'focusCell', pos: { row: 1, col: 1 } },
        { type: 'focusCell', pos: { row: 4, col: 3 }, extend: true }
      )
      expect(s.cursor).toEqual({ row: 1, col: 1 })
      expect(s.selection).toEqual({
        kind: 'cells',
        range: { anchor: { row: 1, col: 1 }, focus: { row: 4, col: 3 } }
      })
    })
  })

  describe('move', () => {
    it('moves in all four directions', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 5, col: 2 } })
      s = run(s, { type: 'move', dir: 'up' })
      expect(s.cursor).toEqual({ row: 4, col: 2 })
      s = run(s, { type: 'move', dir: 'down' })
      expect(s.cursor).toEqual({ row: 5, col: 2 })
      s = run(s, { type: 'move', dir: 'left' })
      expect(s.cursor).toEqual({ row: 5, col: 1 })
      s = run(s, { type: 'move', dir: 'right' })
      expect(s.cursor).toEqual({ row: 5, col: 2 })
    })

    it('stops at the edges', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 0, col: 0 } })
      s = run(s, { type: 'move', dir: 'up' }, { type: 'move', dir: 'left' })
      expect(s.cursor).toEqual({ row: 0, col: 0 })
    })

    it('jump moves to the data edge', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 5, col: 2 } })
      s = run(s, { type: 'move', dir: 'down', jump: true })
      expect(s.cursor).toEqual({ row: 9, col: 2 })
      s = run(s, { type: 'move', dir: 'left', jump: true })
      expect(s.cursor).toEqual({ row: 9, col: 0 })
    })

    it('focuses the first cell when no cursor', () => {
      const s = run(grid(), { type: 'move', dir: 'down' })
      expect(s.cursor).toEqual({ row: 0, col: 0 })
    })

    it('extend grows the range and keeps the cursor', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 2, col: 2 } })
      s = run(
        s,
        { type: 'move', dir: 'down', extend: true },
        { type: 'move', dir: 'right', extend: true }
      )
      expect(s.cursor).toEqual({ row: 2, col: 2 })
      expect(s.selection).toEqual({
        kind: 'cells',
        range: { anchor: { row: 2, col: 2 }, focus: { row: 3, col: 3 } }
      })
    })

    it('extend then plain move collapses, moving from the active cell', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 2, col: 2 } })
      s = run(s, { type: 'move', dir: 'down', extend: true }, { type: 'move', dir: 'down' })
      // Sheets semantics: the active cell stayed at the anchor (2,2), so a
      // plain Down lands on (3,2) and collapses the range.
      expect(s.cursor).toEqual({ row: 3, col: 2 })
      expect(s.selection).toEqual({
        kind: 'cells',
        range: { anchor: { row: 3, col: 2 }, focus: { row: 3, col: 2 } }
      })
    })

    it('extend+jump selects to the edge', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 2, col: 2 } })
      s = run(s, { type: 'move', dir: 'down', extend: true, jump: true })
      expect(s.selection).toEqual({
        kind: 'cells',
        range: { anchor: { row: 2, col: 2 }, focus: { row: 9, col: 2 } }
      })
    })
  })

  describe('moveToEdge (Home/End)', () => {
    it('moves to row start and end', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 3, col: 2 } })
      s = run(s, { type: 'moveToEdge', dir: 'home' })
      expect(s.cursor).toEqual({ row: 3, col: 0 })
      s = run(s, { type: 'moveToEdge', dir: 'end' })
      expect(s.cursor).toEqual({ row: 3, col: 4 })
    })

    it('extends to row end with shift', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 3, col: 1 } })
      s = run(s, { type: 'moveToEdge', dir: 'end', extend: true })
      expect(s.selection).toEqual({
        kind: 'cells',
        range: { anchor: { row: 3, col: 1 }, focus: { row: 3, col: 4 } }
      })
    })
  })

  describe('dragTo', () => {
    it('extends the selection from the anchor', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 1, col: 1 } })
      s = run(s, { type: 'dragTo', pos: { row: 3, col: 2 } })
      expect(s.selection).toEqual({
        kind: 'cells',
        range: { anchor: { row: 1, col: 1 }, focus: { row: 3, col: 2 } }
      })
    })
  })

  describe('row/column/all selection', () => {
    it('selects a row from the gutter', () => {
      const s = run(grid(), { type: 'selectRow', row: 4 })
      expect(s.selection).toEqual({ kind: 'rows', anchorRow: 4, focusRow: 4 })
      expect(isSelected(s.selection, { row: 4, col: 3 })).toBe(true)
      expect(isSelected(s.selection, { row: 5, col: 3 })).toBe(false)
    })

    it('shift+click extends a row selection span', () => {
      const s = run(
        grid(),
        { type: 'selectRow', row: 4 },
        { type: 'selectRow', row: 7, extend: true }
      )
      expect(s.selection).toEqual({ kind: 'rows', anchorRow: 4, focusRow: 7 })
    })

    it('selects a column from the header', () => {
      const s = run(grid(), { type: 'selectColumn', col: 2 })
      expect(s.selection).toEqual({ kind: 'columns', anchorCol: 2, focusCol: 2 })
      expect(isSelected(s.selection, { row: 9, col: 2 })).toBe(true)
    })

    it('selectAll selects everything', () => {
      const s = run(grid(), { type: 'selectAll' })
      expect(s.selection).toEqual({ kind: 'all' })
      expect(selectionRect(s.selection, 10, 5)).toEqual({ top: 0, left: 0, bottom: 9, right: 4 })
    })
  })

  describe('editing lifecycle', () => {
    it('startEdit enters edit mode at the cursor', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 1, col: 1 } })
      s = run(s, { type: 'startEdit', mode: 'edit' })
      expect(s.editing).toEqual({ pos: { row: 1, col: 1 }, mode: 'edit' })
    })

    it('startEdit with a seed enters replace mode', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 1, col: 1 } })
      s = run(s, { type: 'startEdit', mode: 'replace', seed: 'h' })
      expect(s.editing).toEqual({ pos: { row: 1, col: 1 }, mode: 'replace', seed: 'h' })
    })

    it('startEdit without a cursor is a no-op', () => {
      const s = run(grid(), { type: 'startEdit', mode: 'edit' })
      expect(s.editing).toBeNull()
    })

    it('commitEdit ends editing and moves', () => {
      let s = run(
        grid(),
        { type: 'focusCell', pos: { row: 1, col: 1 } },
        { type: 'startEdit', mode: 'edit' }
      )
      s = run(s, { type: 'commitEdit', move: 'down' })
      expect(s.editing).toBeNull()
      expect(s.cursor).toEqual({ row: 2, col: 1 })
    })

    it('commitEdit without move stays put', () => {
      let s = run(
        grid(),
        { type: 'focusCell', pos: { row: 1, col: 1 } },
        { type: 'startEdit', mode: 'edit' }
      )
      s = run(s, { type: 'commitEdit' })
      expect(s.editing).toBeNull()
      expect(s.cursor).toEqual({ row: 1, col: 1 })
    })

    it('cancelEdit ends editing without moving', () => {
      let s = run(
        grid(),
        { type: 'focusCell', pos: { row: 1, col: 1 } },
        { type: 'startEdit', mode: 'edit' }
      )
      s = run(s, { type: 'cancelEdit' })
      expect(s.editing).toBeNull()
      expect(s.cursor).toEqual({ row: 1, col: 1 })
    })
  })

  describe('escape laddering', () => {
    it('escape ends editing first', () => {
      let s = run(
        grid(),
        { type: 'focusCell', pos: { row: 1, col: 1 } },
        { type: 'startEdit', mode: 'edit' }
      )
      s = run(s, { type: 'escape' })
      expect(s.editing).toBeNull()
      expect(s.selection.kind).toBe('cells')
    })

    it('escape closes peek before collapsing selection', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 1, col: 1 } }, { type: 'openPeek' })
      expect(s.peekRow).toBe(1)
      s = run(s, { type: 'escape' })
      expect(s.peekRow).toBeNull()
    })

    it('escape collapses a range to the cursor', () => {
      let s = run(
        grid(),
        { type: 'focusCell', pos: { row: 1, col: 1 } },
        { type: 'move', dir: 'down', extend: true }
      )
      s = run(s, { type: 'escape' })
      expect(s.selection).toEqual({
        kind: 'cells',
        range: { anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } }
      })
    })
  })

  describe('peek', () => {
    it('opens at the cursor row and closes', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 3, col: 0 } }, { type: 'openPeek' })
      expect(s.peekRow).toBe(3)
      s = run(s, { type: 'closePeek' })
      expect(s.peekRow).toBeNull()
    })

    it('opens at an explicit row', () => {
      const s = run(grid(), { type: 'openPeek', row: 7 })
      expect(s.peekRow).toBe(7)
    })
  })

  describe('resize (data changes)', () => {
    it('clamps cursor and selection when rows shrink', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 9, col: 4 } })
      s = run(s, { type: 'resize', rowCount: 5, colCount: 3 })
      expect(s.cursor).toEqual({ row: 4, col: 2 })
      expect(selectionRect(s.selection, 5, 3)).toEqual({ top: 4, left: 2, bottom: 4, right: 2 })
    })

    it('ends editing when the edited cell disappears', () => {
      let s = run(
        grid(),
        { type: 'focusCell', pos: { row: 9, col: 1 } },
        { type: 'startEdit', mode: 'edit' }
      )
      s = run(s, { type: 'resize', rowCount: 5, colCount: 5 })
      expect(s.editing).toBeNull()
    })

    it('clears everything when the grid becomes empty', () => {
      let s = run(grid(), { type: 'focusCell', pos: { row: 1, col: 1 } }, { type: 'openPeek' })
      s = run(s, { type: 'resize', rowCount: 0, colCount: 5 })
      expect(s.cursor).toBeNull()
      expect(s.selection.kind).toBe('none')
      expect(s.peekRow).toBeNull()
    })

    it('clears a stale peek row', () => {
      let s = run(grid(), { type: 'openPeek', row: 9 })
      s = run(s, { type: 'resize', rowCount: 5, colCount: 5 })
      expect(s.peekRow).toBeNull()
    })
  })
})
