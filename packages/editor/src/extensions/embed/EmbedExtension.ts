/**
 * EmbedExtension - External media embeds (YouTube, Spotify, etc.).
 *
 * Renders iframes for supported providers with provider badge and resize support.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import {
  createXNetAuthoredMarkdownAttrs,
  createXNetJsonBlockTokenizer,
  numberAttr,
  parseXNetJsonPayload,
  renderXNetJsonBlockPreservingSource,
  stringAttr
} from '../markdown-xnet'
import { createEmbedLinkPlugin } from './EmbedLinkPlugin'
import { EmbedNodeView } from './EmbedNodeView'
import { parseEmbedUrl } from './providers'

const EmbedPastePluginKey = new PluginKey('embedPaste')
const EMBED_MARKDOWN_DIRECTIVE = 'xnet-embed'

function toEmbedAlignment(value: unknown): 'left' | 'center' | 'right' {
  return value === 'center' || value === 'right' ? value : 'left'
}

export interface EmbedOptions {
  /** Enable auto-detection of pasted URLs */
  autoEmbed: boolean
  /** Restrict to specific providers (empty = all) */
  allowedProviders: string[]
  /** HTML attributes */
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      /** Insert an embed from URL */
      setEmbed: (url: string) => ReturnType
    }
  }
}

export const EmbedExtension = Node.create<EmbedOptions>({
  name: 'embed',

  addOptions() {
    return {
      autoEmbed: true,
      allowedProviders: [],
      HTMLAttributes: {}
    }
  },

  group: 'block',

  draggable: true,

  addAttributes() {
    return {
      url: { default: null },
      provider: { default: null },
      embedId: { default: null },
      embedUrl: { default: null },
      title: { default: null },
      width: { default: 400 },
      alignment: { default: 'left' },
      sourceMarkdown: { default: null, rendered: false },
      sourceCanonicalPayload: { default: null, rendered: false }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-embed-url]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-embed-url': HTMLAttributes.url,
        'data-embed-provider': HTMLAttributes.provider
      })
    ]
  },

  markdownTokenizer: createXNetJsonBlockTokenizer('embed', EMBED_MARKDOWN_DIRECTIVE),

  parseMarkdown: (token, helpers) => {
    const payload = parseXNetJsonPayload(token)
    const url = stringAttr(payload?.url)
    if (!url) return []

    const parsed = parseEmbedUrl(url)

    const attrs = {
      url,
      provider: stringAttr(payload?.provider, parsed?.provider.name ?? null),
      embedId: stringAttr(payload?.embedId, parsed?.id ?? null),
      embedUrl: stringAttr(payload?.embedUrl, parsed?.embedUrl ?? null),
      title: stringAttr(payload?.title),
      width: numberAttr(payload?.width, 400),
      alignment: toEmbedAlignment(payload?.alignment)
    }

    return helpers.createNode('embed', {
      ...attrs,
      ...createXNetAuthoredMarkdownAttrs(token, attrs)
    })
  },

  renderMarkdown: (node) =>
    renderXNetJsonBlockPreservingSource(
      EMBED_MARKDOWN_DIRECTIVE,
      {
        url: node.attrs?.url,
        provider: node.attrs?.provider,
        embedId: node.attrs?.embedId,
        embedUrl: node.attrs?.embedUrl,
        title: node.attrs?.title,
        width: node.attrs?.width ?? 400,
        alignment: node.attrs?.alignment ?? 'left'
      },
      node.attrs ?? {}
    ),

  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView)
  },

  addCommands() {
    return {
      setEmbed:
        (url: string) =>
        ({ commands }) => {
          const parsed = parseEmbedUrl(url)
          if (!parsed) {
            console.warn('Unknown embed URL:', url)
            return false
          }

          if (
            this.options.allowedProviders.length > 0 &&
            !this.options.allowedProviders.includes(parsed.provider.name)
          ) {
            return false
          }

          return commands.insertContent({
            type: this.name,
            attrs: {
              url,
              provider: parsed.provider.name,
              embedId: parsed.id,
              embedUrl: parsed.embedUrl
            }
          })
        }
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const plugins = []

    // Auto-embed pasted URLs
    if (this.options.autoEmbed) {
      plugins.push(
        new Plugin({
          key: EmbedPastePluginKey,
          props: {
            handlePaste(view, event) {
              const text = event.clipboardData?.getData('text/plain')
              if (!text) return false

              // Check if the pasted text is a URL that can be embedded
              const trimmed = text.trim()

              // Must look like a URL
              if (!trimmed.match(/^https?:\/\//)) return false

              // Try to parse as embed
              const parsed = parseEmbedUrl(trimmed)
              if (!parsed) return false

              // Prevent default paste
              event.preventDefault()

              // Insert the embed
              editor.commands.setEmbed(trimmed)

              return true
            }
          }
        })
      )
    }

    // Show embed button on hover over embeddable links
    plugins.push(createEmbedLinkPlugin({ editor }))

    return plugins
  }
})
