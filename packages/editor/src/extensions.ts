/**
 * @xnetjs/editor - Tiptap extensions
 *
 * Custom extensions for the xNet editor.
 */
import { Mark, Node, mergeAttributes, markInputRule, textblockTypeInputRule } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { BlockquoteView } from './nodeviews/BlockquoteView'
import { CodeBlockView } from './nodeviews/CodeBlockView'
import { HeadingView } from './nodeviews/HeadingView'

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
 */
export const Wikilink = Mark.create<WikilinkOptions>({
  name: 'wikilink',

  addOptions() {
    return {
      onNavigate: () => {},
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      href: {
        default: null
      },
      title: {
        default: null
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wikilink]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-wikilink': '',
        class: 'wikilink'
      }),
      0
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
        }
      })
    ]
  }
})

// ============================================================================
// HeadingWithSyntax Extension
// ============================================================================

export interface HeadingWithSyntaxOptions {
  levels: number[]
  HTMLAttributes: Record<string, any>
}

/**
 * Custom Heading extension that uses HeadingView for live preview.
 * Shows `#` characters when the cursor is inside the heading.
 */
export const HeadingWithSyntax = Node.create<HeadingWithSyntaxOptions>({
  name: 'heading',

  addOptions() {
    return {
      levels: [1, 2, 3, 4, 5, 6],
      HTMLAttributes: {}
    }
  },

  content: 'inline*',

  group: 'block',

  defining: true,

  addAttributes() {
    return {
      level: {
        default: 1,
        rendered: false
      }
    }
  },

  parseHTML() {
    return this.options.levels.map((level: number) => ({
      tag: `h${level}`,
      attrs: { level }
    }))
  },

  renderHTML({ node, HTMLAttributes }) {
    const level = node.attrs.level as number
    return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(HeadingView)
  },

  addInputRules() {
    return this.options.levels.map((level: number) =>
      textblockTypeInputRule({
        // Use exact match for heading level to avoid ambiguity
        // e.g., ## should only match H2, not H1
        find: new RegExp(`^(#{${level}})\\s$`),
        type: this.type,
        getAttributes: { level }
      })
    )
  },

  addKeyboardShortcuts() {
    return {
      ...this.options.levels.reduce(
        (shortcuts: Record<string, () => boolean>, level: number) => ({
          ...shortcuts,
          [`Mod-Alt-${level}`]: () => this.editor.commands.toggleHeading({ level: level as any })
        }),
        {}
      ),
      Backspace: () => {
        const { state } = this.editor
        const { $from } = state.selection

        // Only handle when cursor is at the start of a heading with empty content
        if (!this.editor.isActive('heading')) return false
        if ($from.parentOffset !== 0) return false
        if ($from.parent.textContent.length > 0) return false

        const currentLevel = $from.parent.attrs.level as number

        if (currentLevel > 1) {
          // Demote: H2 → H1, H3 → H2, etc.
          return this.editor.commands.setHeading({ level: (currentLevel - 1) as any })
        }

        // H1 → paragraph
        return this.editor.commands.setParagraph()
      }
    }
  }
})

// ============================================================================
// CodeBlockWithSyntax Extension
// ============================================================================

export interface CodeBlockWithSyntaxOptions {
  defaultLanguage: string
  HTMLAttributes: Record<string, any>
}

/**
 * Custom CodeBlock extension with ``` fence preview and language selector.
 */
export const CodeBlockWithSyntax = Node.create<CodeBlockWithSyntaxOptions>({
  name: 'codeBlock',

  addOptions() {
    return {
      defaultLanguage: 'plaintext',
      HTMLAttributes: {}
    }
  },

  content: 'text*',

  marks: '',

  group: 'block',

  code: true,

  defining: true,

  addAttributes() {
    return {
      language: {
        default: this.options.defaultLanguage,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-language') ||
          element.querySelector('code')?.className?.replace('language-', '') ||
          this.options.defaultLanguage,
        renderHTML: (attributes: Record<string, any>) => ({
          'data-language': attributes.language
        })
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full' as const
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      ['code', { class: `language-${node.attrs.language}` }, 0]
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),

      Tab: () => {
        if (this.editor.isActive('codeBlock')) {
          this.editor.commands.insertContent('  ')
          return true
        }
        return false
      },

      Enter: ({ editor }) => {
        if (!editor.isActive('codeBlock')) return false

        const { $from } = editor.state.selection
        const isAtEnd = $from.parentOffset === $from.parent.content.size
        const endsWithDoubleNewline = $from.parent.textContent.endsWith('\n\n')

        if (isAtEnd && endsWithDoubleNewline) {
          return editor
            .chain()
            .command(({ tr }) => {
              tr.delete($from.pos - 2, $from.pos)
              return true
            })
            .exitCode()
            .run()
        }

        return false
      }
    }
  }
})

// ============================================================================
// BlockquoteWithSyntax Extension
// ============================================================================

export interface BlockquoteWithSyntaxOptions {
  HTMLAttributes: Record<string, any>
}

/**
 * Custom Blockquote extension with `>` prefix preview.
 */
export const BlockquoteWithSyntax = Node.create<BlockquoteWithSyntaxOptions>({
  name: 'blockquote',

  addOptions() {
    return {
      HTMLAttributes: {}
    }
  },

  content: 'block+',

  group: 'block',

  defining: true,

  parseHTML() {
    return [{ tag: 'blockquote' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockquoteView)
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-b': () => this.editor.commands.toggleBlockquote()
    }
  }
})

// ============================================================================
// Re-exports
// ============================================================================

// LivePreview - Obsidian-style inline syntax preview
export { LivePreview } from './extensions/live-preview'
export type {
  LivePreviewOptions,
  MarkSyntax,
  MarkRange,
  InlineMarksPluginOptions
} from './extensions/live-preview'
export { MARK_SYNTAX, getSyntax, getEnabledMarks } from './extensions/live-preview'

// SlashCommand - Notion-style command palette
export { SlashCommand } from './extensions/slash-command'
export type { SlashCommandItem, SlashCommandGroup } from './extensions/slash-command'
export { COMMAND_GROUPS, getAllCommands, filterCommands } from './extensions/slash-command'

// DragHandle - Drag handle with block DnD and drop indicator
export { DragHandleExtension } from './extensions/drag-handle'
export type { DragHandleExtensionOptions } from './extensions/drag-handle'
export { DragHandle, DragHandlePluginKey } from './extensions/drag-handle'
export type { DragHandleOptions } from './extensions/drag-handle'
export { createDragDropPlugin, DragDropPluginKey } from './extensions/drag-handle'
export type { DragState } from './extensions/drag-handle'
export { createDropIndicatorPlugin, DropIndicatorPluginKey } from './extensions/drag-handle'

// KeyboardShortcuts - Shortcut definitions and extra bindings
export { KeyboardShortcutsExtension } from './extensions/keyboard-shortcuts'
export type { KeyboardShortcutsOptions } from './extensions/keyboard-shortcuts'
export {
  KEYBOARD_SHORTCUTS,
  getShortcutsByCategory,
  getShortcutById,
  getShortcutsMap,
  formatShortcut,
  isMac
} from './extensions/keyboard-shortcuts'
export type { KeyboardShortcut } from './extensions/keyboard-shortcuts'

// Mobile utilities
export {
  isMobile,
  isIOS,
  isAndroid,
  hapticFeedback,
  isTouchDevice,
  getSafeAreaInsets
} from './utils/mobile'

// Performance utilities
export {
  debounce,
  throttle,
  measure,
  measureAsync,
  requestIdle,
  cancelIdle
} from './utils/performance'
export type { MeasureResult } from './utils/performance'

// Accessibility utilities
export { ScreenReaderAnnouncer, createAnnouncer, createFocusTrap } from './accessibility'
export type {
  AnnouncerPriority,
  AnnounceOptions,
  FocusTrap,
  FocusTrapOptions
} from './accessibility'

// Toggle extension
export { ToggleExtension } from './extensions/toggle'
export type { ToggleOptions } from './extensions/toggle'

// Callout extension
export { CalloutExtension } from './extensions/callout'
export type { CalloutOptions } from './extensions/callout'
export { CALLOUT_CONFIGS } from './extensions/callout'
export type { CalloutType, CalloutConfig } from './extensions/callout'

// Image extension
export { ImageExtension } from './extensions/image'
export type { ImageOptions } from './extensions/image'
export { createImagePastePlugin, ImagePastePluginKey } from './extensions/image'
export type { ImagePastePluginOptions } from './extensions/image'

// File extension
export { FileExtension } from './extensions/file'
export type { FileExtensionOptions } from './extensions/file'
export { createFileDropPlugin, FileDropPluginKey } from './extensions/file'
export type { FileDropPluginOptions } from './extensions/file'
export { formatFileSize } from './extensions/file'

// Embed extension
export { EmbedExtension } from './extensions/embed'
export type { EmbedOptions } from './extensions/embed'
export { EMBED_PROVIDERS, detectProvider, parseEmbedUrl } from './extensions/embed'
export type { EmbedProvider } from './extensions/embed'
export { SmartReferenceExtension } from './extensions/smart-reference'
export type { SmartReferenceOptions } from './extensions/smart-reference'
export {
  parseSmartReferenceUrl,
  type SmartReference,
  type SmartReferenceKind
} from './extensions/smart-reference'
export {
  PageTaskItemExtension,
  collectPageTasks,
  ensurePageTaskAttrs,
  getPageTasksSnapshot
} from './extensions/page-tasks'
export type { PageTaskSnapshot, PageTaskReferenceSnapshot } from './extensions/page-tasks'
export { TaskMentionExtension, TaskDueDateExtension } from './extensions/task-metadata'
export type { TaskMentionSuggestion, TaskDueDateOptions } from './extensions/task-metadata'
export { formatTaskDueDateLabel, getCurrentTaskDueDate } from './extensions/task-metadata'
export { createGravatarUrl, md5 } from './utils/gravatar'

// Database embed extension
export { DatabaseEmbedExtension } from './extensions/database-embed'
export type { DatabaseEmbedOptions, DatabaseViewType } from './extensions/database-embed'
export { TaskViewEmbedExtension, DEFAULT_TASK_VIEW_CONFIG } from './extensions/task-view-embed'
export type {
  TaskViewEmbedOptions,
  TaskViewEmbedType,
  TaskViewConfig,
  TaskViewScope,
  TaskViewAssigneeFilter,
  TaskViewDueDateFilter,
  TaskViewStatusFilter
} from './extensions/task-view-embed'

// Mermaid diagram extension
export { MermaidExtension } from './extensions/mermaid'
export type { MermaidOptions, MermaidTheme, MermaidConfig } from './extensions/mermaid'
export { MERMAID_EXAMPLES, DEFAULT_MERMAID_CONFIG } from './extensions/mermaid'

// Comment extension
export {
  CommentMark,
  CommentPlugin,
  CommentPluginKey,
  setSelectedComment,
  getCommentsAtPosition
} from './extensions/comment'
export type { CommentMarkOptions, CommentPluginOptions } from './extensions/comment'
export {
  captureTextAnchor,
  resolveTextAnchor,
  restoreCommentMarks,
  isTextAnchorValid,
  uint8ArrayToBase64,
  base64ToUint8Array,
  useOrphanReattachment,
  recheckOrphanedAnchors
} from './extensions/comment'
export type {
  OrphanedComment,
  UseOrphanReattachmentOptions,
  UseOrphanReattachmentResult
} from './extensions/comment'

// Image upload service
export {
  uploadImage,
  validateImageFile,
  loadImageDimensions,
  compressImage,
  ALLOWED_IMAGE_TYPES
} from './services/image-upload'
export type { ImageUploadOptions, ImageUploadResult } from './services/image-upload'

// Testing / Benchmarks
export {
  benchmark,
  benchmarkAsync,
  generateLargeDocument,
  formatBenchmarkResults
} from './testing/benchmarks'
export type { BenchmarkResult, BenchmarkOptions } from './testing/benchmarks'

// Re-export commonly used Tiptap extensions for convenience
export { default as StarterKit } from '@tiptap/starter-kit'
export { default as Placeholder } from '@tiptap/extension-placeholder'
export { default as Collaboration } from '@tiptap/extension-collaboration'
export { default as TaskList } from '@tiptap/extension-task-list'
export { default as TaskItem } from '@tiptap/extension-task-item'
export { default as Link } from '@tiptap/extension-link'
export { default as Typography } from '@tiptap/extension-typography'
