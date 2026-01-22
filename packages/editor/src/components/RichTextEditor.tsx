/**
 * RichTextEditor - Tiptap-based rich text editor with Yjs collaboration
 */
import { useEffect, type JSX } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Typography from '@tiptap/extension-typography'
import type * as Y from 'yjs'
import { Wikilink, LivePreview } from '../extensions'
import { FloatingToolbar, type ToolbarMode } from './FloatingToolbar'
import { cn } from '../utils'

export interface RichTextEditorProps {
  /** The Yjs document to bind to */
  ydoc: Y.Doc
  /** The name of the Y.XmlFragment field to use (default: 'content') */
  field?: string
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether to show the toolbar (default: true) */
  showToolbar?: boolean
  /**
   * Toolbar display mode
   * - 'auto': Detect based on device (default)
   * - 'desktop': Always floating bubble menu (Electron)
   * - 'mobile': Always fixed bottom bar (Expo)
   */
  toolbarMode?: ToolbarMode
  /** Callback when a wikilink is clicked */
  onNavigate?: (docId: string) => void
  /** Additional CSS class for the container */
  className?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
}

/**
 * Rich text editor component with collaborative editing support.
 *
 * Uses Tiptap with Yjs for conflict-free collaboration.
 * Supports Markdown-style shortcuts like Notion:
 *
 * **Text Formatting:**
 * - `**text**` → **bold**
 * - `*text*` or `_text_` → *italic*
 * - `~~text~~` → ~~strikethrough~~
 * - `` `code` `` → `inline code`
 *
 * **Headings:**
 * - `# ` → Heading 1
 * - `## ` → Heading 2
 * - `### ` → Heading 3
 *
 * **Lists:**
 * - `- ` or `* ` → Bullet list
 * - `1. ` → Numbered list
 * - `[] ` → Task list
 *
 * **Blocks:**
 * - `> ` → Blockquote
 * - `---` → Horizontal rule
 * - ``` ``` ``` → Code block
 *
 * **Links:**
 * - `[[page name]]` → Wikilink
 *
 * @example
 * ```tsx
 * import { RichTextEditor } from '@xnet/editor/react'
 *
 * function MyEditor({ document }) {
 *   return (
 *     <RichTextEditor
 *       ydoc={document.ydoc}
 *       field="content"
 *       placeholder="Start writing..."
 *       onNavigate={(docId) => navigate(`/doc/${docId}`)}
 *     />
 *   )
 * }
 * ```
 */
export function RichTextEditor({
  ydoc,
  field = 'content',
  placeholder = 'Start writing...',
  showToolbar = true,
  toolbarMode = 'auto',
  onNavigate,
  className,
  readOnly = false
}: RichTextEditorProps): JSX.Element {
  // Get or create the content fragment for Yjs collaboration
  const fragment = ydoc.getXmlFragment(field)

  const editor = useEditor({
    extensions: [
      // StarterKit includes: Bold, Italic, Strike, Code, Heading, Blockquote,
      // BulletList, OrderedList, ListItem, CodeBlock, HardBreak, HorizontalRule
      // All with Markdown shortcuts enabled (e.g., **bold**, *italic*, # Heading)
      // Note: Tiptap v3 StarterKit doesn't include history - Collaboration uses Yjs undo/redo
      StarterKit,
      // Typography for smart quotes, em-dashes, ellipsis
      Typography,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty'
      }),
      Collaboration.configure({
        fragment
      }),
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary hover:underline cursor-pointer'
        }
      }),
      Wikilink.configure({
        onNavigate: onNavigate || (() => {})
      }),
      // Obsidian-style live preview - shows markdown syntax when cursor is on formatted text
      LivePreview
    ],
    editorProps: {
      attributes: {
        // Full height, no outline on focus, proper typography
        class: 'outline-none h-full min-h-full'
      }
    },
    editable: !readOnly
  })

  // Update editable state when readOnly changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly)
    }
  }, [editor, readOnly])

  // Clean up editor on unmount
  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  return (
    <div className={cn('relative h-full flex flex-col', className)}>
      <EditorContent
        editor={editor}
        className={cn(
          'flex-1 h-full',
          // ProseMirror sizing
          '[&_.ProseMirror]:h-full [&_.ProseMirror]:px-1',
          // Remove all focus outlines
          '[&_.ProseMirror]:outline-none [&_.ProseMirror:focus]:outline-none',
          '[&_.tiptap]:outline-none [&_.tiptap:focus]:outline-none',
          '[&_[contenteditable]]:outline-none [&_[contenteditable]:focus]:outline-none',
          // Placeholder styling
          '[&_.ProseMirror_.is-empty]:before:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_.is-empty]:before:text-text-secondary',
          '[&_.ProseMirror_.is-empty]:before:float-left',
          '[&_.ProseMirror_.is-empty]:before:pointer-events-none',
          '[&_.ProseMirror_.is-empty]:before:h-0'
        )}
      />
      {showToolbar && <FloatingToolbar editor={editor} mode={toolbarMode} />}
    </div>
  )
}
