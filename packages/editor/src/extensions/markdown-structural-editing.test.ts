import { Editor, type Content } from '@tiptap/core'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BlockquoteWithSyntax,
  CodeBlockWithSyntax,
  HeadingWithSyntax,
  MARKDOWN_TOKEN_CONTRACTS,
  MARKDOWN_TOKEN_TEST_MATRIX,
  MarkdownStructuralEditing,
  PageTaskItemExtension,
  getMarkdownTokenContract
} from '../extensions'
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

function createMarkdownEditor(content: Content = '<p></p>'): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false }),
      TaskList,
      PageTaskItemExtension,
      HeadingWithSyntax.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      BlockquoteWithSyntax,
      CodeBlockWithSyntax,
      MarkdownStructuralEditing
    ],
    content
  })
}

function typeTextWithInputRules(editor: Editor, text: string): boolean {
  const { from, to } = editor.state.selection
  let handled = false

  editor.view.someProp('handleTextInput', (handler) => {
    if (handled) {
      return
    }

    handled = handler(editor.view, from, to, text) === true
  })

  if (!handled) {
    editor.commands.insertContent(text)
  }

  return handled
}

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

describe('Markdown token contract', () => {
  it('keeps structural token contracts connected to the test matrix', () => {
    const testIds = new Set(MARKDOWN_TOKEN_TEST_MATRIX.map((testCase) => testCase.id))

    for (const contract of MARKDOWN_TOKEN_CONTRACTS) {
      expect(contract.syntax.length).toBeGreaterThan(0)
      expect(contract.nodeNames.length).toBeGreaterThan(0)
      expect(contract.testIds.every((testId) => testIds.has(testId))).toBe(true)
    }

    expect(getMarkdownTokenContract('heading')).toMatchObject({
      revealPolicy: 'virtualPrefix',
      behaviors: expect.arrayContaining(['backspaceStep', 'undoableStep', 'compositionSafe'])
    })
  })
})

describe('MarkdownStructuralEditing input rules', () => {
  let editor: Editor

  afterEach(() => {
    editor.destroy()
  })

  it.each([
    ['# ', 1],
    ['## ', 2],
    ['### ', 3]
  ])('creates heading level %s from typed Markdown', (markdown, level) => {
    editor = createMarkdownEditor()
    editor.commands.setTextSelection(1)

    expect(typeTextWithInputRules(editor, markdown)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level }
    })
  })

  it('creates blockquotes from the typed > token', () => {
    editor = createMarkdownEditor()
    editor.commands.setTextSelection(1)

    expect(typeTextWithInputRules(editor, '> ')).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'blockquote',
      content: [{ type: 'paragraph' }]
    })
  })

  it.each([
    ['- ', 'bulletList'],
    ['1. ', 'orderedList']
  ])('creates %s list blocks from typed Markdown', (markdown, type) => {
    editor = createMarkdownEditor()
    editor.commands.setTextSelection(1)

    expect(typeTextWithInputRules(editor, markdown)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type,
      content: [{ type: 'listItem' }]
    })
  })

  it('creates task lists from typed Markdown', () => {
    editor = createMarkdownEditor()
    editor.commands.setTextSelection(1)

    expect(typeTextWithInputRules(editor, '- [ ] ')).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'taskList',
      content: [{ type: 'taskItem', attrs: { checked: false } }]
    })
  })

  it('creates code blocks from typed code fences with language metadata', () => {
    editor = createMarkdownEditor()
    editor.commands.setTextSelection(1)

    expect(typeTextWithInputRules(editor, '```ts ')).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'ts' }
    })
  })
})

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

  it('lets composition own Backspace without normalizing structural tokens', () => {
    Object.defineProperty(editor.view, 'composing', {
      configurable: true,
      value: true
    })

    editor.commands.setTextSelection(1)

    expect(runMarkdownStructuralBackspace(editor)).toBe(false)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Heading text' }]
    })
  })

  it('groups each heading token Backspace as one undoable history step', () => {
    editor.commands.setTextSelection(1)

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 2 }
    })

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 1 }
    })

    expect(editor.commands.undo()).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 2 }
    })

    expect(editor.commands.undo()).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 3 }
    })

    expect(editor.commands.redo()).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 2 }
    })
  })
})

describe('MarkdownStructuralEditing list Backspace', () => {
  let editor: Editor

  afterEach(() => {
    editor.destroy()
  })

  it('exits a top-level bullet list item from the start of its first text block', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, MarkdownStructuralEditing],
      content: '<ul><li><p>Bullet text</p></li></ul>'
    })

    editor.commands.setTextSelection(findTextStart(editor, 'Bullet text'))

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Bullet text' }]
    })
  })

  it('exits a top-level ordered list item from the start of its first text block', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, MarkdownStructuralEditing],
      content: '<ol><li><p>Ordered text</p></li></ol>'
    })

    editor.commands.setTextSelection(findTextStart(editor, 'Ordered text'))

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Ordered text' }]
    })
  })

  it('lifts a nested bullet list item one list level at a time', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, MarkdownStructuralEditing],
      content: {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Parent item' }]
                  },
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Child item' }]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    })

    editor.commands.setTextSelection(findTextStart(editor, 'Child item'))

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Parent item' }]
            }
          ]
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Child item' }]
            }
          ]
        }
      ]
    })
  })

  it('exits a top-level task item while preserving task text', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, TaskList, PageTaskItemExtension, MarkdownStructuralEditing],
      content: {
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Task text' }]
                  }
                ]
              }
            ]
          }
        ]
      }
    })

    editor.commands.setTextSelection(findTextStart(editor, 'Task text'))

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Task text' }]
    })
  })

  it('does not intercept Backspace inside list item text', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, MarkdownStructuralEditing],
      content: '<ul><li><p>Bullet text</p></li></ul>'
    })

    editor.commands.setTextSelection(findTextStart(editor, 'Bullet text') + 3)

    expect(runMarkdownStructuralBackspace(editor)).toBe(false)
    expect(firstBlock(editor)).toMatchObject({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Bullet text' }]
            }
          ]
        }
      ]
    })
  })

  it('does not intercept Backspace from later blocks inside the same list item', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, MarkdownStructuralEditing],
      content: '<ul><li><p>First line</p><p>Second line</p></li></ul>'
    })

    editor.commands.setTextSelection(findTextStart(editor, 'Second line'))

    expect(runMarkdownStructuralBackspace(editor)).toBe(false)
    expect(firstBlock(editor)).toMatchObject({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First line' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Second line' }]
            }
          ]
        }
      ]
    })
  })
})

describe('MarkdownStructuralEditing code fence Backspace', () => {
  let editor: Editor

  afterEach(() => {
    editor.destroy()
  })

  it('clears the code fence language before exiting the code block', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ codeBlock: false }),
        CodeBlockWithSyntax,
        MarkdownStructuralEditing
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'typescript' },
            content: [{ type: 'text', text: 'const value = 1' }]
          }
        ]
      }
    })

    editor.commands.setTextSelection(findTextStart(editor, 'const value'))

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'plaintext' },
      content: [{ type: 'text', text: 'const value = 1' }]
    })
  })

  it('exits a plaintext code block from the start of its content', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ codeBlock: false }),
        CodeBlockWithSyntax,
        MarkdownStructuralEditing
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'plaintext' },
            content: [{ type: 'text', text: 'plain code' }]
          }
        ]
      }
    })

    editor.commands.setTextSelection(findTextStart(editor, 'plain code'))

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'plain code' }]
    })
  })

  it('preserves multiline code content as paragraphs with a trailing insertion block', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ codeBlock: false }),
        CodeBlockWithSyntax,
        MarkdownStructuralEditing
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'plaintext' },
            content: [{ type: 'text', text: 'first line\nsecond line\n\nfourth line' }]
          }
        ]
      }
    })

    editor.commands.setTextSelection(findTextStart(editor, 'first line'))

    expect(pressBackspace(editor)).toBe(true)
    expect(editor.getJSON().content).toMatchObject([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'first line' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'second line' }]
      },
      {
        type: 'paragraph'
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'fourth line' }]
      },
      {
        type: 'paragraph'
      }
    ])
  })

  it('does not intercept Backspace inside code text', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ codeBlock: false }),
        CodeBlockWithSyntax,
        MarkdownStructuralEditing
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'typescript' },
            content: [{ type: 'text', text: 'const value = 1' }]
          }
        ]
      }
    })

    editor.commands.setTextSelection(findTextStart(editor, 'const value') + 3)

    expect(runMarkdownStructuralBackspace(editor)).toBe(false)
    expect(firstBlock(editor)).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'typescript' },
      content: [{ type: 'text', text: 'const value = 1' }]
    })
  })
})

describe('MarkdownStructuralEditing blockquote Backspace', () => {
  let editor: Editor

  afterEach(() => {
    editor.destroy()
  })

  it('unwraps a blockquote from the start of its first text block', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ blockquote: false }),
        BlockquoteWithSyntax,
        MarkdownStructuralEditing
      ],
      content: '<blockquote><p>Quote text</p></blockquote>'
    })

    editor.commands.setTextSelection(2)

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Quote text' }]
    })
  })

  it('demotes heading syntax inside blockquotes before unwrapping the quote token', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ heading: false, blockquote: false }),
        HeadingWithSyntax.configure({ levels: [1, 2, 3, 4, 5, 6] }),
        BlockquoteWithSyntax,
        MarkdownStructuralEditing
      ],
      content: '<blockquote><h2>Quoted heading</h2></blockquote>'
    })

    editor.commands.setTextSelection(2)

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'blockquote',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Quoted heading' }]
        }
      ]
    })

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Quoted heading' }]
        }
      ]
    })

    expect(pressBackspace(editor)).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Quoted heading' }]
    })
  })

  it('does not intercept Backspace inside blockquote text', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ blockquote: false }),
        BlockquoteWithSyntax,
        MarkdownStructuralEditing
      ],
      content: '<blockquote><p>Quote text</p></blockquote>'
    })

    editor.commands.setTextSelection(5)

    expect(runMarkdownStructuralBackspace(editor)).toBe(false)
    expect(firstBlock(editor)).toMatchObject({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Quote text' }]
        }
      ]
    })
  })
})

describe('HeadingWithSyntax commands', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit.configure({ heading: false }), HeadingWithSyntax],
      content: '<p>Heading command text</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  it('replaces built-in setHeading for custom heading nodes', () => {
    expect(editor.commands.setHeading({ level: 2 })).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Heading command text' }]
    })
  })

  it('replaces built-in toggleHeading for toolbar and slash commands', () => {
    expect(editor.commands.toggleHeading({ level: 3 })).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Heading command text' }]
    })

    expect(editor.commands.toggleHeading({ level: 3 })).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Heading command text' }]
    })
  })
})

describe('CodeBlockWithSyntax commands', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit.configure({ codeBlock: false }), CodeBlockWithSyntax],
      content: '<p>Code command text</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  it('replaces built-in setCodeBlock for custom code block nodes', () => {
    expect(editor.commands.setCodeBlock({ language: 'typescript' })).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'typescript' },
      content: [{ type: 'text', text: 'Code command text' }]
    })
  })

  it('replaces built-in toggleCodeBlock for toolbar and slash commands', () => {
    expect(editor.commands.toggleCodeBlock({ language: 'javascript' })).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'javascript' },
      content: [{ type: 'text', text: 'Code command text' }]
    })

    expect(editor.commands.toggleCodeBlock()).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Code command text' }]
    })
  })
})

describe('BlockquoteWithSyntax commands', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit.configure({ blockquote: false }), BlockquoteWithSyntax],
      content: '<p>Quote command text</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  it('replaces built-in setBlockquote for custom blockquote nodes', () => {
    expect(editor.commands.setBlockquote()).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Quote command text' }]
        }
      ]
    })
  })

  it('replaces built-in toggleBlockquote and unsetBlockquote for toolbar and slash commands', () => {
    expect(editor.commands.toggleBlockquote()).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Quote command text' }]
        }
      ]
    })

    expect(editor.commands.unsetBlockquote()).toBe(true)
    expect(firstBlock(editor)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Quote command text' }]
    })
  })
})
