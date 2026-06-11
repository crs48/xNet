/**
 * Grid keymap — translates normalized keyboard input into GridCommands.
 *
 * The full Sheets-grade map from exploration 0159:
 *
 * Browsing/focused:
 *   Arrows                 move cursor
 *   Shift+Arrows           grow range
 *   Cmd/Ctrl+Arrows        jump to data edge
 *   Cmd/Ctrl+Shift+Arrows  grow range to edge
 *   Home / End             row start / row end
 *   Tab / Shift+Tab        move right / left
 *   Enter / F2             start editing (caret in value)
 *   <printable char>       start editing, replacing the value
 *   Cmd/Ctrl+A             select all
 *   Escape                 collapse selection / close peek
 *   Space                  open row peek
 *   Delete / Backspace     clear selected cells
 *   Cmd/Ctrl+C / X / V     copy / cut / paste
 *   Cmd/Ctrl+D             fill down
 *   Cmd/Ctrl+Z             undo · Shift+Cmd/Ctrl+Z redo
 *   Cmd/Ctrl+F             quick find
 *   Cmd/Ctrl+Shift+M       comment on cell
 *   Cmd/Ctrl+Shift+,       insert row below
 *
 * Editing:
 *   Enter                  commit + move down (Shift+Enter commits up)
 *   Tab / Shift+Tab        commit + move right / left
 *   Cmd/Ctrl+Enter         commit in place
 *   Escape                 cancel (restore previous value)
 *   (other keys flow into the editor)
 */

import type { GridCommand, GridState, KeyInput } from './types'

/** True for single printable characters that should start a replace-edit. */
export function isPrintableKey(input: KeyInput): boolean {
  if (input.mod || input.ctrl || input.alt) return false
  return input.key.length === 1
}

/**
 * Interpret a key press given the current grid state.
 * Returns null when the grid should not handle the key (lets the
 * browser/editor have it).
 */
export function interpretKeyDown(state: GridState, input: KeyInput): GridCommand | null {
  return state.editing ? interpretEditingKey(input) : interpretBrowsingKey(state, input)
}

// ─── Editing mode ────────────────────────────────────────────────────────────

function interpretEditingKey(input: KeyInput): GridCommand | null {
  switch (input.key) {
    case 'Enter':
      if (input.mod) return { type: 'commitEdit', reason: 'enter' }
      if (input.alt || input.ctrl) return null // editor newline
      return { type: 'commitEdit', reason: 'enter', move: input.shift ? 'up' : 'down' }
    case 'Tab':
      return { type: 'commitEdit', reason: 'tab', move: input.shift ? 'left' : 'right' }
    case 'Escape':
      return { type: 'cancelEdit' }
    default:
      return null
  }
}

// ─── Browsing mode ───────────────────────────────────────────────────────────

const ARROW_DIRS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
} as const

function interpretBrowsingKey(state: GridState, input: KeyInput): GridCommand | null {
  const { key } = input

  // Arrows (with extend/jump modifiers)
  if (key in ARROW_DIRS) {
    const dir = ARROW_DIRS[key as keyof typeof ARROW_DIRS]
    return { type: 'move', dir, extend: input.shift, jump: input.mod }
  }

  switch (key) {
    case 'Home':
      return { type: 'moveToEdge', dir: 'home', extend: input.shift }
    case 'End':
      return { type: 'moveToEdge', dir: 'end', extend: input.shift }
    case 'Tab':
      return { type: 'move', dir: input.shift ? 'left' : 'right' }
    case 'Enter':
      return { type: 'startEdit', mode: 'edit' }
    case 'F2':
      return { type: 'startEdit', mode: 'edit' }
    case 'Escape':
      return { type: 'escape' }
    case ' ':
      // Plain space opens peek; shift+space could select row later
      if (!input.mod && !input.shift && !input.alt) return { type: 'openPeek' }
      return null
    case 'Delete':
    case 'Backspace':
      if (!input.mod) return { type: 'clearCells' }
      return null
  }

  // Mod combos
  if (input.mod) {
    switch (key.toLowerCase()) {
      case 'a':
        return { type: 'selectAll' }
      case 'c':
        return { type: 'copy' }
      case 'x':
        return { type: 'copy', cut: true }
      case 'v':
        return { type: 'paste' }
      case 'd':
        return { type: 'fillDown' }
      case 'z':
        return input.shift ? { type: 'redo' } : { type: 'undo' }
      case 'f':
        return { type: 'find' }
      case 'm':
        if (input.shift) return { type: 'commentCell' }
        return null
      case ',':
      case '<': // Shift+, reports '<' on most layouts
        if (input.shift) return { type: 'insertRowBelow' }
        return null
      default:
        return null
    }
  }

  // Printable character starts a replace-edit (type-to-replace)
  if (isPrintableKey(input) && state.cursor) {
    return { type: 'startEdit', mode: 'replace', seed: input.key }
  }

  return null
}
