import { Editor } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BlockquoteWithSyntax,
  CodeBlockWithSyntax,
  DatabaseEmbedExtension,
  DatabaseReferenceExtension,
  EmbedExtension,
  HashtagExtension,
  HeadingWithSyntax,
  isMarkdownClipboardCandidate,
  MarkdownClipboard,
  PageEmbedExtension,
  PageTaskItemExtension,
  SmartReferenceExtension,
  TaskMentionExtension,
  TiptapMarkdown,
  Wikilink
} from '../extensions'
import { generateLargeMarkdownDocument } from '../testing/benchmarks'
import { measure } from '../utils/performance'

const LARGE_MARKDOWN_BLOCK_COUNT = 1000
const LARGE_MARKDOWN_IMPORT_BUDGET_MS = 5000
const LARGE_MARKDOWN_EXPORT_BUDGET_MS = 3000

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
      DatabaseReferenceExtension,
      EmbedExtension,
      PageEmbedExtension,
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
    const authoredMarkdown = [
      ':::xnet-database',
      '{"databaseId":"db-roadmap","viewType":"board","viewConfig":{"groupBy":"status"},"showTitle":false,"maxHeight":560}',
      ':::'
    ].join('\n')

    editor = createMarkdownEditor(authoredMarkdown)

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
    expect(editor.getJSON().content?.[0]?.attrs?.sourceMarkdown).toBe(authoredMarkdown)
    expect(editor.getMarkdown().trimEnd()).toBe(authoredMarkdown)
  })

  it('canonicalizes xNet database embed blocks after semantic edits', () => {
    const authoredMarkdown = [
      ':::xnet-database',
      '{"databaseId":"db-roadmap","viewType":"board"}',
      ':::'
    ].join('\n')

    editor = createMarkdownEditor(authoredMarkdown)
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'databaseEmbed') return true
      editor?.commands.setNodeSelection(pos)
      return false
    })
    editor.commands.updateDatabaseView({ viewType: 'table' })

    expect(editor.getMarkdown().trimEnd()).toBe(
      [
        ':::xnet-database',
        '{',
        '  "databaseId": "db-roadmap",',
        '  "viewType": "table",',
        '  "viewConfig": {},',
        '  "showTitle": true,',
        '  "maxHeight": 400',
        '}',
        ':::'
      ].join('\n')
    )
  })

  it('round-trips xNet rich media embed blocks', () => {
    const authoredMarkdown = [
      ':::xnet-embed',
      '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","provider":"youtube","embedId":"dQw4w9WgXcQ","embedUrl":"https://www.youtube.com/embed/dQw4w9WgXcQ","title":"Launch demo","width":640,"alignment":"center"}',
      ':::'
    ].join('\n')

    editor = createMarkdownEditor(authoredMarkdown)

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
    expect(editor.getMarkdown().trimEnd()).toBe(authoredMarkdown)
  })

  it('round-trips xNet page embed blocks', () => {
    const authoredMarkdown = [
      ':::xnet-page',
      '{"pageId":"default/roadmap","title":"Roadmap","subtitle":"Planning page","icon":"RD","preview":"Launch milestones and decision notes."}',
      ':::'
    ].join('\n')

    editor = createMarkdownEditor(authoredMarkdown)

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'pageEmbed',
      attrs: {
        pageId: 'default/roadmap',
        title: 'Roadmap',
        subtitle: 'Planning page',
        icon: 'RD',
        preview: 'Launch milestones and decision notes.'
      }
    })
    expect(editor.getMarkdown().trimEnd()).toBe(authoredMarkdown)
  })

  it('canonicalizes xNet page embed blocks after semantic edits', () => {
    const authoredMarkdown = [
      ':::xnet-page',
      '{"pageId":"default/roadmap","title":"Roadmap"}',
      ':::'
    ].join('\n')

    editor = createMarkdownEditor(authoredMarkdown)
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'pageEmbed') return true
      editor?.commands.setNodeSelection(pos)
      return false
    })
    editor.commands.updatePageEmbed({ title: 'Product Roadmap' })

    expect(editor.getMarkdown().trimEnd()).toBe(
      [
        ':::xnet-page',
        '{',
        '  "pageId": "default/roadmap",',
        '  "title": "Product Roadmap",',
        '  "icon": "PG"',
        '}',
        ':::'
      ].join('\n')
    )
  })

  it('round-trips smart references, database references, and wikilinks', () => {
    editor = createMarkdownEditor(
      [
        'Issue {{xnet-ref {"url":"https://github.com/xnetjs/xNet/issues/301","provider":"github","kind":"issue","refId":"301","title":"Issue 301","icon":"GH","metadata":{"repo":"xNet"}}}}, {{xnet-db-ref {"databaseId":"db-roadmap","title":"Roadmap DB","icon":"DB"}}}, and [[Roadmap Page]]'
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
        { type: 'text', text: ', ' },
        {
          type: 'databaseReference',
          attrs: {
            databaseId: 'db-roadmap',
            title: 'Roadmap DB',
            icon: 'DB'
          }
        },
        { type: 'text', text: ', and ' },
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
    expect(editor.getMarkdown()).toContain(
      '{{xnet-db-ref {"databaseId":"db-roadmap","title":"Roadmap DB","icon":"DB"}}}'
    )
    expect(editor.getMarkdown()).toContain('[[Roadmap Page]]')
  })

  it('keeps large page markdown import and export within bounded budgets', () => {
    const markdown = generateLargeMarkdownDocument({
      blocks: LARGE_MARKDOWN_BLOCK_COUNT,
      wordsPerParagraph: 16,
      includeEmbeds: true
    })
    const imported = measure(() => createMarkdownEditor(markdown))
    editor = imported.result

    const exported = measure(() => editor!.getMarkdown())

    expect(editor.getJSON().content?.length).toBeGreaterThan(900)
    expect(exported.result).toContain('Paragraph 999')
    expect(imported.duration).toBeLessThan(LARGE_MARKDOWN_IMPORT_BUDGET_MS)
    expect(exported.duration).toBeLessThan(LARGE_MARKDOWN_EXPORT_BUDGET_MS)
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

describe('mention and hashtag pill markdown export (0170)', () => {
  it('degrades pills to plain @label / #name text', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ link: false }),
        TiptapMarkdown.configure({ markedOptions: { gfm: true, breaks: false } }),
        TaskMentionExtension,
        HashtagExtension
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Ping ' },
              {
                type: 'taskMention',
                attrs: { id: 'did:key:z6MkExample', label: 'alice' }
              },
              { type: 'text', text: ' about ' },
              { type: 'hashtag', attrs: { id: 'tag-1', name: 'design' } }
            ]
          }
        ]
      }
    })

    const markdown = editor.getMarkdown()
    expect(markdown).toContain('@alice')
    expect(markdown).toContain('#design')
    editor.destroy()
  })

  it('falls back to a truncated DID when a mention has no label', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ link: false }),
        TiptapMarkdown.configure({ markedOptions: { gfm: true, breaks: false } }),
        TaskMentionExtension,
        HashtagExtension
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'taskMention',
                attrs: { id: 'did:key:z6MkSomeLongIdentifier', label: null }
              }
            ]
          }
        ]
      }
    })

    expect(editor.getMarkdown()).toContain('@did:key:z6MkSo')
    editor.destroy()
  })
})
