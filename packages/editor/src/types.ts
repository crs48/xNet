/**
 * @xnetjs/editor - Type definitions
 */
import type * as Y from 'yjs'

/**
 * Editor configuration options
 */
export interface EditorConfig {
  /** The Yjs document to bind to */
  ydoc: Y.Doc
  /** The name of the Y.Text field to use (default: 'content') */
  field?: string
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
  /** Called when content changes */
  onChange?: (content: string) => void
  /** Called when selection changes */
  onSelectionChange?: (selection: Selection) => void
}

/**
 * Selection state
 */
export interface Selection {
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}

/**
 * Cursor position for collaborative awareness
 */
export interface CursorPosition {
  index: number
  length: number
}

/**
 * Remote user state for collaborative editing
 */
export interface RemoteUser {
  clientId: number
  name: string
  color: string
  cursor?: CursorPosition
}

/**
 * Editor state
 */
export interface EditorState {
  content: string
  selection: Selection | null
  focused: boolean
  readOnly: boolean
}

/**
 * Editor event types
 */
export type EditorEventType = 'change' | 'selection' | 'focus' | 'blur' | 'remote-update'

/**
 * Editor event handler
 */
export type EditorEventHandler<T = unknown> = (data: T) => void
