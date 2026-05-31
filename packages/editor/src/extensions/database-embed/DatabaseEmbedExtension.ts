/**
 * DatabaseEmbedExtension - Inline database views within documents.
 *
 * References an existing xNet Database node and renders it using a callback-based
 * architecture. The consuming app provides the actual view rendering via the
 * `renderView` option, keeping @xnetjs/views out of the editor package's dependencies.
 */
import type { Editor } from '@tiptap/core'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import {
  booleanAttr,
  createXNetAuthoredMarkdownAttrs,
  createXNetJsonBlockTokenizer,
  numberAttr,
  parseXNetJsonPayload,
  recordAttr,
  renderXNetJsonBlockPreservingSource,
  stringAttr
} from '../markdown-xnet'
import { DatabaseEmbedNodeView } from './DatabaseEmbedNodeView'

export type DatabaseViewType = 'table' | 'board' | 'list' | 'calendar' | 'gallery' | 'timeline'

const DATABASE_EMBED_MARKDOWN_DIRECTIVE = 'xnet-database'
const DATABASE_VIEW_TYPES = new Set<DatabaseViewType>([
  'table',
  'board',
  'list',
  'calendar',
  'gallery',
  'timeline'
])

type DatabaseEmbedSelectionRange = {
  from: number
  to: number
}

function toDatabaseViewType(value: unknown): DatabaseViewType {
  return typeof value === 'string' && DATABASE_VIEW_TYPES.has(value as DatabaseViewType)
    ? (value as DatabaseViewType)
    : 'table'
}

function getSelectedDatabaseEmbedRange(
  editor: Editor,
  nodeName: string
): DatabaseEmbedSelectionRange | null {
  const { selection } = editor.state

  if (!(selection instanceof NodeSelection)) {
    return null
  }

  if (selection.node.type.name !== nodeName) {
    return null
  }

  return { from: selection.from, to: selection.to }
}

function moveSelectionAroundDatabaseEmbed(
  editor: Editor,
  nodeName: string,
  direction: 'before' | 'after'
): boolean {
  const range = getSelectedDatabaseEmbedRange(editor, nodeName)
  if (!range) return false

  const { state, view } = editor
  const position = direction === 'after' ? range.to : range.from
  const bias = direction === 'after' ? 1 : -1
  const selection = Selection.near(state.doc.resolve(position), bias)

  if (selection.eq(state.selection)) {
    return false
  }

  view.dispatch(state.tr.setSelection(selection).scrollIntoView())
  return true
}

function insertParagraphAroundDatabaseEmbed(
  editor: Editor,
  nodeName: string,
  direction: 'before' | 'after'
): boolean {
  const range = getSelectedDatabaseEmbedRange(editor, nodeName)
  if (!range) return false

  const paragraph = editor.state.schema.nodes.paragraph?.createAndFill()
  if (!paragraph) return false

  const insertionPosition = direction === 'after' ? range.to : range.from
  const tr = editor.state.tr.insert(insertionPosition, paragraph)
  const selection = TextSelection.create(tr.doc, insertionPosition + 1)

  editor.view.dispatch(tr.setSelection(selection).scrollIntoView())
  return true
}

export interface DatabaseEmbedOptions {
  /**
   * Callback to select a database. Invoked by the slash command.
   * Should show a picker UI and resolve with the selected database ID (or null to cancel).
   */
  onSelectDatabase?: () => Promise<string | null>
  /**
   * Render callback for the database view. Receives the database ID, view type, and config.
   * Returns a React element to render inside the embed. If not provided, a placeholder is shown.
   */
  renderView?: (props: {
    databaseId: string
    viewType: DatabaseViewType
    viewConfig: Record<string, unknown>
  }) => React.ReactNode
  /**
   * Callback to resolve a database ID to its metadata (title, icon).
   * Used by the NodeView header. If not provided, shows just the ID.
   */
  resolveDatabaseMeta?: (databaseId: string) => Promise<{
    title: string
    icon?: string
  } | null>
  /** HTML attributes */
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseEmbed: {
      /** Insert a database embed */
      setDatabaseEmbed: (options: {
        databaseId: string
        viewType?: DatabaseViewType
        viewConfig?: Record<string, unknown>
      }) => ReturnType
      /** Update the view type of the current database embed */
      updateDatabaseView: (options: {
        viewType?: DatabaseViewType
        viewConfig?: Record<string, unknown>
      }) => ReturnType
    }
  }
}

export const DatabaseEmbedExtension = Node.create<DatabaseEmbedOptions>({
  name: 'databaseEmbed',

  addOptions() {
    return {
      onSelectDatabase: undefined,
      renderView: undefined,
      resolveDatabaseMeta: undefined,
      HTMLAttributes: {}
    }
  },

  group: 'block',

  draggable: true,

  selectable: true,

  isolating: true,

  atom: true,

  addAttributes() {
    return {
      databaseId: { default: null },
      viewType: { default: 'table' },
      viewConfig: {
        default: {},
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('data-view-config')
          try {
            return raw ? JSON.parse(raw) : {}
          } catch {
            return {}
          }
        },
        renderHTML: (attributes: Record<string, any>) => ({
          'data-view-config': JSON.stringify(attributes.viewConfig || {})
        })
      },
      showTitle: { default: true },
      maxHeight: { default: 400 },
      sourceMarkdown: { default: null, rendered: false },
      sourceCanonicalPayload: { default: null, rendered: false }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-database-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-database-id': HTMLAttributes.databaseId,
        'data-view-type': HTMLAttributes.viewType,
        'data-type': 'database-embed'
      })
    ]
  },

  markdownTokenizer: createXNetJsonBlockTokenizer(
    'databaseEmbed',
    DATABASE_EMBED_MARKDOWN_DIRECTIVE
  ),

  parseMarkdown: (token, helpers) => {
    const payload = parseXNetJsonPayload(token)
    const databaseId = stringAttr(payload?.databaseId)
    if (!databaseId) return []

    const attrs = {
      databaseId,
      viewType: toDatabaseViewType(payload?.viewType),
      viewConfig: recordAttr(payload?.viewConfig),
      showTitle: booleanAttr(payload?.showTitle, true),
      maxHeight: numberAttr(payload?.maxHeight, 400)
    }

    return helpers.createNode('databaseEmbed', {
      ...attrs,
      ...createXNetAuthoredMarkdownAttrs(token, attrs)
    })
  },

  renderMarkdown: (node) =>
    renderXNetJsonBlockPreservingSource(
      DATABASE_EMBED_MARKDOWN_DIRECTIVE,
      {
        databaseId: node.attrs?.databaseId,
        viewType: node.attrs?.viewType ?? 'table',
        viewConfig: node.attrs?.viewConfig ?? {},
        showTitle: node.attrs?.showTitle ?? true,
        maxHeight: node.attrs?.maxHeight ?? 400
      },
      node.attrs ?? {}
    ),

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseEmbedNodeView)
  },

  addCommands() {
    return {
      setDatabaseEmbed:
        (options) =>
        ({ commands }) => {
          if (!options.databaseId) return false

          return commands.insertContent({
            type: this.name,
            attrs: {
              databaseId: options.databaseId,
              viewType: options.viewType ?? 'table',
              viewConfig: options.viewConfig ?? {}
            }
          })
        },

      updateDatabaseView:
        (options) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, {
            ...(options.viewType !== undefined && { viewType: options.viewType }),
            ...(options.viewConfig !== undefined && { viewConfig: options.viewConfig })
          })
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => insertParagraphAroundDatabaseEmbed(this.editor, this.name, 'after'),
      'Shift-Enter': () => insertParagraphAroundDatabaseEmbed(this.editor, this.name, 'before'),
      ArrowDown: () => moveSelectionAroundDatabaseEmbed(this.editor, this.name, 'after'),
      ArrowRight: () => moveSelectionAroundDatabaseEmbed(this.editor, this.name, 'after'),
      ArrowUp: () => moveSelectionAroundDatabaseEmbed(this.editor, this.name, 'before'),
      ArrowLeft: () => moveSelectionAroundDatabaseEmbed(this.editor, this.name, 'before')
    }
  }
})
