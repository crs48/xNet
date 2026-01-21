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
import { EditorToolbar } from './EditorToolbar'
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
      // NOTE: Disable history - Collaboration has its own undo/redo via Yjs
      StarterKit.configure({
        history: false
      }),
      // Typography for smart quotes, em-dashes, ellipsis
      Typography,
      Placeholder.configure({
        placeholder
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
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[380px]'
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
    <div className={cn('border border-border rounded-lg overflow-hidden bg-bg', className)}>
      {showToolbar && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} className="p-4 min-h-[400px]" />
    </div>
  )
}
