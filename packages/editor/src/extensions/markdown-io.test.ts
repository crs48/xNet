import { Editor } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BlockquoteWithSyntax,
  CodeBlockWithSyntax,
  DatabaseEmbedExtension,
  EmbedExtension,
  HeadingWithSyntax,
  isMarkdownClipboardCandidate,
  MarkdownClipboard,
  PageTaskItemExtension,
  SmartReferenceExtension,
  TiptapMarkdown,
  Wikilink
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
      MarkdownClipboard,
      HeadingWithSyntax.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      BlockquoteWithSyntax,
      CodeBlockWithSyntax,
      DatabaseEmbedExtension,
      EmbedExtension,
      SmartReferenceExtension,
      Wikilink.configure({ onNavigate: () => {}, HTMLAttributes: {} }),
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

  it('round-trips xNet database embed blocks', () => {
    editor = createMarkdownEditor(
      [
        ':::xnet-database',
        '{"databaseId":"db-roadmap","viewType":"board","viewConfig":{"groupBy":"status"},"showTitle":false,"maxHeight":560}',
        ':::'
      ].join('\n')
    )

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'databaseEmbed',
      attrs: {
        databaseId: 'db-roadmap',
        viewType: 'board',
        viewConfig: { groupBy: 'status' },
        showTitle: false,
        maxHeight: 560
      }
    })
    expect(editor.getMarkdown().trimEnd()).toBe(
      [
        ':::xnet-database',
        '{',
        '  "databaseId": "db-roadmap",',
        '  "viewType": "board",',
        '  "viewConfig": {',
        '    "groupBy": "status"',
        '  },',
        '  "showTitle": false,',
        '  "maxHeight": 560',
        '}',
        ':::'
      ].join('\n')
    )
  })

  it('round-trips xNet rich media embed blocks', () => {
    editor = createMarkdownEditor(
      [
        ':::xnet-embed',
        '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","provider":"youtube","embedId":"dQw4w9WgXcQ","embedUrl":"https://www.youtube.com/embed/dQw4w9WgXcQ","title":"Launch demo","width":640,"alignment":"center"}',
        ':::'
      ].join('\n')
    )

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'embed',
      attrs: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        provider: 'youtube',
        embedId: 'dQw4w9WgXcQ',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        title: 'Launch demo',
        width: 640,
        alignment: 'center'
      }
    })
    expect(editor.getMarkdown()).toContain(':::xnet-embed')
    expect(editor.getMarkdown()).toContain('"alignment": "center"')
  })

  it('round-trips smart references and wikilinks', () => {
    editor = createMarkdownEditor(
      [
        'Issue {{xnet-ref {"url":"https://github.com/xnetjs/xNet/issues/301","provider":"github","kind":"issue","refId":"301","title":"Issue 301","icon":"GH","metadata":{"repo":"xNet"}}}} and [[Roadmap Page]]'
      ].join('\n')
    )

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Issue ' },
        {
          type: 'smartReference',
          attrs: {
            url: 'https://github.com/xnetjs/xNet/issues/301',
            provider: 'github',
            kind: 'issue',
            refId: '301',
            title: 'Issue 301',
            icon: 'GH',
            metadata: '{"repo":"xNet"}'
          }
        },
        { type: 'text', text: ' and ' },
        {
          type: 'text',
          text: 'Roadmap Page',
          marks: [
            {
              type: 'wikilink',
              attrs: {
                href: 'default/roadmap-page',
                title: 'Roadmap Page'
              }
            }
          ]
        }
      ]
    })
    expect(editor.getMarkdown()).toContain(
      '{{xnet-ref {"url":"https://github.com/xnetjs/xNet/issues/301"'
    )
    expect(editor.getMarkdown()).toContain('[[Roadmap Page]]')
  })
})

describe('MarkdownClipboard', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  function pastePlainText(
    text: string,
    html = ''
  ): { handled: boolean; preventDefault: () => void } {
    if (!editor) throw new Error('Editor not initialized')

    let handled = false
    const preventDefault = vi.fn()
    const event = {
      clipboardData: {
        getData: (type: string) => {
          if (type === 'text/plain') return text
          if (type === 'text/html') return html
          return ''
        }
      },
      preventDefault
    } as unknown as ClipboardEvent

    editor.view.someProp('handlePaste', (handler) => {
      if (handled) return
      handled = handler(editor!.view, event, null as never) === true
    })

    return { handled, preventDefault }
  }

  function serializeSelectionAsText(): string {
    if (!editor) throw new Error('Editor not initialized')

    let serialized = ''
    const slice = editor.state.doc.slice(0, editor.state.doc.content.size)

    editor.view.someProp('clipboardTextSerializer', (serializer) => {
      serialized = serializer(slice, editor!.view)
      return true
    })

    return serialized
  }

  it('detects markdown-looking clipboard text without stealing plain URLs', () => {
    expect(isMarkdownClipboardCandidate('### Heading')).toBe(true)
    expect(isMarkdownClipboardCandidate('- [ ] Task item')).toBe(true)
    expect(isMarkdownClipboardCandidate('A plain sentence')).toBe(false)
    expect(isMarkdownClipboardCandidate('https://youtu.be/dQw4w9WgXcQ')).toBe(false)
  })

  it('pastes markdown-looking plain text as structured content', () => {
    editor = createMarkdownEditor('')

    const { handled, preventDefault } = pastePlainText(['## Pasted', '', '- Item'].join('\n'))

    expect(handled).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
    expect(editor.getJSON().content?.slice(0, 2)).toMatchObject([
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Pasted' }]
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Item' }]
              }
            ]
          }
        ]
      }
    ])
  })

  it('passes through rich HTML clipboard payloads and plain URLs', () => {
    editor = createMarkdownEditor('')

    expect(pastePlainText('## Heading', '<h2>Heading</h2>').handled).toBe(false)
    expect(pastePlainText('https://example.com/watch').handled).toBe(false)
  })

  it('serializes copied structural content as markdown text', () => {
    editor = createMarkdownEditor('### Copied heading\n\n```ts\nconst value = 1\n```')

    expect(serializeSelectionAsText()).toBe('### Copied heading\n\n```ts\nconst value = 1\n```')
  })
})
