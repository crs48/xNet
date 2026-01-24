/**
 * EmbedExtension - External media embeds (YouTube, Spotify, etc.).
 *
 * Renders iframes for supported providers with provider badge and resize support.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { EmbedNodeView } from './EmbedNodeView'
import { parseEmbedUrl } from './providers'

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
      title: { default: null }
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
  }
})
