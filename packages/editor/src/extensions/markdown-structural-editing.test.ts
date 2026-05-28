import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HeadingWithSyntax, MarkdownStructuralEditing } from '../extensions'
import { runMarkdownStructuralBackspace } from './markdown-structural-editing'

function pressBackspace(editor: Editor): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
  let handled = false

  editor.view.someProp('handleKeyDown', (handler) => {
    if (handled) {
      return
    }

    handled = handler(editor.view, event)
  })

  return handled
}

function firstBlock(editor: Editor) {
  return editor.getJSON().content?.[0]
}

describe('MarkdownStructuralEditing', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ heading: false }),
        HeadingWithSyntax.configure({ levels: [1, 2, 3, 4, 5, 6] }),
        MarkdownStructuralEditing
      ],
      content: '<h3>Heading text</h3>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  it('demotes headings one markdown token at a time from the start of the block', () => {
    editor.commands.setTextSelection(1)

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Heading text' }]
    })

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Heading text' }]
    })

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Heading text' }]
    })
  })

  it('does not intercept Backspace inside heading text', () => {
    editor.commands.setTextSelection(4)

    expect(runMarkdownStructuralBackspace(editor)).toBe(false)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Heading text' }]
    })
  })

  it('does not intercept Backspace for range selections', () => {
    editor.commands.setTextSelection({ from: 1, to: 4 })

    expect(runMarkdownStructuralBackspace(editor)).toBe(false)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Heading text' }]
    })
  })
})
