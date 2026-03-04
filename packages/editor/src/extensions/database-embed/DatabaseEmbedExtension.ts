/**
 * DatabaseEmbedExtension - Inline database views within documents.
 *
 * References an existing xNet Database node and renders it using a callback-based
 * architecture. The consuming app provides the actual view rendering via the
 * `renderView` option, keeping @xnetjs/views out of the editor package's dependencies.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { DatabaseEmbedNodeView } from './DatabaseEmbedNodeView'

export type DatabaseViewType = 'table' | 'board' | 'list' | 'calendar' | 'gallery' | 'timeline'

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
      maxHeight: { default: 400 }
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
  }
})
