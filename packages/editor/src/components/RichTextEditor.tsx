/**
 * RichTextEditor - Tiptap-based rich text editor with Yjs collaboration
 */
import { useEffect, type JSX } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import { yCursorPlugin, yCursorPluginKey, ySyncPluginKey } from 'y-prosemirror'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Typography from '@tiptap/extension-typography'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { Wikilink, LivePreview } from '../extensions'
import { FloatingToolbar, type ToolbarMode } from './FloatingToolbar'
import '../editor.css'
import { cn } from '../utils'

/**
 * Generate a deterministic cursor color from a DID string.
 * Returns a 6-digit hex color (required by y-prosemirror's yCursorPlugin).
 */
function generateCursorColor(did: string): string {
  let hash = 0
  for (let i = 0; i < did.length; i++) {
    hash = did.charCodeAt(i) + ((hash << 5) - hash)
  }
  // Convert hash to a vibrant hex color
  const hue = Math.abs(hash % 360)
  // HSL to RGB conversion for s=70%, l=50%
  const s = 0.7
  const l = 0.5
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0,
    g = 0,
    b = 0
  if (hue < 60) {
    r = c
    g = x
    b = 0
  } else if (hue < 120) {
    r = x
    g = c
    b = 0
  } else if (hue < 180) {
    r = 0
    g = c
    b = x
  } else if (hue < 240) {
    r = 0
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    g = 0
    b = c
  } else {
    r = c
    g = 0
    b = x
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

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
  /** Yjs Awareness instance for cursor presence (optional) */
  awareness?: Awareness
  /** Local user's DID for cursor color/label (optional) */
  did?: string
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
  readOnly = false,
  awareness,
  did
}: RichTextEditorProps): JSX.Element {
  // Get or create the content fragment for Yjs collaboration
  const fragment = ydoc.getXmlFragment(field)

  // Build extensions list (without cursor - added dynamically when awareness is available)
  const extensions = [
    StarterKit.configure({
      undoRedo: false,
      link: false
    }),
    Typography,
    Placeholder.configure({
      placeholder,
      emptyEditorClass: 'is-editor-empty'
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
    LivePreview
  ]

  const editor = useEditor({
    extensions,
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

  // Add cursor plugin dynamically when awareness becomes available.
  // We use yCursorPlugin directly (instead of CollaborationCursor extension) to avoid
  // the render-phase setState that occurs when the extension calls setLocalStateField
  // during useEditor initialization.
  //
  // We must wait for the ySyncPlugin to be initialized (which requires the editor view
  // to be created), because yCursorPlugin's init reads ySyncPlugin state.
  useEffect(() => {
    if (!editor || !awareness) return

    // Wait for editor view to be ready and ySyncPlugin to be initialized.
    // TipTap v3 may not have the view ready on the first effect run.
    const tryRegister = () => {
      // Check if ySyncPlugin is in the editor state
      const syncState = ySyncPluginKey.getState(editor.state)
      if (!syncState) {
        // Not ready yet, try again on next frame
        rafId = requestAnimationFrame(tryRegister)
        return
      }

      // Set local user state for cursor display
      awareness.setLocalStateField('user', {
        name: did ? `${did.slice(8, 16)}...` : 'Anonymous',
        color: did ? generateCursorColor(did) : '#999999'
      })

      const plugin = yCursorPlugin(awareness, {
        cursorBuilder: (user: { name: string; color: string }) => {
          const cursor = document.createElement('span')
          cursor.classList.add('collaboration-cursor__caret')
          cursor.setAttribute('style', `border-color: ${user.color}`)
          const label = document.createElement('div')
          label.classList.add('collaboration-cursor__label')
          label.setAttribute('style', `background-color: ${user.color}`)
          label.insertBefore(document.createTextNode(user.name), null)
          cursor.insertBefore(label, null)
          return cursor
        }
      })

      editor.registerPlugin(plugin)
      registered = true

      // Force a view update to trigger updateCursorInfo in the plugin's view.
      // Without this, the cursor position won't be broadcast until the user
      // moves the cursor or types (since focusin already happened before plugin registration).
      if (editor.view.hasFocus()) {
        const { tr } = editor.state
        editor.view.dispatch(tr)
      }
    }

    let rafId: number | undefined
    let registered = false
    tryRegister()

    return () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      if (registered) editor.unregisterPlugin(yCursorPluginKey)
    }
  }, [editor, awareness, did])

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
          // Placeholder class - styles defined in editor.css
          'xnet-editor'
        )}
      />
      {showToolbar && <FloatingToolbar editor={editor} mode={toolbarMode} />}
    </div>
  )
}
