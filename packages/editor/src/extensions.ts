/**
 * @xnet/editor - Tiptap extensions
 *
 * Custom extensions for the xNet editor.
 */
import { Mark, mergeAttributes, markInputRule } from '@tiptap/core'

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

// Re-export commonly used Tiptap extensions for convenience
export { default as StarterKit } from '@tiptap/starter-kit'
export { default as Placeholder } from '@tiptap/extension-placeholder'
export { default as Collaboration } from '@tiptap/extension-collaboration'
export { default as TaskList } from '@tiptap/extension-task-list'
export { default as TaskItem } from '@tiptap/extension-task-item'
export { default as Link } from '@tiptap/extension-link'
export { default as Typography } from '@tiptap/extension-typography'
