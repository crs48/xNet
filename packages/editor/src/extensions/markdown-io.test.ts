import { Editor } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BlockquoteWithSyntax,
  CodeBlockWithSyntax,
  HeadingWithSyntax,
  PageTaskItemExtension,
  TiptapMarkdown
} from '../extensions'

function createMarkdownEditor(markdown = ''): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        heading: false,
        link: false
      }),
      TiptapMarkdown.configure({
        indentation: { style: 'space', size: 2 },
        markedOptions: { gfm: true, breaks: false }
      }),
      HeadingWithSyntax.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      BlockquoteWithSyntax,
      CodeBlockWithSyntax,
      Link.configure({ openOnClick: false }),
      TaskList,
      PageTaskItemExtension.configure({ nested: true })
    ],
    content: markdown,
    contentType: 'markdown'
  })
}

describe('TiptapMarkdown integration', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('parses markdown into xNet structural nodes', () => {
    editor = createMarkdownEditor(
      [
        '### Heading text',
        '',
        '> Quote text',
        '',
        '- Bullet text',
        '',
        '- [x] Done task',
        '',
        '```ts',
        'const value = 1',
        '```'
      ].join('\n')
    )

    expect(editor.getJSON().content).toMatchObject([
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Heading text' }]
      },
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Quote text' }]
          }
        ]
      },
      {
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
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Done task' }]
              }
            ]
          }
        ]
      },
      {
        type: 'codeBlock',
        attrs: { language: 'ts' },
        content: [{ type: 'text', text: 'const value = 1' }]
      }
    ])
  })

  it('serializes xNet structural nodes back to markdown', () => {
    editor = createMarkdownEditor()

    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Export heading' }]
          },
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Export quote' }]
              }
            ]
          },
          {
            type: 'codeBlock',
            attrs: { language: 'typescript' },
            content: [{ type: 'text', text: 'const value = 1' }]
          }
        ]
      },
      { emitUpdate: false }
    )

    expect(editor.getMarkdown().trimEnd()).toBe(
      ['## Export heading', '> Export quote', '```typescript\nconst value = 1\n```'].join('\n\n')
    )
  })

  it('supports markdown setContent and insertContent commands', () => {
    editor = createMarkdownEditor('# Initial')

    expect(editor.commands.setContent('## Changed', { contentType: 'markdown' })).toBe(true)
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Changed' }]
    })

    expect(editor.commands.insertContent('\n\nPlain text', { contentType: 'markdown' })).toBe(true)
    expect(editor.getMarkdown()).toContain('Plain text')
  })
})
