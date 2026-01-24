/**
 * CalloutExtension - Highlighted info/warning/tip blocks.
 *
 * Supports 6 types: info, tip, warning, caution, note, quote.
 * Features: collapsible, title editing, type picker, Obsidian-style input rule.
 */
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutNodeView } from './CalloutNodeView'
import type { CalloutType } from './types'

export interface CalloutOptions {
  /** Default callout type */
  defaultType: CalloutType
  /** HTML attributes for the wrapper */
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Insert a callout wrapping the current selection */
      setCallout: (type?: CalloutType) => ReturnType
      /** Toggle callout on/off */
      toggleCallout: (type?: CalloutType) => ReturnType
      /** Change the callout type */
      setCalloutType: (type: CalloutType) => ReturnType
      /** Update callout title */
      setCalloutTitle: (title: string) => ReturnType
    }
  }
}

export const CalloutExtension = Node.create<CalloutOptions>({
  name: 'callout',

  addOptions() {
    return {
      defaultType: 'info' as CalloutType,
      HTMLAttributes: {}
    }
  },

  group: 'block',

  content: 'block+',

  draggable: true,

  addAttributes() {
    return {
      type: {
        default: this.options.defaultType,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-callout') || this.options.defaultType,
        renderHTML: (attributes: Record<string, any>) => ({
          'data-callout': attributes.type
        })
      },
      title: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-title') || null,
        renderHTML: (attributes: Record<string, any>) =>
          attributes.title ? { 'data-title': attributes.title } : {}
      },
      collapsed: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes: Record<string, any>) =>
          attributes.collapsed ? { 'data-collapsed': 'true' } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'callout'
      }),
      0
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView)
  },

  addCommands() {
    return {
      setCallout:
        (type) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, { type: type ?? this.options.defaultType })
        },

      toggleCallout:
        (type) =>
        ({ commands, state }) => {
          // Check if cursor is already inside a callout
          const { $from } = state.selection
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === this.name) {
              return commands.lift(this.name)
            }
          }
          return commands.wrapIn(this.name, { type: type ?? this.options.defaultType })
        },

      setCalloutType:
        (type) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { type })
        },

      setCalloutTitle:
        (title) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { title })
        }
    }
  },

  addInputRules() {
    // Obsidian-style: > [!info] Title
    return [
      new InputRule({
        find: /^>\s?\[!(\w+)\]\s?(.*)$/,
        handler: ({ state, range, match }) => {
          const calloutType = match[1] as CalloutType
          const title = match[2] || null
          const { tr } = state

          const node = state.schema.nodes.callout.create(
            { type: calloutType, title },
            state.schema.nodes.paragraph.create()
          )

          tr.replaceWith(range.from, range.to, node)
        }
      })
    ]
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at start of first child should lift out of callout
      Backspace: ({ editor }) => {
        const { selection } = editor.state
        const { $anchor } = selection

        // Must be at the start of a block
        if ($anchor.parentOffset !== 0) return false

        // Walk up to find callout
        for (let d = $anchor.depth; d > 0; d--) {
          if ($anchor.node(d).type.name === this.name) {
            // Only lift if we're in the first child of the callout
            const calloutStart = $anchor.start(d)
            const firstChildStart = calloutStart
            if ($anchor.pos === firstChildStart) {
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
