/**
 * @xnet/editor - Framework-agnostic collaborative editor
 *
 * This package provides a core editor that binds to Yjs documents.
 * It can be used directly with vanilla JS or wrapped by framework bindings.
 *
 * @example
 * ```ts
 * import { createEditor } from '@xnet/editor'
 * import * as Y from 'yjs'
 *
 * const ydoc = new Y.Doc()
 * const editor = createEditor({
 *   ydoc,
 *   field: 'content',
 *   onChange: (content) => console.log('Content changed:', content)
 * })
 *
 * // Get content
 * const content = editor.getContent()
 *
 * // Set content
 * editor.setContent('Hello, world!')
 *
 * // Insert at position
 * editor.insert(0, 'Start: ')
 *
 * // Clean up
 * editor.destroy()
 * ```
 */

// Core editor
export { Editor, createEditor } from './core'

// Types
export type {
  EditorConfig,
  EditorState,
  Selection,
  CursorPosition,
  RemoteUser,
  EditorEventType,
  EditorEventHandler
} from './types'
