/**
 * MermaidExtension - Mermaid diagram blocks for the editor.
 *
 * Features:
 * - Insert Mermaid diagrams via slash command or input rule
 * - Live preview with syntax error handling
 * - Theme selection (default, dark, forest, neutral)
 * - Supports all Mermaid diagram types (flowchart, sequence, class, etc.)
 */
import type { MermaidTheme } from './types'
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { MermaidNodeView } from './MermaidNodeView'

export interface MermaidOptions {
  /** Default theme for new diagrams */
  defaultTheme: MermaidTheme
  /** HTML attributes for the wrapper */
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaid: {
      /** Insert a mermaid diagram block */
      setMermaid: (code?: string, theme?: MermaidTheme) => ReturnType
    }
  }
}

export const MermaidExtension = Node.create<MermaidOptions>({
  name: 'mermaid',

  addOptions() {
    return {
      defaultTheme: 'default' as MermaidTheme,
      HTMLAttributes: {}
    }
  },

  group: 'block',

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-code') || '',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-code': attributes.code
        })
      },
      theme: {
        default: this.options.defaultTheme,
        parseHTML: (element: HTMLElement) =>
          (element.getAttribute('data-theme') as MermaidTheme) || this.options.defaultTheme,
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-theme': attributes.theme
        })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-mermaid]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-mermaid': '',
        class: 'mermaid-block'
      })
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView)
  },

  addCommands() {
    return {
      setMermaid:
        (code?: string, theme?: MermaidTheme) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              code: code || '',
              theme: theme || this.options.defaultTheme
            }
          })
        }
    }
  },

  addInputRules() {
    // Input rule: ```mermaid followed by Enter
    return [
      new InputRule({
        find: /^```mermaid\s$/,
        handler: ({ state, range }) => {
          const { tr } = state

          const node = state.schema.nodes.mermaid.create({
            code: '',
            theme: this.options.defaultTheme
          })

          tr.replaceWith(range.from, range.to, node)
        }
      })
    ]
  },

  addKeyboardShortcuts() {
    return {
      // Backspace on empty mermaid block deletes it
      Backspace: ({ editor }) => {
        const { selection } = editor.state
        const node = selection.$anchor.parent

        if (node.type.name !== this.name) return false

        // Check if the code is empty
        if (!node.attrs.code) {
          return editor.commands.deleteNode(this.name)
        }

        return false
      }
    }
  }
})
