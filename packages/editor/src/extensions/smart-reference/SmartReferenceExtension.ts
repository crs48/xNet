/**
 * SmartReferenceExtension - Compact inline structured references.
 *
 * Converts supported URLs into inline chips that preserve normalized metadata
 * without forcing a full embed. This is especially useful inside task items.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  createXNetJsonInlineTokenizer,
  parseXNetJsonPayload,
  recordAttr,
  renderXNetJsonInline,
  stringAttr
} from '../markdown-xnet'
import { parseSmartReferenceUrl } from './providers'

const SmartReferencePastePluginKey = new PluginKey('smartReferencePaste')
const SMART_REFERENCE_MARKDOWN_DIRECTIVE = 'xnet-ref'

function isTaskItemSelection(editor: import('@tiptap/core').Editor): boolean {
  const { $from } = editor.state.selection

  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === 'taskItem') {
      return true
    }
  }

  return false
}

function buildReferenceChip(reference: ReturnType<typeof parseSmartReferenceUrl>) {
  if (!reference) return null

  return {
    type: 'smartReference',
    attrs: {
      url: reference.url,
      provider: reference.provider,
      kind: reference.kind,
      refId: reference.refId,
      title: reference.title,
      subtitle: reference.subtitle ?? null,
      icon: reference.icon,
      embedUrl: reference.embedUrl ?? null,
      metadata: JSON.stringify(reference.metadata)
    }
  }
}

function metadataAttr(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value
  return JSON.stringify(recordAttr(value))
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return recordAttr(value)

  try {
    const parsed = JSON.parse(value)
    return recordAttr(parsed)
  } catch {
    return {}
  }
}

export interface SmartReferenceOptions {
  autoConvertTaskPaste: boolean
  HTMLAttributes: Record<string, string>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smartReference: {
      setSmartReference: (url: string) => ReturnType
    }
  }
}

export const SmartReferenceExtension = Node.create<SmartReferenceOptions>({
  name: 'smartReference',

  inline: true,

  group: 'inline',

  atom: true,

  selectable: true,

  addOptions() {
    return {
      autoConvertTaskPaste: true,
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      url: { default: null },
      provider: { default: null },
      kind: { default: null },
      refId: { default: null },
      title: { default: null },
      subtitle: { default: null },
      icon: { default: null },
      embedUrl: { default: null },
      metadata: { default: '{}' }
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-smart-reference]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const label = [HTMLAttributes.icon, HTMLAttributes.title].filter(Boolean).join(' ')

    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-smart-reference': '',
        'data-provider': HTMLAttributes.provider,
        'data-kind': HTMLAttributes.kind,
        href: HTMLAttributes.url,
        class: `smart-reference smart-reference--${HTMLAttributes.provider || 'generic'}`
      }),
      label
    ]
  },

  markdownTokenizer: createXNetJsonInlineTokenizer(
    'smartReference',
    SMART_REFERENCE_MARKDOWN_DIRECTIVE
  ),

  parseMarkdown: (token, helpers) => {
    const payload = parseXNetJsonPayload(token)
    const url = stringAttr(payload?.url)
    if (!url) return []

    return helpers.createNode('smartReference', {
      url,
      provider: stringAttr(payload?.provider),
      kind: stringAttr(payload?.kind),
      refId: stringAttr(payload?.refId),
      title: stringAttr(payload?.title, url),
      subtitle: stringAttr(payload?.subtitle),
      icon: stringAttr(payload?.icon),
      embedUrl: stringAttr(payload?.embedUrl),
      metadata: metadataAttr(payload?.metadata)
    })
  },

  renderMarkdown: (node) =>
    renderXNetJsonInline(SMART_REFERENCE_MARKDOWN_DIRECTIVE, {
      url: node.attrs?.url,
      provider: node.attrs?.provider,
      kind: node.attrs?.kind,
      refId: node.attrs?.refId,
      title: node.attrs?.title,
      subtitle: node.attrs?.subtitle,
      icon: node.attrs?.icon,
      embedUrl: node.attrs?.embedUrl,
      metadata: parseMetadata(node.attrs?.metadata)
    }),

  addCommands() {
    return {
      setSmartReference:
        (url: string) =>
        ({ commands }) => {
          const reference = parseSmartReferenceUrl(url)
          if (!reference) return false

          const chip = buildReferenceChip(reference)
          if (!chip) return false

          return commands.insertContent(chip)
        }
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    if (!this.options.autoConvertTaskPaste) return []

    return [
      new Plugin({
        key: SmartReferencePastePluginKey,
        props: {
          handlePaste(_view, event) {
            const text = event.clipboardData?.getData('text/plain')?.trim()
            if (!text) return false
            if (!isTaskItemSelection(editor)) return false

            const reference = parseSmartReferenceUrl(text)
            if (!reference) return false

            event.preventDefault()
            return editor.commands.setSmartReference(text)
          }
        }
      })
    ]
  }
})
