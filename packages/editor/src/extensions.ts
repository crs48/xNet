/**
 * @xnet/editor - Tiptap extensions
 *
 * Custom extensions for the xNet editor.
 */
import { Mark, Extension, mergeAttributes, markInputRule } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// ============================================================================
// Wikilink Extension
// ============================================================================

export interface WikilinkOptions {
  /** Callback when a wikilink is clicked */
  onNavigate: (pageId: string) => void
  /** HTML attributes to add to the link */
  HTMLAttributes: Record<string, string>
}

/**
 * Generate a document ID from a title
 */
function generatePageId(title: string): string {
  return `default/${title.toLowerCase().replace(/\s+/g, '-')}`
}

/**
 * Regex pattern to match [[text]]
 */
const wikilinkInputRegex = /\[\[([^\]]+)\]\]$/

/**
 * Wikilink extension for Tiptap
 *
 * Adds support for [[page-name]] style wikilinks.
 * When typed, converts to a clickable link that navigates within the app.
 *
 * @example
 * ```ts
 * import { Wikilink } from '@xnet/editor/extensions'
 *
 * const editor = useEditor({
 *   extensions: [
 *     Wikilink.configure({
 *       onNavigate: (pageId) => navigate(`/doc/${pageId}`)
 *     })
 *   ]
 * })
 * ```
 */
export const Wikilink = Mark.create<WikilinkOptions>({
  name: 'wikilink',

  addOptions() {
    return {
      onNavigate: () => {},
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      href: {
        default: null,
      },
      title: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wikilink]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-wikilink': '',
        class: 'wikilink',
      }),
      0,
    ]
  },

  addInputRules() {
    return [
      markInputRule({
        find: wikilinkInputRegex,
        type: this.type,
        getAttributes: (match) => {
          const title = match[1]
          const pageId = generatePageId(title)
          return { href: pageId, title }
        },
      }),
    ]
  },
})

// ============================================================================
// Live Preview Extension (Obsidian-style)
// ============================================================================

/**
 * Mark syntax definitions - maps mark names to their markdown delimiters
 */
const MARK_SYNTAX: Record<string, { open: string; close: string }> = {
  bold: { open: '**', close: '**' },
  italic: { open: '*', close: '*' },
  strike: { open: '~~', close: '~~' },
  code: { open: '`', close: '`' },
}

const livePreviewPluginKey = new PluginKey('livePreview')

export interface LivePreviewOptions {
  /** Mark types to show syntax for (default: bold, italic, strike, code) */
  marks?: string[]
}

/**
 * LivePreview extension for Obsidian-style markdown editing
 *
 * Shows markdown syntax (like `**` for bold) when the cursor is inside
 * or adjacent to formatted text. Hides syntax when cursor moves away.
 *
 * @example
 * ```ts
 * import { LivePreview } from '@xnet/editor/extensions'
 *
 * const editor = useEditor({
 *   extensions: [
 *     StarterKit,
 *     LivePreview,
 *   ]
 * })
 * ```
 */
export const LivePreview = Extension.create<LivePreviewOptions>({
  name: 'livePreview',

  addOptions() {
    return {
      marks: ['bold', 'italic', 'strike', 'code'],
    }
  },

  addProseMirrorPlugins() {
    const enabledMarks = this.options.marks || []

    return [
      new Plugin({
        key: livePreviewPluginKey,

        props: {
          decorations(state) {
            const { doc, selection } = state
            const { $from } = selection
            const decorations: Decoration[] = []

            // Only process if we have a cursor (not a range selection)
            if (!selection.empty) {
              return DecorationSet.empty
            }

            // Get marks at the cursor position
            const marks = $from.marks()
            if (marks.length === 0) {
              return DecorationSet.empty
            }

            // Track which marks we've already processed (by type)
            const processedTypes = new Set<string>()

            // Find the extent of each mark around the cursor
            for (const mark of marks) {
              const markType = mark.type.name
              const syntax = MARK_SYNTAX[markType]

              if (!syntax || !enabledMarks.includes(markType)) continue
              if (processedTypes.has(markType)) continue
              processedTypes.add(markType)

              // Find mark boundaries containing the cursor
              const cursorPos = $from.pos
              const blockStart = $from.start()
              const blockEnd = $from.end()
              let markStart = -1
              let markEnd = -1
              let foundCursor = false

              // Scan the parent block to find the mark range containing cursor
              doc.nodesBetween(blockStart, blockEnd, (node, pos) => {
                if (!node.isText) return
                const nodeEnd = pos + node.nodeSize
                const hasThisMark = node.marks.some(m => m.type.name === markType)
                const cursorInNode = cursorPos >= pos && cursorPos <= nodeEnd

                if (hasThisMark) {
                  // If we're in a new mark range (not contiguous with previous)
                  if (markStart === -1 || (foundCursor && markEnd < pos)) {
                    // Reset if we already found the cursor's range
                    if (foundCursor) return false
                    markStart = pos
                  }
                  markEnd = nodeEnd
                  if (cursorInNode) foundCursor = true
                } else {
                  // Mark ended - if we found cursor, we're done
                  if (foundCursor && markStart !== -1) return false
                  // Reset for potential next mark range
                  if (!foundCursor) {
                    markStart = -1
                    markEnd = -1
                  }
                }
              })

              // Skip if we couldn't find valid boundaries
              if (markStart === -1 || markEnd === -1 || markStart >= markEnd) continue

              // Add decoration for opening syntax
              decorations.push(
                Decoration.widget(markStart, () => {
                  const span = document.createElement('span')
                  span.className = 'md-syntax md-syntax-open'
                  span.textContent = syntax.open
                  return span
                }, { side: -1 })
              )

              // Add decoration for closing syntax
              decorations.push(
                Decoration.widget(markEnd, () => {
                  const span = document.createElement('span')
                  span.className = 'md-syntax md-syntax-close'
                  span.textContent = syntax.close
                  return span
                }, { side: 1 })
              )
            }

            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

// Re-export commonly used Tiptap extensions for convenience
export { default as StarterKit } from '@tiptap/starter-kit'
export { default as Placeholder } from '@tiptap/extension-placeholder'
export { default as Collaboration } from '@tiptap/extension-collaboration'
export { default as TaskList } from '@tiptap/extension-task-list'
export { default as TaskItem } from '@tiptap/extension-task-item'
export { default as Link } from '@tiptap/extension-link'
export { default as Typography } from '@tiptap/extension-typography'
