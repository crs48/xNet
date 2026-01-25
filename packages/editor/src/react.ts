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
export {
  FloatingToolbar,
  type FloatingToolbarProps,
  type ToolbarMode
} from './components/FloatingToolbar'
// Slash command menu component
export { SlashMenu, type SlashMenuRef } from './components/SlashMenu'

// Legacy toolbar export (deprecated, use FloatingToolbar)
export { EditorToolbar, type EditorToolbarProps } from './components/EditorToolbar'

// NodeView components
export { HeadingView } from './nodeviews/HeadingView'
export { CodeBlockView } from './nodeviews/CodeBlockView'
export { BlockquoteView } from './nodeviews/BlockquoteView'
export { ImageNodeView } from './extensions/image'
export { CalloutNodeView } from './extensions/callout'
export { ToggleNodeView } from './extensions/toggle'
export { FileNodeView } from './extensions/file'
export { EmbedNodeView } from './extensions/embed'
export { DatabaseEmbedNodeView } from './extensions/database-embed'

// Blob context
export { BlobProvider, useBlobService } from './context/BlobContext'
export type { BlobContextValue, BlobProviderProps } from './context/BlobContext'

// DragHandle components
export {
  DragHandle as DragHandleComponent,
  DropIndicator,
  useDragHandle,
  useDragDrop,
  useDropIndicator
} from './components/DragHandle'
export type {
  DragHandleProps,
  DropIndicatorProps,
  DragHandleState,
  UseDragHandleOptions,
  UseDragDropOptions,
  DropIndicatorState,
  UseDropIndicatorOptions
} from './components/DragHandle'

// Hooks
export { useNodeFocus } from './nodeviews/hooks/useNodeFocus'
export { useActiveStates } from './hooks/useActiveStates'
export type { ActiveStates, UseActiveStatesOptions } from './hooks/useActiveStates'
export { useImageUpload } from './hooks/useImageUpload'
export type { UseImageUploadOptions, ImageUploadResult } from './hooks/useImageUpload'
export { useFileUpload } from './hooks/useFileUpload'
export type { FileUploadResult } from './hooks/useFileUpload'
export { useFileDownload } from './hooks/useFileDownload'
export type { FileDownloadAttrs } from './hooks/useFileDownload'
export { useFocusTrap } from './accessibility/useFocusTrap'
export type { UseFocusTrapOptions } from './accessibility/useFocusTrap'

// Re-export hooks from @tiptap/react for convenience
export { useEditor, EditorContent } from '@tiptap/react'
export type { Editor } from '@tiptap/react'
