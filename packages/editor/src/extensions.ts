/**
 * @xnetjs/editor - Tiptap extensions
 *
 * Custom extensions for the xNet editor.
 */
import {
  Mark,
  Node,
  mergeAttributes,
  markInputRule,
  textblockTypeInputRule,
  wrappingInputRule
} from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
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
const wikilinkClickPluginKey = new PluginKey('wikilinkClick')

/**
 * Markdown form: `[[target|label]]` when the link carries an explicit
 * target (node id or xnet:// URI from the `[[` typeahead / drop chips),
 * legacy `[[title]]` when the href is just the derived title slug.
 */
const wikilinkTokenRegex = /^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/

function getWikilinkTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Markdown source for a wikilink mark (exported for tests). `title` is
 * the stable attribute used to detect legacy slug hrefs; `text` is the
 * rendered link text (the markdown bridge passes a placeholder that it
 * substitutes with the real children afterwards).
 */
export function serializeWikilink(href: unknown, title: string, text = title): string {
  const target = getWikilinkTitle(href)
  if (!target || target === generatePageId(title)) return `[[${text}]]`
  return `[[${target}|${text}]]`
}

/** Tokenize `[[target]]` / `[[target|label]]` (exported for tests). */
export function tokenizeWikilink(src: string) {
  const match = src.match(wikilinkTokenRegex)
  if (!match) return undefined

  const target = getWikilinkTitle(match[1])
  const alias = getWikilinkTitle(match[2] ?? '')
  if (!target) return undefined

  const text = alias || target
  return {
    type: 'wikilink',
    raw: match[0],
    text,
    href: alias ? target : generatePageId(target),
    tokens: [{ type: 'text', raw: text, text }]
  }
}

function findWikilinkAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null

  const anchor = target.closest('a[data-wikilink]')
  return anchor instanceof HTMLAnchorElement ? anchor : null
}

/**
 * Wikilink extension for Tiptap
 *
 * Adds support for [[page-name]] style wikilinks.
 * When typed, converts to a clickable link that navigates within the app.
 */
export const Wikilink = Mark.create<WikilinkOptions>({
  name: 'wikilink',

  priority: 1100,

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

  markdownTokenizer: {
    name: 'wikilink',
    level: 'inline' as const,
    start: (src: string) => src.indexOf('[['),
    tokenize: (src: string) => tokenizeWikilink(src)
  },

  parseMarkdown: (token, helpers) => {
    const title = getWikilinkTitle(token.text)
    if (!title) return []

    const href = getWikilinkTitle((token as { href?: unknown }).href) || generatePageId(title)
    return helpers.applyMark('wikilink', [helpers.createTextNode(title)], { href, title })
  },

  renderMarkdown: (node, helpers) => {
    const text = helpers.renderChildren(node) || getWikilinkTitle(node.attrs?.title)
    const title = getWikilinkTitle(node.attrs?.title) || text
    return serializeWikilink(node.attrs?.href, title, text)
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
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: wikilinkClickPluginKey,
        props: {
          handleClick: (_view, _pos, event) => {
            const anchor = findWikilinkAnchor(event.target)
            const href = anchor?.getAttribute('href')?.trim()
            if (!href) return false

            event.preventDefault()
            this.options.onNavigate(href)
            return true
          }
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

function toBoundedHeadingLevel(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 1

  return Math.min(Math.max(Math.trunc(numeric), 1), 6)
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

  parseMarkdown: (token, helpers) =>
    helpers.createNode(
      'heading',
      { level: token.depth || 1 },
      helpers.parseInline(token.tokens || [])
    ),

  renderMarkdown: (node, helpers) => {
    const level = toBoundedHeadingLevel(node.attrs?.level)
    const prefix = '#'.repeat(level)
    const content = node.content ? helpers.renderChildren(node.content) : ''

    return `${prefix} ${content}`.trimEnd()
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

  addCommands() {
    return {
      setHeading:
        (attributes: { level: number }) =>
        ({ commands }) => {
          if (!this.options.levels.includes(attributes.level)) {
            return false
          }

          return commands.setNode(this.name, { level: attributes.level })
        },
      toggleHeading:
        (attributes: { level: number }) =>
        ({ editor, commands }) => {
          if (!this.options.levels.includes(attributes.level)) {
            return false
          }

          if (editor.isActive(this.name, { level: attributes.level })) {
            return commands.setParagraph()
          }

          return commands.setNode(this.name, { level: attributes.level })
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      ...this.options.levels.reduce(
        (shortcuts: Record<string, () => boolean>, level: number) => ({
          ...shortcuts,
          [`Mod-Alt-${level}`]: () =>
            this.editor.isActive('heading', { level })
              ? this.editor.commands.setParagraph()
              : this.editor.commands.setNode('heading', { level })
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
          return this.editor.commands.setNode('heading', { level: currentLevel - 1 })
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

  markdownTokenName: 'code',

  parseMarkdown: (token, helpers) => {
    if (token.raw?.startsWith('```') === false && token.codeBlockStyle !== 'indented') {
      return []
    }

    return helpers.createNode(
      'codeBlock',
      { language: token.lang || 'plaintext' },
      token.text ? [helpers.createTextNode(token.text)] : []
    )
  },

  renderMarkdown: (node, helpers) => {
    const language = node.attrs?.language === 'plaintext' ? '' : node.attrs?.language || ''
    const content = node.content ? helpers.renderChildren(node.content) : ''

    return [`\`\`\`${language}`, content, '```'].join('\n')
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },

  addCommands() {
    return {
      setCodeBlock:
        (attributes?: { language: string }) =>
        ({ commands }) =>
          commands.setNode(this.name, attributes),
      toggleCodeBlock:
        (attributes?: { language: string }) =>
        ({ commands }) =>
          commands.toggleNode(this.name, 'paragraph', attributes)
    }
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([A-Za-z0-9_-]+)?\s$/,
        type: this.type,
        getAttributes: (match) => ({
          language: match[1] || this.options.defaultLanguage
        })
      })
    ]
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

  parseMarkdown: (token, helpers) =>
    helpers.createNode('blockquote', undefined, helpers.parseChildren(token.tokens || [])),

  renderMarkdown: (node, helpers) => {
    if (!node.content) {
      return ''
    }

    return node.content
      .map((child) =>
        helpers
          .renderChildren([child])
          .split('\n')
          .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
          .join('\n')
      )
      .join('\n>\n')
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockquoteView)
  },

  addCommands() {
    return {
      setBlockquote:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
      toggleBlockquote:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      unsetBlockquote:
        () =>
        ({ commands }) =>
          commands.lift(this.name)
    }
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\s*>\s$/,
        type: this.type
      })
    ]
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

// Markdown import/export bridge
export { Markdown as TiptapMarkdown } from '@tiptap/markdown'

// LivePreview - Obsidian-style inline syntax preview
export { LivePreview } from './extensions/live-preview'
export type {
  LivePreviewOptions,
  MarkSyntax,
  MarkRange,
  InlineMarksPluginOptions
} from './extensions/live-preview'
export { MARK_SYNTAX, getSyntax, getEnabledMarks } from './extensions/live-preview'
export {
  MarkdownStructuralEditing,
  runMarkdownStructuralBackspace
} from './extensions/markdown-structural-editing'
export type { HeadingLevel } from './extensions/markdown-structural-editing'
export {
  MarkdownClipboard,
  isMarkdownClipboardCandidate,
  markdownClipboardPluginKey
} from './extensions/markdown-clipboard'
export {
  MARKDOWN_TOKEN_CONTRACTS,
  MARKDOWN_TOKEN_TEST_MATRIX,
  getMarkdownTokenContract
} from './extensions/markdown-token-contract'
export type {
  MarkdownTokenBehavior,
  MarkdownTokenContract,
  MarkdownTokenKind,
  MarkdownTokenRevealPolicy,
  MarkdownTokenTestCase
} from './extensions/markdown-token-contract'

// SlashCommand - Notion-style command palette
export { SlashCommand } from './extensions/slash-command'
export type { SlashCommandItem, SlashCommandGroup } from './extensions/slash-command'
export { COMMAND_GROUPS, getAllCommands, filterCommands } from './extensions/slash-command'

// AI in the editor (exploration 0194 Phase 3) — provider-agnostic transforms.
export {
  AI_INTENTS,
  applyAiTransform,
  previewAiTransform,
  acceptAiTransform,
  createAiSlashCommands,
  selectedText
} from './extensions/ai/ai-commands'
export type {
  AiIntent,
  AiIntentSpec,
  AiTransformRequest,
  AiTransformFn,
  AiCommandDeps,
  AiTransformPreview,
  AiEditorLike,
  AiEditorChain
} from './extensions/ai/ai-commands'

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
export { RichLinkExtension, RichLinkNodeView } from './extensions/rich-link'
export type { RichLinkOptions } from './extensions/rich-link'
export { PageEmbedExtension, PageEmbedNodeView } from './extensions/page-embed'
export type { PageEmbedAttrs, PageEmbedOptions, SetPageEmbedOptions } from './extensions/page-embed'
export { SmartReferenceExtension } from './extensions/smart-reference'
export type {
  SmartReferenceOptions,
  UpdateSmartReferenceOptions
} from './extensions/smart-reference'
export {
  parseSmartReferenceUrl,
  type SmartReference,
  type SmartReferenceKind
} from './extensions/smart-reference'
export { DatabaseReferenceExtension } from './extensions/database-reference'
export type {
  DatabaseReferenceAttrs,
  DatabaseReferenceOptions,
  SetDatabaseReferenceOptions
} from './extensions/database-reference'
export {
  PageTaskItemExtension,
  collectPageTasks,
  ensurePageTaskAttrs,
  getPageTasksSnapshot
} from './extensions/page-tasks'
export type { PageTaskSnapshot, PageTaskReferenceSnapshot } from './extensions/page-tasks'
export { TaskMentionExtension, TaskDueDateExtension } from './extensions/task-metadata'
export type { TaskMentionSuggestion, TaskDueDateOptions } from './extensions/task-metadata'
export {
  CREATE_HASHTAG_ID,
  HashtagExtension,
  filterHashtagSuggestions,
  hashtagFromMenuItem,
  type HashtagOptions,
  type HashtagSuggestion
} from './extensions/hashtag'
export {
  CREATE_WIKILINK_ID,
  WikilinkSuggestionExtension,
  buildWikilinkMenuItems,
  endAfterClosingBrackets,
  matchWikilinkTargets,
  parseWikilinkQuery,
  wikilinkInsertContent,
  type WikilinkQueryParts,
  type WikilinkSuggestionOptions,
  type WikilinkTarget
} from './extensions/wikilink-suggestion'
export { LinkTargetMenu, wikilinkKindIcon } from './components/LinkTargetMenu'
export type { WikilinkMenuItem, LinkTargetMenuRef } from './components/LinkTargetMenu'
export {
  createSuggestionPopupRender,
  updateSuggestionPopup,
  type SuggestionMenuProps,
  type SuggestionMenuRef
} from './extensions/suggestion-popup'
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

// AI provenance badge (exploration 0234, Charter §Agency)
export { AiGeneratedMark, aiGeneratedTitle } from './extensions/ai-generated'
export type {
  AiGeneratedMarkOptions,
  AiGeneratedAttrs,
  AiProvenanceMode,
  AiCitation
} from './extensions/ai-generated'

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
