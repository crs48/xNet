/**
 * EditorToolbar - Formatting toolbar for the Tiptap editor
 */
import type { Editor } from '@tiptap/react'
import type { JSX } from 'react'
import { cn } from '../utils'

export interface EditorToolbarProps {
  /** The Tiptap editor instance */
  editor: Editor | null
  /** Additional CSS class */
  className?: string
}

const toolbarButtonBase =
  'px-2.5 py-1.5 border-none bg-transparent rounded cursor-pointer text-sm min-w-[32px] flex items-center justify-center text-foreground hover:bg-secondary transition-colors'

const toolbarButtonActive = 'bg-primary text-primary-foreground hover:bg-primary/90'

/**
 * Editor toolbar component with formatting buttons.
 *
 * Provides buttons for:
 * - Text formatting (bold, italic, strikethrough, code)
 * - Headings (H1, H2, H3)
 * - Lists (bullet, numbered, task)
 * - Blocks (quote, code block, horizontal rule)
 */
export function EditorToolbar({ editor, className }: EditorToolbarProps): JSX.Element | null {
  if (!editor) return null

  return (
    <div
      className={cn(
        'flex items-center gap-1 p-2 bg-secondary border-b border-border flex-wrap',
        className
      )}
    >
      {/* Text formatting */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn(toolbarButtonBase, editor.isActive('bold') && toolbarButtonActive)}
        title="Bold (Cmd+B)"
        type="button"
      >
        <strong>B</strong>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn(toolbarButtonBase, editor.isActive('italic') && toolbarButtonActive)}
        title="Italic (Cmd+I)"
        type="button"
      >
        <em>I</em>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={cn(toolbarButtonBase, editor.isActive('strike') && toolbarButtonActive)}
        title="Strikethrough"
        type="button"
      >
        <s>S</s>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={cn(toolbarButtonBase, editor.isActive('code') && toolbarButtonActive)}
        title="Inline Code"
        type="button"
      >
        {'</>'}
      </button>

      <span className="w-px h-6 bg-border mx-2" />

      {/* Headings */}
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={cn(
          toolbarButtonBase,
          editor.isActive('heading', { level: 1 }) && toolbarButtonActive
        )}
        title="Heading 1"
        type="button"
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={cn(
          toolbarButtonBase,
          editor.isActive('heading', { level: 2 }) && toolbarButtonActive
        )}
        title="Heading 2"
        type="button"
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={cn(
          toolbarButtonBase,
          editor.isActive('heading', { level: 3 }) && toolbarButtonActive
        )}
        title="Heading 3"
        type="button"
      >
        H3
      </button>

      <span className="w-px h-6 bg-border mx-2" />

      {/* Lists */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={cn(toolbarButtonBase, editor.isActive('bulletList') && toolbarButtonActive)}
        title="Bullet List"
        type="button"
      >
        &bull;
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={cn(toolbarButtonBase, editor.isActive('orderedList') && toolbarButtonActive)}
        title="Numbered List"
        type="button"
      >
        1.
      </button>
      <button
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={cn(toolbarButtonBase, editor.isActive('taskList') && toolbarButtonActive)}
        title="Task List"
        type="button"
      >
        &#9744;
      </button>

      <span className="w-px h-6 bg-border mx-2" />

      {/* Blocks */}
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={cn(toolbarButtonBase, editor.isActive('blockquote') && toolbarButtonActive)}
        title="Quote"
        type="button"
      >
        &ldquo;
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={cn(toolbarButtonBase, editor.isActive('codeBlock') && toolbarButtonActive)}
        title="Code Block"
        type="button"
      >
        {'{ }'}
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={cn(toolbarButtonBase)}
        title="Horizontal Rule"
        type="button"
      >
        &mdash;
      </button>
    </div>
  )
}
