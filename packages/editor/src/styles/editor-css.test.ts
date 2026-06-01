import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), 'editor.css')
const css = readFileSync(cssPath, 'utf8')

describe('editor stylesheet accessibility contract', () => {
  it('defines explicit light and dark caret and selection tokens', () => {
    expect(css).toContain('--editor-caret: 37 99 235;')
    expect(css).toContain('--editor-selection-background: 191 219 254;')
    expect(css).toContain('--editor-selection-foreground: 24 24 27;')
    expect(css).toContain('--editor-caret: 96 165 250;')
    expect(css).toContain('--editor-selection-background: 30 64 175;')
    expect(css).toContain('--editor-selection-foreground: 250 250 250;')
  })

  it('applies caret, text selection, and selected-node contrast rules to ProseMirror', () => {
    expect(css).toContain('caret-color: rgb(var(--editor-caret));')
    expect(css).toContain('background: rgb(var(--editor-selection-background));')
    expect(css).toContain('color: rgb(var(--editor-selection-foreground));')
    expect(css).toContain('outline: 2px solid rgb(var(--editor-caret));')
  })
})
