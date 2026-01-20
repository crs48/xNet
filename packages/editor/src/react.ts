/**
 * @xnet/editor/react - React components for the xNet editor
 *
 * Provides ready-to-use React components for rich text editing with Yjs collaboration.
 *
 * @example
 * ```tsx
 * import { RichTextEditor, EditorToolbar } from '@xnet/editor/react'
 *
 * function DocumentEditor({ document, onNavigate }) {
 *   return (
 *     <RichTextEditor
 *       ydoc={document.ydoc}
 *       field="content"
 *       onNavigate={onNavigate}
 *     />
 *   )
 * }
 * ```
 */
export { RichTextEditor, type RichTextEditorProps } from './components/RichTextEditor'
export { EditorToolbar, type EditorToolbarProps } from './components/EditorToolbar'

// Re-export hooks from @tiptap/react for convenience
export { useEditor, EditorContent } from '@tiptap/react'
export type { Editor } from '@tiptap/react'
