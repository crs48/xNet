/**
 * RichTextEditor - Tiptap-based rich text editor with Yjs collaboration
 */
import type { DatabaseViewType, SlashCommandItem } from '../extensions'
import type { AnyExtension } from '@tiptap/core'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import Collaboration from '@tiptap/extension-collaboration'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Typography from '@tiptap/extension-typography'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { yCursorPlugin, yCursorPluginKey, ySyncPluginKey } from '@tiptap/y-tiptap'
import * as React from 'react'
import { useEffect, type JSX } from 'react'
import {
  Wikilink,
  LivePreview,
  HeadingWithSyntax,
  CodeBlockWithSyntax,
  BlockquoteWithSyntax,
  SlashCommand,
  DragHandleExtension,
  KeyboardShortcutsExtension,
  ImageExtension,
  CalloutExtension,
  ToggleExtension,
  FileExtension,
  EmbedExtension,
  DatabaseEmbedExtension
} from '../extensions'
import { FloatingToolbar, type ToolbarMode } from './FloatingToolbar'
import '../styles/editor.css'
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
  const hue = Math.abs(hash % 360)
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

// --- DID Avatar generation (matches @xnet/ui DIDAvatar, but as raw SVG string) ---

function hashDID(did: string): number[] {
  const bytes: number[] = []
  let hash = 0
  for (let i = 0; i < did.length; i++) {
    hash = ((hash << 5) - hash + did.charCodeAt(i)) | 0
  }
  for (let i = 0; i < 32; i++) {
    hash = ((hash << 13) ^ hash) | 0
    hash = (hash * 0x5bd1e995) | 0
    hash = (hash ^ (hash >> 15)) | 0
    bytes.push(Math.abs(hash) % 256)
  }
  return bytes
}

function colorFromBytes(bytes: number[], offset: number): string {
  const hue = (bytes[offset % bytes.length] * 360) / 256
  const sat = 50 + (bytes[(offset + 1) % bytes.length] % 30)
  const lit = 45 + (bytes[(offset + 2) % bytes.length] % 20)
  return `hsl(${Math.round(hue)}, ${sat}%, ${lit}%)`
}

function generatePattern(bytes: number[]): boolean[] {
  const grid: boolean[] = new Array(25).fill(false)
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const byteIdx = row * 3 + col + 5
      const filled = bytes[byteIdx % bytes.length] > 128
      grid[row * 5 + col] = filled
      grid[row * 5 + (4 - col)] = filled
    }
  }
  return grid
}

/** Generate a DID identicon as an SVG data URI for use in an <img> element */
function generateAvatarDataURI(did: string, size: number): string {
  const bytes = hashDID(did)
  const bgColor = colorFromBytes(bytes, 0)
  const fgColor = colorFromBytes(bytes, 3)
  const pattern = generatePattern(bytes)
  const padding = size * 0.1
  const innerSize = size - padding * 2
  const innerCellSize = innerSize / 5

  let rects = ''
  for (let idx = 0; idx < 25; idx++) {
    if (!pattern[idx]) continue
    const row = Math.floor(idx / 5)
    const col = idx % 5
    const rx = innerCellSize * 0.15
    rects += `<rect x="${padding + col * innerCellSize}" y="${padding + row * innerCellSize}" width="${innerCellSize}" height="${innerCellSize}" fill="${fgColor}" rx="${rx}"/>`
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${bgColor}"/>${rects}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * Toolbar item contribution from plugins
 */
export interface ToolbarItemContribution {
  /** Icon name (Lucide) or React component */
  icon: string | React.ComponentType
  /** Tooltip/title text */
  title: string
  /** Toolbar section: format, insert, block, or custom */
  group?: 'format' | 'insert' | 'block' | 'custom'
  /** Check if button should appear active */
  isActive?: (editor: Editor) => boolean
  /** Button click handler */
  action: (editor: Editor) => void
  /** Keyboard shortcut display (e.g., 'Mod-Shift-H') */
  shortcut?: string
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
  /**
   * Image upload handler. When provided, enables paste/drop image upload.
   * Called with the File; should return a resolved src URL and optional dimensions.
   */
  onImageUpload?: (file: File) => Promise<{
    src: string
    width?: number
    height?: number
    cid?: string
  }>
  /**
   * File upload handler. When provided, enables file drag-and-drop and the File slash command.
   * Called with the File; should return the stored file metadata.
   */
  onFileUpload?: (file: File) => Promise<{
    cid: string
    name: string
    mimeType: string
    size: number
  }>
  /**
   * File download handler. Given file metadata, returns a download URL.
   */
  onFileDownload?: (attrs: {
    cid: string
    name: string
    mimeType: string
    size: number
  }) => Promise<string>
  /**
   * Database selection handler. Shows a picker and returns the selected database ID.
   */
  onSelectDatabase?: () => Promise<string | null>
  /**
   * Database metadata resolver. Given a database ID, returns its title and icon.
   */
  resolveDatabaseMeta?: (databaseId: string) => Promise<{
    title: string
    icon?: string
  } | null>
  /**
   * Custom renderer for database views. Receives database ID, view type, and config.
   * If not provided, a placeholder is shown.
   */
  renderDatabaseView?: (props: {
    databaseId: string
    viewType: DatabaseViewType
    viewConfig: Record<string, unknown>
  }) => React.ReactNode
  /**
   * Additional TipTap extensions from plugins.
   * These are merged with the built-in extensions.
   */
  extensions?: AnyExtension[]
  /**
   * Additional toolbar items from plugins.
   * These are added to the floating toolbar.
   */
  toolbarItems?: ToolbarItemContribution[]
  /**
   * Custom slash commands from plugins.
   * When provided, these replace the default built-in commands.
   * Use useSlashCommands() to merge built-in + plugin commands.
   */
  slashCommands?: SlashCommandItem[]
  /**
   * Callback when the editor is ready. Provides the TipTap editor instance
   * for advanced integrations like comment system.
   */
  onEditorReady?: (editor: Editor) => void
  /**
   * Comment creation handler. When provided, shows a Comment button in the toolbar.
   * Called with anchor data when user clicks Comment; should return the new comment ID.
   * The editor will then apply the comment mark to the selection.
   */
  onCreateComment?: (anchorData: string) => Promise<string | null>
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
  did,
  onImageUpload,
  onFileUpload,
  onFileDownload,
  onSelectDatabase,
  resolveDatabaseMeta,
  renderDatabaseView,
  extensions: additionalExtensions = [],
  toolbarItems: additionalToolbarItems = [],
  slashCommands,
  onEditorReady,
  onCreateComment
}: RichTextEditorProps): JSX.Element {
  // Get or create the content fragment for Yjs collaboration
  const fragment = ydoc.getXmlFragment(field)

  // Build extensions list (without cursor - added dynamically when awareness is available)
  const builtinExtensions: AnyExtension[] = [
    StarterKit.configure({
      undoRedo: false,
      link: false,
      // Disable default heading, codeBlock, blockquote - we use custom NodeViews
      heading: false,
      codeBlock: false,
      blockquote: false,
      // Disable default dropcursor - we use our own drop indicator
      dropcursor: false
    }),
    // Custom block NodeViews with syntax preview
    HeadingWithSyntax.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    CodeBlockWithSyntax,
    BlockquoteWithSyntax,
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
    // Obsidian-style inline syntax preview
    LivePreview.configure({
      marks: ['bold', 'italic', 'strike', 'code'],
      links: true
    }),
    // Slash command palette (with optional custom commands)
    SlashCommand.configure({
      commands: slashCommands
    }),
    // Drag handle with block drag-and-drop
    DragHandleExtension.configure({
      enableDragDrop: !readOnly,
      showDropIndicator: !readOnly
    }),
    // Extra keyboard shortcuts (Mod-e, Mod-k, Mod-\, etc.)
    KeyboardShortcutsExtension,
    // Image extension with paste/drop upload
    ImageExtension.configure({
      onUpload: onImageUpload
    }),
    // Callout blocks (info, tip, warning, etc.)
    CalloutExtension,
    // Toggle blocks (collapsible sections)
    ToggleExtension,
    // File attachments with drag-and-drop upload
    FileExtension.configure({
      onUpload: onFileUpload,
      onDownload: onFileDownload
    }),
    // Media embeds (YouTube, Spotify, Vimeo, etc.)
    EmbedExtension,
    // Database embeds (inline table/board/list views)
    DatabaseEmbedExtension.configure({
      onSelectDatabase,
      renderView: renderDatabaseView,
      resolveDatabaseMeta
    }),
    // Plugin-provided extensions (includes Mermaid when plugin is installed)
    ...additionalExtensions
  ]

  const editor = useEditor({
    extensions: builtinExtensions,
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

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor)
    }
  }, [editor, onEditorReady])

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

      // Set local user state for cursor display (only if not already set by provider)
      const existingUser = awareness.getLocalState()?.user as
        | { name?: string; color?: string; did?: string }
        | undefined
      if (!existingUser?.name || !existingUser?.color) {
        awareness.setLocalStateField('user', {
          did: did || undefined,
          name: did ? `${did.slice(8, 16)}...` : 'Anonymous',
          color: did ? generateCursorColor(did) : '#999999'
        })
      }

      const plugin = yCursorPlugin(awareness, {
        // Only show cursors for remote clients, not our own
        awarenessStateFilter: (currentClientId: number, userClientId: number) => {
          return currentClientId !== userClientId
        },
        cursorBuilder: (user: { name: string; color: string; did?: string }, clientId: number) => {
          const cursor = document.createElement('span')
          cursor.classList.add('collaboration-cursor__caret')
          cursor.setAttribute('style', `border-color: ${user.color}`)
          cursor.dataset.clientId = String(clientId)

          const label = document.createElement('div')
          label.classList.add('collaboration-cursor__label')
          label.setAttribute('style', `background-color: ${user.color}`)

          // Add DID avatar if available (user.did comes from remote awareness state)
          const userDid = user.did
          if (userDid) {
            const avatar = document.createElement('img')
            avatar.src = generateAvatarDataURI(userDid, 16)
            avatar.setAttribute(
              'style',
              'width: 14px; height: 14px; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 4px;'
            )
            label.appendChild(avatar)
          }

          label.appendChild(document.createTextNode(user.name))
          cursor.appendChild(label)
          return cursor
        },
        selectionBuilder: (user: { name: string; color: string }, clientId: number) => {
          return {
            style: `background-color: ${user.color}40;`,
            class: `ProseMirror-yjs-selection collaboration-cursor__selection--${clientId}`,
            'data-client-id': String(clientId)
          }
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

  // Hover detection for cursor labels: show label when mouse is over a remote
  // selection or near a remote caret. Uses mousemove hit-testing so we never
  // block text selection or clicks (all decorations remain pointer-events: none).
  useEffect(() => {
    if (!editor) return

    let root: HTMLElement | null = null
    try {
      root = editor.view.dom
    } catch {
      let rafId: number | undefined
      const tryAttach = () => {
        try {
          root = editor.view.dom
        } catch {
          rafId = requestAnimationFrame(tryAttach)
          return
        }
        attach()
      }
      rafId = requestAnimationFrame(tryAttach)
      return () => {
        if (rafId !== undefined) cancelAnimationFrame(rafId)
      }
    }

    let activeClientId: string | null = null
    const CARET_HIT_RADIUS = 10 // px around the caret line

    function showLabel(clientId: string) {
      if (activeClientId === clientId) return
      if (activeClientId) hideLabel()
      activeClientId = clientId
      const caret = root!.querySelector(
        `.collaboration-cursor__caret[data-client-id="${clientId}"]`
      )
      const label = caret?.querySelector('.collaboration-cursor__label') as HTMLElement | null
      if (label) {
        label.style.opacity = '1'
        label.style.animation = 'none'
      }
    }

    function hideLabel() {
      if (!activeClientId) return
      const caret = root!.querySelector(
        `.collaboration-cursor__caret[data-client-id="${activeClientId}"]`
      )
      const label = caret?.querySelector('.collaboration-cursor__label') as HTMLElement | null
      if (label) {
        label.style.opacity = ''
        label.style.animation = ''
      }
      activeClientId = null
    }

    function onMouseMove(e: MouseEvent) {
      const mx = e.clientX
      const my = e.clientY

      // Check if mouse is over a selection span
      const els = document.elementsFromPoint(mx, my)
      for (const el of els) {
        if ((el as HTMLElement).classList?.contains('ProseMirror-yjs-selection')) {
          const clientId = (el as HTMLElement).dataset.clientId
          if (clientId) {
            showLabel(clientId)
            return
          }
        }
      }

      // Check proximity to any caret
      const carets = root!.querySelectorAll('.collaboration-cursor__caret[data-client-id]')
      for (const caret of carets) {
        const rect = caret.getBoundingClientRect()
        if (
          mx >= rect.left - CARET_HIT_RADIUS &&
          mx <= rect.right + CARET_HIT_RADIUS &&
          my >= rect.top - CARET_HIT_RADIUS &&
          my <= rect.bottom + CARET_HIT_RADIUS
        ) {
          showLabel((caret as HTMLElement).dataset.clientId!)
          return
        }
      }

      // Nothing hit
      hideLabel()
    }

    function onMouseLeave() {
      hideLabel()
    }

    function attach() {
      if (!root) return
      root.addEventListener('mousemove', onMouseMove)
      root.addEventListener('mouseleave', onMouseLeave)
      cleanupFn = () => {
        root!.removeEventListener('mousemove', onMouseMove)
        root!.removeEventListener('mouseleave', onMouseLeave)
      }
    }

    let cleanupFn: (() => void) | null = null
    attach()

    return () => {
      cleanupFn?.()
    }
  }, [editor])

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
          '[&_.ProseMirror]:h-full [&_.ProseMirror]:px-1 [&_.ProseMirror]:pl-8',
          // Remove all focus outlines
          '[&_.ProseMirror]:outline-none [&_.ProseMirror:focus]:outline-none',
          '[&_.tiptap]:outline-none [&_.tiptap:focus]:outline-none',
          '[&_[contenteditable]]:outline-none [&_[contenteditable]:focus]:outline-none',
          // Placeholder class - styles defined in editor.css
          'xnet-editor'
        )}
      />
      {showToolbar && (
        <FloatingToolbar
          editor={editor}
          mode={toolbarMode}
          additionalItems={additionalToolbarItems}
          onCreateComment={onCreateComment}
        />
      )}
    </div>
  )
}
