import { describe, expect, it } from 'vitest'
import { resolvePageEditorFocusPosition } from './page-editor-focus'

describe('resolvePageEditorFocusPosition', () => {
  it('focuses the first block when the click is above the editor body', () => {
    expect(resolvePageEditorFocusPosition(80, { top: 120, bottom: 720 })).toBe('start')
  })

  it('focuses the first block inside the top focus zone', () => {
    expect(resolvePageEditorFocusPosition(170, { top: 120, bottom: 720 })).toBe('start')
  })

  it('focuses the end when clicking lower blank page space', () => {
    expect(resolvePageEditorFocusPosition(320, { top: 120, bottom: 720 })).toBe('end')
  })

  it('falls back to the end when editor geometry is unavailable', () => {
    expect(resolvePageEditorFocusPosition(80, null)).toBe('end')
  })
})
