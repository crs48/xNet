/**
 * ToggleExtension - Collapsible sections (details/summary).
 *
 * Features:
 * - Expand/collapse content
 * - Editable summary text
 * - Drag & drop support
 * - Obsidian-style input rule: > [toggle] Summary
 */
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ToggleNodeView } from './ToggleNodeView'

export interface ToggleOptions {
  /** Default expanded state */
  defaultOpen: boolean
  /** HTML attributes */
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggle: {
      /** Insert a toggle block */
      setToggle: (summary?: string) => ReturnType
      /** Toggle the expanded state */
      toggleExpanded: () => ReturnType
      /** Update the summary text */
      setToggleSummary: (summary: string) => ReturnType
    }
  }
}

export const ToggleExtension = Node.create<ToggleOptions>({
  name: 'toggle',

  addOptions() {
    return {
      defaultOpen: true,
      HTMLAttributes: {}
    }
  },

  group: 'block',

  content: 'block+',

  draggable: true,

  addAttributes() {
    return {
      summary: {
        default: 'Toggle',
        parseHTML: (element: HTMLElement) => {
          const summaryEl = element.querySelector('summary')
          return summaryEl?.textContent || 'Toggle'
        }
      },
      open: {
        default: this.options.defaultOpen,
        parseHTML: (element: HTMLElement) => element.hasAttribute('open')
      }
    }
  },

  parseHTML() {
    return [{ tag: 'details' }]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(this.options.HTMLAttributes, {
      ...(HTMLAttributes.open ? { open: 'open' } : {})
    })
    return ['details', attrs, ['summary', {}, HTMLAttributes.summary || 'Toggle'], ['div', {}, 0]]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleNodeView)
  },

  addCommands() {
    return {
      setToggle:
        (summary) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              summary: summary ?? 'Toggle',
              open: this.options.defaultOpen
            },
            content: [{ type: 'paragraph' }]
          })
        },

      toggleExpanded:
        () =>
        ({ state, dispatch }) => {
          const { $anchor } = state.selection

          // Walk up to find the toggle
          for (let d = $anchor.depth; d > 0; d--) {
            const node = $anchor.node(d)
            if (node.type.name === this.name) {
              if (dispatch) {
                const pos = $anchor.before(d)
                const tr = state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  open: !node.attrs.open
                })
                dispatch(tr)
              }
              return true
            }
          }

          return false
        },

      setToggleSummary:
        (summary) =>
        ({ state, dispatch }) => {
          const { $anchor } = state.selection

          for (let d = $anchor.depth; d > 0; d--) {
            const node = $anchor.node(d)
            if (node.type.name === this.name) {
              if (dispatch) {
                const pos = $anchor.before(d)
                const tr = state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  summary
                })
                dispatch(tr)
              }
              return true
            }
          }

          return false
        }
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^>\s?\[toggle\]\s?(.*)$/,
        handler: ({ state, range, match }) => {
          const summary = match[1] || 'Toggle'
          const { tr } = state

          const node = state.schema.nodes.toggle.create(
            { summary, open: true },
            state.schema.nodes.paragraph.create()
          )

          tr.replaceWith(range.from, range.to, node)
        }
      })
    ]
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state
        const { $anchor } = selection

        if ($anchor.parentOffset !== 0) return false

        // Check if we're at the start of the first child of a toggle
        for (let d = $anchor.depth; d > 0; d--) {
          const node = $anchor.node(d)
          if (node.type.name === this.name) {
            // Only lift if at very first position
            const toggleStart = $anchor.start(d)
            if ($anchor.pos === toggleStart) {
              return editor.commands.lift(this.name)
            }
            return false
          }
        }

        return false
      }
    }
  }
})
