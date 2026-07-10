/**
 * RichLinkExtension - block preview cards for generic pasted URLs.
 *
 * Metadata hydration (0295): when a `resolvePreview` resolver is
 * configured, the peer that performed the paste/command resolves real
 * metadata (via the hub's /unfurl proxy) and upgrades the card's attrs in
 * one follow-up transaction. Viewers never write attrs — render-time
 * hydration by every peer is exactly the two-device clobber this design
 * precludes.
 */

import type { Editor } from '@tiptap/core'
import type { MessageLinkPreview } from '@xnetjs/data'
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
  /**
   * Resolve real metadata for a pasted URL (0295), using the shared
   * MessageLinkPreview shape. Called only by the pasting peer, never at
   * render. Return null to keep the URL-derived attrs.
   */
  resolvePreview: ((url: string) => Promise<MessageLinkPreview | null>) | null
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

/**
 * Upgrade the just-inserted card's attrs with resolved metadata. Targets
 * the first still-unhydrated card for this URL (attrs match the inserted
 * defaults), so an undo before resolution is a silent no-op and identical
 * concurrent pastes each hydrate their own card.
 */
function hydrateRichLink(
  editor: Editor,
  defaults: RichLinkAttrs,
  preview: MessageLinkPreview | null
): void {
  if (!preview || editor.isDestroyed) return
  const title = preview.title.trim()
  if (!title) return

  const { state } = editor.view
  let pos = -1
  state.doc.descendants((node, nodePos) => {
    if (pos >= 0) return false
    if (
      node.type.name === 'richLink' &&
      node.attrs.url === defaults.url &&
      node.attrs.title === defaults.title
    ) {
      pos = nodePos
      return false
    }
    return true
  })
  if (pos < 0) return
  const node = state.doc.nodeAt(pos)
  if (!node) return

  const provider = preview.providerName?.trim() || preview.domain
  const description = preview.description?.trim()
  const subtitle = [provider, description].filter(Boolean).join(' — ')
  editor.view.dispatch(
    state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      title: title.slice(0, 200),
      subtitle: subtitle ? subtitle.slice(0, 300) : node.attrs.subtitle
    })
  )
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
      HTMLAttributes: {},
      resolvePreview: null
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
        ({ commands, dispatch }) => {
          const attrs = createRichLinkAttrs(url)
          if (!attrs) return false

          const inserted = commands.insertContent({
            type: this.name,
            attrs
          })

          // Hydrate only on real dispatch (not `can()` dry runs), and only
          // here — this code runs solely on the pasting peer.
          const resolver = this.options.resolvePreview
          if (inserted && dispatch && resolver) {
            const editor = this.editor
            void resolver(attrs.url)
              .then((preview) => hydrateRichLink(editor, attrs, preview))
              .catch(() => undefined)
          }

          return inserted
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
