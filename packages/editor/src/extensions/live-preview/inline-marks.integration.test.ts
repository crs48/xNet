import type { Decoration } from '@tiptap/pm/view'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createInlineMarksPlugin, inlineMarksPluginKey } from './inline-marks'

describe('inline marks live preview integration', () => {
  let container: HTMLElement
  let editor: Editor

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new Editor({
      element: container,
      extensions: [StarterKit],
      content: '<p><strong><em>hello</em></strong> world</p>'
    })

    editor.registerPlugin(createInlineMarksPlugin({ marks: ['bold', 'italic'] }))
  })

  afterEach(() => {
    editor.destroy()
    container.remove()
  })

  it('keeps stable decoration count for nested marks', () => {
    editor.commands.setTextSelection(3)
    const decorationSet = inlineMarksPluginKey.getState(editor.state)
    const decorations = decorationSet.find()

    expect(decorations).toHaveLength(4)
  })

  it('clears decorations on range selection', () => {
    editor.commands.setTextSelection({ from: 2, to: 5 })
    const decorationSet = inlineMarksPluginKey.getState(editor.state)
    expect(decorationSet.find()).toHaveLength(0)
  })

  it('remains deterministic during rapid cursor movement', () => {
    editor.commands.setTextSelection(3)
    editor.commands.setTextSelection(4)
    editor.commands.setTextSelection(5)
    editor.commands.setTextSelection(4)

    const decorationSet = inlineMarksPluginKey.getState(editor.state)
    const decorations = decorationSet.find()

    expect(decorations).toHaveLength(4)
    expect(new Set(decorations.map((decoration: Decoration) => decoration.spec.key)).size).toBe(4)
  })
})
