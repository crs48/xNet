import type { Decoration } from '@tiptap/pm/view'
import { Editor, type Content } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createInlineMarksPlugin, inlineMarksPluginKey } from './inline-marks'

const LARGE_SELECTION_DOCUMENT_BLOCKS = 1000

function findTextStart(editor: Editor, text: string): number {
  let position: number | null = null

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || typeof node.text !== 'string') return true

    const index = node.text.indexOf(text)
    if (index === -1) return true

    position = pos + index
    return false
  })

  if (position === null) {
    throw new Error(`Could not find text "${text}"`)
  }

  return position
}

function pressKey(editor: Editor, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true })
  let handled = false

  editor.view.someProp('handleKeyDown', (handler) => {
    if (handled) {
      return
    }

    handled = handler(editor.view, event)
  })

  return handled
}

function textSegments(editor: Editor) {
  const firstBlock = editor.getJSON().content?.[0]
  return firstBlock?.content ?? []
}

function createLargeMarkedDocument(blocks = LARGE_SELECTION_DOCUMENT_BLOCKS): Content {
  return {
    type: 'doc',
    content: Array.from({ length: blocks }, (_, index) => ({
      type: 'paragraph',
      content: [
        { type: 'text', text: `Plain prefix ${index} ` },
        {
          type: 'text',
          text: `marked block ${index}`,
          marks: [{ type: 'bold' }]
        },
        { type: 'text', text: ` plain suffix ${index}` }
      ]
    }))
  }
}

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

    editor.registerPlugin(createInlineMarksPlugin())
  })

  afterEach(() => {
    editor.destroy()
    container.remove()
    vi.restoreAllMocks()
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

  it('does not traverse the full document for selection-only decoration updates', () => {
    editor.commands.setContent(createLargeMarkedDocument(), { emitUpdate: false })
    const markedTextStart = findTextStart(editor, 'marked block 999')
    const descendantsSpy = vi.spyOn(editor.state.doc, 'descendants')

    editor.commands.setTextSelection(markedTextStart + 3)
    editor.commands.setTextSelection(markedTextStart + 4)

    const decorations = inlineMarksPluginKey.getState(editor.state).find()
    expect(descendantsSpy).not.toHaveBeenCalled()
    expect(decorations.map((decoration: Decoration) => decoration.spec.key)).toEqual([
      `bold-open-${markedTextStart}`,
      `bold-close-${markedTextStart + 'marked block 999'.length}`
    ])
  })

  it('uses selection-relaxed syntax widgets so mark delimiters do not trap the caret', () => {
    editor.commands.setTextSelection(3)
    const decorationSet = inlineMarksPluginKey.getState(editor.state)
    const decorations = decorationSet.find()

    expect(decorations).toHaveLength(4)
    for (const decoration of decorations) {
      expect(decoration.spec.ignoreSelection).toBe(true)
      expect(decoration.spec.relaxedSide).toBe(true)
    }
  })

  it.each([
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['strike', 'strike'],
    ['code', 'code']
  ])('reveals %s syntax at inline mark boundaries', (markType, text) => {
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text, marks: [{ type: markType }] }]
          }
        ]
      },
      { emitUpdate: false }
    )
    const textStart = findTextStart(editor, text)
    const textEnd = textStart + text.length

    editor.commands.setTextSelection(textStart)
    expect(
      inlineMarksPluginKey
        .getState(editor.state)
        .find()
        .map((decoration: Decoration) => decoration.spec.key)
    ).toEqual([`${markType}-open-${textStart}`, `${markType}-close-${textEnd}`])

    editor.commands.setTextSelection(textEnd)
    expect(
      inlineMarksPluginKey
        .getState(editor.state)
        .find()
        .map((decoration: Decoration) => decoration.spec.key)
    ).toEqual([`${markType}-open-${textStart}`, `${markType}-close-${textEnd}`])
  })

  it('moves outside closing syntax so following text is not marked', () => {
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'bold',
                marks: [{ type: 'bold' }]
              }
            ]
          }
        ]
      },
      { emitUpdate: false }
    )

    const textEnd = findTextStart(editor, 'bold') + 'bold'.length
    editor.commands.setTextSelection(textEnd)

    expect(pressKey(editor, 'ArrowRight')).toBe(true)
    editor.commands.insertContent(' plain')

    expect(textSegments(editor)).toEqual([
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' plain' }
    ])
  })

  it('moves back inside closing syntax so following text keeps the mark', () => {
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'bold',
                marks: [{ type: 'bold' }]
              }
            ]
          }
        ]
      },
      { emitUpdate: false }
    )

    const textEnd = findTextStart(editor, 'bold') + 'bold'.length
    editor.commands.setTextSelection(textEnd)

    expect(pressKey(editor, 'ArrowRight')).toBe(true)
    expect(pressKey(editor, 'ArrowLeft')).toBe(true)
    editor.commands.insertContent('!')

    expect(textSegments(editor)).toEqual([
      { type: 'text', text: 'bold!', marks: [{ type: 'bold' }] }
    ])
  })

  it('moves outside opening syntax so inserted text before a mark is plain', () => {
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'bold',
                marks: [{ type: 'bold' }]
              }
            ]
          }
        ]
      },
      { emitUpdate: false }
    )

    const textStart = findTextStart(editor, 'bold')
    editor.commands.setTextSelection(textStart)

    expect(pressKey(editor, 'ArrowLeft')).toBe(true)
    editor.commands.insertContent('plain ')

    expect(textSegments(editor)).toEqual([
      { type: 'text', text: 'plain ' },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }
    ])
  })

  it.each([
    ['bold', 'Backspace'],
    ['strike', 'Delete'],
    ['italic', 'Delete'],
    ['code', 'Delete']
  ])('removes %s when deleting virtual %s delimiter syntax', (markType, key) => {
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'marked',
                marks: [{ type: markType }]
              }
            ]
          }
        ]
      },
      { emitUpdate: false }
    )

    const textStart = findTextStart(editor, 'marked')
    const position = key === 'Backspace' ? textStart : textStart + 'marked'.length
    editor.commands.setTextSelection(position)

    expect(pressKey(editor, key)).toBe(true)
    expect(textSegments(editor)).toEqual([{ type: 'text', text: 'marked' }])
  })

  it('does not intercept inline mark keys away from syntax boundaries', () => {
    const textStart = findTextStart(editor, 'hello')
    editor.commands.setTextSelection(textStart + 2)

    expect(pressKey(editor, 'ArrowRight')).toBe(false)
    expect(pressKey(editor, 'Backspace')).toBe(false)
  })
})
