import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RichLinkExtension } from './RichLinkExtension'

describe('RichLinkExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [
        StarterKit,
        Markdown.configure({
          indentation: { style: 'space', size: 2 },
          markedOptions: { gfm: true, breaks: false }
        }),
        RichLinkExtension
      ],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  function pastePlainText(
    text: string,
    html = ''
  ): { handled: boolean; preventDefault: () => void } {
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

    const pastePlugin = editor.state.plugins.find((plugin) =>
      String((plugin as { key?: string }).key).includes('richLinkPaste')
    )
    handled = pastePlugin?.props.handlePaste?.(editor.view, event, null as never) === true

    return { handled, preventDefault }
  }

  it('registers a block atom node', () => {
    const spec = editor.schema.nodes.richLink.spec

    expect(spec.group).toBe('block')
    expect(spec.atom).toBe(true)
    expect(spec.selectable).toBe(true)
    expect(spec.draggable).toBe(true)
  })

  it('inserts generic URL preview cards', () => {
    expect(editor.commands.setRichLink('https://example.com/docs/guide?tab=setup')).toBe(true)

    const richLink = editor.getJSON().content?.find((node) => node.type === 'richLink')
    expect(richLink?.attrs).toMatchObject({
      url: 'https://example.com/docs/guide?tab=setup',
      provider: 'generic',
      title: 'example.com',
      subtitle: '/docs/guide?tab=setup',
      icon: 'LINK'
    })
  })

  it('lets embeddable provider URLs fall through to media embed handling', () => {
    expect(editor.commands.setRichLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
  })

  it('pastes bare generic URLs as rich link preview cards', () => {
    editor.commands.setContent('<p></p>')
    editor.commands.setTextSelection(1)

    const { handled, preventDefault } = pastePlainText('https://example.com/docs/guide')

    expect(handled).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'richLink',
      attrs: {
        url: 'https://example.com/docs/guide',
        title: 'example.com'
      }
    })
  })

  it('does not steal rich HTML or selected-text URL paste flows', () => {
    editor.commands.setTextSelection({ from: 1, to: 6 })

    expect(
      pastePlainText('https://example.com/docs', '<a href="https://example.com/docs">docs</a>')
        .handled
    ).toBe(false)
    expect(pastePlainText('https://example.com/docs').handled).toBe(false)
  })

  it('round-trips xNet rich link markdown blocks', () => {
    const markdown = [
      ':::xnet-link',
      '{"url":"https://example.com/docs","title":"Docs","subtitle":"Reference"}',
      ':::'
    ].join('\n')

    editor.commands.setContent(markdown, { contentType: 'markdown' })

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'richLink',
      attrs: {
        url: 'https://example.com/docs',
        title: 'Docs',
        subtitle: 'Reference'
      }
    })
    expect(editor.getMarkdown().trimEnd()).toBe(markdown)
  })
})
