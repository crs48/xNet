/**
 * DatabaseReferenceExtension - compact inline references to xNet databases.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  createXNetAuthoredMarkdownAttrs,
  createXNetJsonInlineTokenizer,
  parseXNetJsonPayload,
  renderXNetJsonInlinePreservingSource,
  stringAttr
} from '../markdown-xnet'

const DATABASE_REFERENCE_MARKDOWN_DIRECTIVE = 'xnet-db-ref'
const databaseReferenceClickPluginKey = new PluginKey('databaseReferenceClick')

export type DatabaseReferenceAttrs = {
  databaseId: string
  title: string
  icon: string
}

export type SetDatabaseReferenceOptions = {
  databaseId: string
  title?: string | null
  icon?: string | null
}

export type DatabaseReferenceOptions = {
  onOpenDatabase?: (databaseId: string) => void
  HTMLAttributes: Record<string, string>
}

type DatabaseReferenceMarkdownAttrs = {
  databaseId: string | null | undefined
  title: string | null | undefined
  icon: string | null | undefined
}

function normalizeText(
  value: string | null | undefined,
  fallback: string | null = null
): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function createDatabaseReferenceAttrs(
  options: SetDatabaseReferenceOptions
): DatabaseReferenceAttrs | null {
  const databaseId = normalizeText(options.databaseId)
  if (!databaseId) return null

  return {
    databaseId,
    title: normalizeText(options.title, databaseId) ?? databaseId,
    icon: normalizeText(options.icon, 'DB') ?? 'DB'
  }
}

function createDatabaseReferenceMarkdownPayload(
  attrs: DatabaseReferenceMarkdownAttrs
): Record<string, unknown> {
  const databaseId = normalizeText(attrs.databaseId)
  const title = normalizeText(attrs.title, databaseId)
  const icon = normalizeText(attrs.icon, 'DB') ?? 'DB'

  return {
    databaseId,
    title,
    icon
  }
}

function findDatabaseReferenceAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null

  const anchor = target.closest('a[data-database-reference]')
  return anchor instanceof HTMLAnchorElement ? anchor : null
}

function dispatchOpenDatabase(databaseId: string): void {
  window.dispatchEvent(new CustomEvent('xnet:open-database', { detail: { databaseId } }))
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseReference: {
      setDatabaseReference: (options: SetDatabaseReferenceOptions) => ReturnType
    }
  }
}

export const DatabaseReferenceExtension = Node.create<DatabaseReferenceOptions>({
  name: 'databaseReference',

  inline: true,

  group: 'inline',

  atom: true,

  selectable: true,

  addOptions() {
    return {
      onOpenDatabase: undefined,
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      databaseId: { default: null },
      title: { default: null },
      icon: { default: 'DB' },
      sourceMarkdown: { default: null, rendered: false },
      sourceCanonicalPayload: { default: null, rendered: false }
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-database-reference]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const databaseId = stringAttr(HTMLAttributes.databaseId)
    const title = stringAttr(HTMLAttributes.title, databaseId) ?? 'Database'
    const icon = stringAttr(HTMLAttributes.icon, 'DB') ?? 'DB'
    const label = [icon, title].filter(Boolean).join(' ')

    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-database-reference': '',
        'data-database-id': databaseId,
        href: databaseId ? `xnet://database/${databaseId}` : undefined,
        'aria-label': `Database ${title}`,
        title: `Database ${title}`,
        class: 'database-reference'
      }),
      label
    ]
  },

  markdownTokenizer: createXNetJsonInlineTokenizer(
    'databaseReference',
    DATABASE_REFERENCE_MARKDOWN_DIRECTIVE
  ),

  parseMarkdown: (token, helpers) => {
    const payload = parseXNetJsonPayload(token)
    const databaseId = stringAttr(payload?.databaseId)
    if (!databaseId) return []

    const attrs: DatabaseReferenceAttrs = {
      databaseId,
      title: stringAttr(payload?.title, databaseId) ?? databaseId,
      icon: stringAttr(payload?.icon, 'DB') ?? 'DB'
    }

    return helpers.createNode('databaseReference', {
      ...attrs,
      ...createXNetAuthoredMarkdownAttrs(token, createDatabaseReferenceMarkdownPayload(attrs))
    })
  },

  renderMarkdown: (node) =>
    renderXNetJsonInlinePreservingSource(
      DATABASE_REFERENCE_MARKDOWN_DIRECTIVE,
      createDatabaseReferenceMarkdownPayload({
        databaseId: node.attrs?.databaseId,
        title: node.attrs?.title,
        icon: node.attrs?.icon ?? 'DB'
      }),
      node.attrs ?? {}
    ),

  addCommands() {
    return {
      setDatabaseReference:
        (options) =>
        ({ commands }) => {
          const attrs = createDatabaseReferenceAttrs(options)
          if (!attrs) return false

          return commands.insertContent({
            type: this.name,
            attrs
          })
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: databaseReferenceClickPluginKey,
        props: {
          handleClick: (_view, _pos, event) => {
            const anchor = findDatabaseReferenceAnchor(event.target)
            const databaseId = anchor?.getAttribute('data-database-id')?.trim()
            if (!databaseId) return false

            event.preventDefault()
            if (this.options.onOpenDatabase) {
              this.options.onOpenDatabase(databaseId)
            } else {
              dispatchOpenDatabase(databaseId)
            }
            return true
          }
        }
      })
    ]
  }
})
