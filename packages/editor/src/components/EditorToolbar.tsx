/**
 * EditorToolbar - Formatting toolbar for the Tiptap editor
 */
import type { JSX } from 'react'
import type { Editor } from '@tiptap/react'

export interface EditorToolbarProps {
  /** The Tiptap editor instance */
  editor: Editor | null
  /** Additional CSS class */
  className?: string
}

/**
 * Editor toolbar component with formatting buttons.
 *
 * Provides buttons for:
 * - Text formatting (bold, italic, strikethrough, code)
 * - Headings (H1, H2, H3)
 * - Lists (bullet, numbered, task)
 * - Blocks (quote, code block, horizontal rule)
 *
 * @example
 * ```tsx
 * import { EditorToolbar } from '@xnet/editor/react'
 * import { useEditor } from '@tiptap/react'
 *
 * function MyEditor() {
 *   const editor = useEditor({ ... })
 *   return (
 *     <div>
 *       <EditorToolbar editor={editor} />
 *       <EditorContent editor={editor} />
 *     </div>
 *   )
 * }
 * ```
 */
export function EditorToolbar({ editor, className }: EditorToolbarProps): JSX.Element | null {
  if (!editor) return null

  return (
    <div className={`editor-toolbar ${className || ''}`}>
      {/* Text formatting */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'active' : ''}
        title="Bold (Cmd+B)"
        type="button"
      >
        <strong>B</strong>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'active' : ''}
        title="Italic (Cmd+I)"
        type="button"
      >
        <em>I</em>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? 'active' : ''}
        title="Strikethrough"
        type="button"
      >
        <s>S</s>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={editor.isActive('code') ? 'active' : ''}
        title="Inline Code"
        type="button"
      >
        {'</>'}
      </button>

      <span className="toolbar-divider" />

      {/* Headings */}
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={editor.isActive('heading', { level: 1 }) ? 'active' : ''}
        title="Heading 1"
        type="button"
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
        title="Heading 2"
        type="button"
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}
        title="Heading 3"
        type="button"
      >
        H3
      </button>

      <span className="toolbar-divider" />

      {/* Lists */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? 'active' : ''}
        title="Bullet List"
        type="button"
      >
        &bull;
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? 'active' : ''}
        title="Numbered List"
        type="button"
      >
        1.
      </button>
      <button
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={editor.isActive('taskList') ? 'active' : ''}
        title="Task List"
        type="button"
      >
        &#9744;
      </button>

      <span className="toolbar-divider" />

      {/* Blocks */}
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive('blockquote') ? 'active' : ''}
        title="Quote"
        type="button"
      >
        &ldquo;
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? 'active' : ''}
        title="Code Block"
        type="button"
      >
        {'{ }'}
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
        type="button"
      >
        &mdash;
      </button>
    </div>
  )
}
