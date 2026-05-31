/**
 * PageEmbedExtension - block references to xNet pages.
 */
import { InputRule, Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import {
  createXNetAuthoredMarkdownAttrs,
  createXNetJsonBlockTokenizer,
  parseXNetJsonPayload,
  renderXNetJsonBlockPreservingSource,
  stringAttr
} from '../markdown-xnet'
import { PageEmbedNodeView } from './PageEmbedNodeView'

const PAGE_EMBED_MARKDOWN_DIRECTIVE = 'xnet-page'
const PAGE_EMBED_INPUT_REGEX = /^!\[\[([^\]\n]+)\]\]\s$/

export type PageEmbedAttrs = {
  pageId: string
  title: string
  subtitle: string | null
  icon: string
  preview: string | null
}

export type PageEmbedOptions = {
  onNavigate?: (pageId: string) => void
  HTMLAttributes: Record<string, unknown>
}

export type SetPageEmbedOptions = {
  pageId: string
  title?: string | null
  subtitle?: string | null
  icon?: string | null
  preview?: string | null
}

type PageEmbedMarkdownAttrs = {
  pageId: string | null | undefined
  title: string | null | undefined
  subtitle: string | null | undefined
  icon: string | null | undefined
  preview: string | null | undefined
}

function normalizeText(
  value: string | null | undefined,
  fallback: string | null = null
): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function generatePageId(title: string): string {
  return `default/${title.toLowerCase().replace(/\s+/g, '-')}`
}

function createPageEmbedAttrs(options: SetPageEmbedOptions): PageEmbedAttrs | null {
  const pageId = normalizeText(options.pageId)
  if (!pageId) return null

  return {
    pageId,
    title: normalizeText(options.title, pageId) ?? pageId,
    subtitle: normalizeText(options.subtitle),
    icon: normalizeText(options.icon, 'PG') ?? 'PG',
    preview: normalizeText(options.preview)
  }
}

function createPageEmbedMarkdownPayload(attrs: PageEmbedMarkdownAttrs): Record<string, unknown> {
  const pageId = normalizeText(attrs.pageId)
  const title = normalizeText(attrs.title, pageId)
  const subtitle = normalizeText(attrs.subtitle)
  const icon = normalizeText(attrs.icon, 'PG') ?? 'PG'
  const preview = normalizeText(attrs.preview)

  return {
    pageId,
    title,
    ...(subtitle ? { subtitle } : {}),
    icon,
    ...(preview ? { preview } : {})
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageEmbed: {
      setPageEmbed: (options: SetPageEmbedOptions) => ReturnType
      updatePageEmbed: (options: Partial<Omit<SetPageEmbedOptions, 'pageId'>>) => ReturnType
    }
  }
}

export const PageEmbedExtension = Node.create<PageEmbedOptions>({
  name: 'pageEmbed',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  isolating: true,

  addOptions() {
    return {
      onNavigate: undefined,
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      pageId: { default: null },
      title: { default: null },
      subtitle: { default: null },
      icon: { default: 'PG' },
      preview: { default: null },
      sourceMarkdown: { default: null, rendered: false },
      sourceCanonicalPayload: { default: null, rendered: false }
    }
  },

  parseHTML() {
    return [{ tag: 'article[data-page-embed]' }, { tag: 'div[data-page-embed]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'article',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-page-embed': '',
        'data-page-id': HTMLAttributes.pageId
      }),
      HTMLAttributes.title || HTMLAttributes.pageId
    ]
  },

  markdownTokenizer: createXNetJsonBlockTokenizer('pageEmbed', PAGE_EMBED_MARKDOWN_DIRECTIVE),

  parseMarkdown: (token, helpers) => {
    const payload = parseXNetJsonPayload(token)
    const pageId = stringAttr(payload?.pageId)
    if (!pageId) return []

    const attrs: PageEmbedAttrs = {
      pageId,
      title: stringAttr(payload?.title, pageId) ?? pageId,
      subtitle: stringAttr(payload?.subtitle),
      icon: stringAttr(payload?.icon, 'PG') ?? 'PG',
      preview: stringAttr(payload?.preview)
    }

    return helpers.createNode('pageEmbed', {
      ...attrs,
      ...createXNetAuthoredMarkdownAttrs(token, createPageEmbedMarkdownPayload(attrs))
    })
  },

  renderMarkdown: (node) =>
    renderXNetJsonBlockPreservingSource(
      PAGE_EMBED_MARKDOWN_DIRECTIVE,
      createPageEmbedMarkdownPayload({
        pageId: node.attrs?.pageId,
        title: node.attrs?.title,
        subtitle: node.attrs?.subtitle,
        icon: node.attrs?.icon ?? 'PG',
        preview: node.attrs?.preview
      }),
      node.attrs ?? {}
    ),

  addNodeView() {
    return ReactNodeViewRenderer(PageEmbedNodeView)
  },

  addCommands() {
    return {
      setPageEmbed:
        (options) =>
        ({ commands }) => {
          const attrs = createPageEmbedAttrs(options)
          if (!attrs) return false

          return commands.insertContent({
            type: this.name,
            attrs
          })
        },

      updatePageEmbed:
        (options) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, {
            ...(options.title !== undefined && { title: normalizeText(options.title) }),
            ...(options.subtitle !== undefined && { subtitle: normalizeText(options.subtitle) }),
            ...(options.icon !== undefined && { icon: normalizeText(options.icon, 'PG') }),
            ...(options.preview !== undefined && { preview: normalizeText(options.preview) })
          })
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: PAGE_EMBED_INPUT_REGEX,
        handler: ({ state, range, match }) => {
          const title = normalizeText(match[1])
          if (!title) return

          const attrs = createPageEmbedAttrs({
            pageId: generatePageId(title),
            title,
            subtitle: 'Embedded page'
          })
          if (!attrs) return

          state.tr.replaceWith(range.from, range.to, state.schema.nodes.pageEmbed.create(attrs))
        }
      })
    ]
  }
})
