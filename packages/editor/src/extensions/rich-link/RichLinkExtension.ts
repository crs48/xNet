/**
 * RichLinkExtension - block preview cards for generic pasted URLs.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { parseExternalReferenceUrl } from '@xnetjs/data'
import {
  createXNetAuthoredMarkdownAttrs,
  createXNetJsonBlockTokenizer,
  parseXNetJsonPayload,
  renderXNetJsonBlockPreservingSource,
  stringAttr
} from '../markdown-xnet'
import { RichLinkNodeView } from './RichLinkNodeView'

const RichLinkPastePluginKey = new PluginKey('richLinkPaste')
const RICH_LINK_MARKDOWN_DIRECTIVE = 'xnet-link'

export interface RichLinkOptions {
  autoPreviewGenericUrls: boolean
  HTMLAttributes: Record<string, string>
}

type RichLinkAttrs = {
  url: string
  provider: string
  title: string
  subtitle: string | null
  icon: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    richLink: {
      /** Insert a rich link preview card from a generic URL. */
      setRichLink: (url: string) => ReturnType
    }
  }
}

function createRichLinkAttrs(url: string): RichLinkAttrs | null {
  const reference = parseExternalReferenceUrl(url)
  if (!reference || reference.provider !== 'generic') return null

  return {
    url: reference.normalizedUrl,
    provider: reference.provider,
    title: reference.title,
    subtitle: reference.subtitle ?? null,
    icon: reference.icon ?? 'LINK'
  }
}

function hasHtmlClipboardPayload(event: ClipboardEvent): boolean {
  return (event.clipboardData?.getData('text/html') ?? '').trim().length > 0
}

export const RichLinkExtension = Node.create<RichLinkOptions>({
  name: 'richLink',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addOptions() {
    return {
      autoPreviewGenericUrls: true,
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      url: { default: null },
      provider: { default: 'generic' },
      title: { default: null },
      subtitle: { default: null },
      icon: { default: 'LINK' },
      sourceMarkdown: { default: null, rendered: false },
      sourceCanonicalPayload: { default: null, rendered: false }
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-rich-link]' }, { tag: 'div[data-rich-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-rich-link': '',
        href: HTMLAttributes.url
      }),
      HTMLAttributes.title || HTMLAttributes.url
    ]
  },

  markdownTokenizer: createXNetJsonBlockTokenizer('richLink', RICH_LINK_MARKDOWN_DIRECTIVE),

  parseMarkdown: (token, helpers) => {
    const payload = parseXNetJsonPayload(token)
    const url = stringAttr(payload?.url)
    if (!url) return []

    const attrs = createRichLinkAttrs(url)
    if (!attrs) return []

    const parsedAttrs = {
      ...attrs,
      title: stringAttr(payload?.title, attrs.title) ?? attrs.title,
      subtitle: stringAttr(payload?.subtitle, attrs.subtitle),
      icon: stringAttr(payload?.icon, attrs.icon) ?? attrs.icon
    }

    return helpers.createNode('richLink', {
      ...parsedAttrs,
      ...createXNetAuthoredMarkdownAttrs(token, parsedAttrs)
    })
  },

  renderMarkdown: (node) =>
    renderXNetJsonBlockPreservingSource(
      RICH_LINK_MARKDOWN_DIRECTIVE,
      {
        url: node.attrs?.url,
        provider: node.attrs?.provider ?? 'generic',
        title: node.attrs?.title,
        subtitle: node.attrs?.subtitle,
        icon: node.attrs?.icon ?? 'LINK'
      },
      node.attrs ?? {}
    ),

  addNodeView() {
    return ReactNodeViewRenderer(RichLinkNodeView)
  },

  addCommands() {
    return {
      setRichLink:
        (url: string) =>
        ({ commands }) => {
          const attrs = createRichLinkAttrs(url)
          if (!attrs) return false

          return commands.insertContent({
            type: this.name,
            attrs
          })
        }
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    if (!this.options.autoPreviewGenericUrls) return []

    return [
      new Plugin({
        key: RichLinkPastePluginKey,
        props: {
          handlePaste(_view, event) {
            if (hasHtmlClipboardPayload(event)) return false
            if (!editor.state.selection.empty) return false
            if (editor.isActive('codeBlock')) return false

            const text = event.clipboardData?.getData('text/plain')?.trim()
            if (!text) return false

            const attrs = createRichLinkAttrs(text)
            if (!attrs) return false

            event.preventDefault()
            return editor.commands.setRichLink(text)
          }
        }
      })
    ]
  }
})
