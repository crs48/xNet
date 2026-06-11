/**
 * Keymap tests — every shortcut in the 0159 keyboard map.
 */

import type { GridState, KeyInput } from './types'
import { describe, it, expect } from 'vitest'
import { interpretKeyDown, isPrintableKey } from './keymap'
import { createGridState, gridReducer } from './state'

function key(k: string, mods: Partial<Omit<KeyInput, 'key'>> = {}): KeyInput {
  return { key: k, shift: false, mod: false, alt: false, ctrl: false, ...mods }
}

function focusedState(): GridState {
  return gridReducer(createGridState(10, 5), { type: 'focusCell', pos: { row: 2, col: 2 } })
}

function editingState(): GridState {
  return gridReducer(focusedState(), { type: 'startEdit', mode: 'edit' })
}

describe('interpretKeyDown — browsing', () => {
  const s = focusedState()

  it.each([
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right']
  ] as const)('%s moves %s', (k, dir) => {
    expect(interpretKeyDown(s, key(k))).toEqual({ type: 'move', dir, extend: false, jump: false })
  })

  it('Shift+Arrow extends', () => {
    expect(interpretKeyDown(s, key('ArrowDown', { shift: true }))).toEqual({
      type: 'move',
      dir: 'down',
      extend: true,
      jump: false
    })
  })

  it('Mod+Arrow jumps', () => {
    expect(interpretKeyDown(s, key('ArrowRight', { mod: true }))).toEqual({
      type: 'move',
      dir: 'right',
      extend: false,
      jump: true
    })
  })

  it('Mod+Shift+Arrow extends to edge', () => {
    expect(interpretKeyDown(s, key('ArrowDown', { mod: true, shift: true }))).toEqual({
      type: 'move',
      dir: 'down',
      extend: true,
      jump: true
    })
  })

  it('Home/End move to row edges', () => {
    expect(interpretKeyDown(s, key('Home'))).toEqual({
      type: 'moveToEdge',
      dir: 'home',
      extend: false
    })
    expect(interpretKeyDown(s, key('End', { shift: true }))).toEqual({
      type: 'moveToEdge',
      dir: 'end',
      extend: true
    })
  })

  it('Tab moves right, Shift+Tab moves left', () => {
    expect(interpretKeyDown(s, key('Tab'))).toEqual({ type: 'move', dir: 'right' })
    expect(interpretKeyDown(s, key('Tab', { shift: true }))).toEqual({ type: 'move', dir: 'left' })
  })

  it('Enter and F2 start editing', () => {
    expect(interpretKeyDown(s, key('Enter'))).toEqual({ type: 'startEdit', mode: 'edit' })
    expect(interpretKeyDown(s, key('F2'))).toEqual({ type: 'startEdit', mode: 'edit' })
  })

  it('a printable character starts a replace edit with seed', () => {
    expect(interpretKeyDown(s, key('h'))).toEqual({ type: 'startEdit', mode: 'replace', seed: 'h' })
    expect(interpretKeyDown(s, key('5'))).toEqual({ type: 'startEdit', mode: 'replace', seed: '5' })
  })

  it('printable chars without a cursor do nothing', () => {
    expect(interpretKeyDown(createGridState(10, 5), key('h'))).toBeNull()
  })

  it('Escape escapes', () => {
    expect(interpretKeyDown(s, key('Escape'))).toEqual({ type: 'escape' })
  })

  it('Space opens peek', () => {
    expect(interpretKeyDown(s, key(' '))).toEqual({ type: 'openPeek' })
  })

  it('Delete and Backspace clear cells', () => {
    expect(interpretKeyDown(s, key('Delete'))).toEqual({ type: 'clearCells' })
    expect(interpretKeyDown(s, key('Backspace'))).toEqual({ type: 'clearCells' })
  })

  it('clipboard / undo / structure shortcuts', () => {
    expect(interpretKeyDown(s, key('a', { mod: true }))).toEqual({ type: 'selectAll' })
    expect(interpretKeyDown(s, key('c', { mod: true }))).toEqual({ type: 'copy' })
    expect(interpretKeyDown(s, key('x', { mod: true }))).toEqual({ type: 'copy', cut: true })
    expect(interpretKeyDown(s, key('v', { mod: true }))).toEqual({ type: 'paste' })
    expect(interpretKeyDown(s, key('d', { mod: true }))).toEqual({ type: 'fillDown' })
    expect(interpretKeyDown(s, key('z', { mod: true }))).toEqual({ type: 'undo' })
    expect(interpretKeyDown(s, key('z', { mod: true, shift: true }))).toEqual({ type: 'redo' })
    expect(interpretKeyDown(s, key('f', { mod: true }))).toEqual({ type: 'find' })
    expect(interpretKeyDown(s, key('M', { mod: true, shift: true }))).toEqual({
      type: 'commentCell'
    })
    expect(interpretKeyDown(s, key('<', { mod: true, shift: true }))).toEqual({
      type: 'insertRowBelow'
    })
  })

  it('unhandled keys return null', () => {
    expect(interpretKeyDown(s, key('b', { mod: true }))).toBeNull()
    expect(interpretKeyDown(s, key('PageDown'))).toBeNull()
  })
})

describe('interpretKeyDown — editing', () => {
  const s = editingState()

  it('Enter commits and moves down', () => {
    expect(interpretKeyDown(s, key('Enter'))).toEqual({
      type: 'commitEdit',
      reason: 'enter',
      move: 'down'
    })
  })

  it('Shift+Enter commits and moves up', () => {
    expect(interpretKeyDown(s, key('Enter', { shift: true }))).toEqual({
      type: 'commitEdit',
      reason: 'enter',
      move: 'up'
    })
  })

  it('Mod+Enter commits in place', () => {
    expect(interpretKeyDown(s, key('Enter', { mod: true }))).toEqual({
      type: 'commitEdit',
      reason: 'enter'
    })
  })

  it('Alt+Enter is left to the editor (newline)', () => {
    expect(interpretKeyDown(s, key('Enter', { alt: true }))).toBeNull()
  })

  it('Tab commits and moves right; Shift+Tab left', () => {
    expect(interpretKeyDown(s, key('Tab'))).toEqual({
      type: 'commitEdit',
      reason: 'tab',
      move: 'right'
    })
    expect(interpretKeyDown(s, key('Tab', { shift: true }))).toEqual({
      type: 'commitEdit',
      reason: 'tab',
      move: 'left'
    })
  })

  it('Escape cancels', () => {
    expect(interpretKeyDown(s, key('Escape'))).toEqual({ type: 'cancelEdit' })
  })

  it('other keys flow into the editor', () => {
    expect(interpretKeyDown(s, key('h'))).toBeNull()
    expect(interpretKeyDown(s, key('ArrowLeft'))).toBeNull()
    expect(interpretKeyDown(s, key('Delete'))).toBeNull()
  })
})

describe('isPrintableKey', () => {
  it('accepts single characters without modifiers', () => {
    expect(isPrintableKey(key('a'))).toBe(true)
    expect(isPrintableKey(key('Z', { shift: true }))).toBe(true)
    expect(isPrintableKey(key('é'))).toBe(true)
  })

  it('rejects modified keys and named keys', () => {
    expect(isPrintableKey(key('a', { mod: true }))).toBe(false)
    expect(isPrintableKey(key('a', { ctrl: true }))).toBe(false)
    expect(isPrintableKey(key('a', { alt: true }))).toBe(false)
    expect(isPrintableKey(key('Enter'))).toBe(false)
    expect(isPrintableKey(key('ArrowUp'))).toBe(false)
  })
})
