/**
 * @xnetjs/editor/react - React components for the xNet editor
 *
 * Provides ready-to-use React components for rich text editing with Yjs collaboration.
 *
 * @example
 * ```tsx
 * import { RichTextEditor, EditorToolbar } from '@xnetjs/editor/react'
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
  EDITOR_ROLLOUT_MODE_STORAGE_KEY,
  EditorSurface,
  readEditorRolloutMode,
  resolveEditorSurfaceContentMode,
  type EditorSurfaceDensity,
  type EditorSurfaceMode,
  type EditorSurfaceProps,
  type EditorRolloutMode
} from './components/EditorSurface'
export {
  CanvasFailedCardActions,
  CanvasExternalReferenceCard,
  CanvasLifecycleStatusBadge,
  type CanvasFailedCardActionKind,
  type CanvasFailedCardActionsProps,
  type CanvasExternalReferenceCardProps
} from './components/CanvasExternalReferenceCard'
export {
  CanvasMediaCard,
  isPdfMediaNode,
  type CanvasMediaCardProps,
  type CanvasMediaGate,
  type UpdateCanvasNodeProperties
} from './components/CanvasMediaCard'
export {
  renderCanvasNodeCard,
  shouldRenderCanvasNodeCard,
  type RenderCanvasNodeCardOptions
} from './components/renderCanvasNodeCard'
export { CanvasInlinePageSurface } from './components/CanvasInlinePageSurface'
export { CanvasDatabasePreviewSurface } from './components/CanvasDatabasePreviewSurface'
export {
  CanvasPeekOverlay,
  useCanvasPeek,
  type CanvasPeekOverlayProps,
  type CanvasPeekState,
  type UseCanvasPeekOptions,
  type UseCanvasPeekResult
} from './components/CanvasPeekOverlay'
export {
  CanvasCardAuditTrail,
  createCanvasCardAuditSummary,
  formatCanvasCardAuditTimestamp,
  getCanvasCardAuditOperationLabel,
  normalizeCanvasCardAuditEntries,
  type CanvasCardAuditEntry,
  type CanvasCardAuditOperation,
  type CanvasCardAuditSource,
  type CanvasCardAuditSummary,
  type CanvasCardAuditTrailProps,
  type CanvasNormalizedCardAuditEntry
} from './components/CanvasCardAuditTrail'
export {
  createCanvasExternalReferenceCardRenderer,
  type CanvasExternalReferenceCardAccent,
  type CanvasExternalReferenceCardMetadata,
  type CanvasExternalReferenceCardRenderer,
  type CanvasExternalReferenceCardRendererKind,
  type CanvasExternalReferenceRenderMode,
  type CreateCanvasExternalReferenceCardRendererInput
} from './components/canvasExternalReferenceCardRenderers'
export {
  createCanvasCardFieldId,
  createCanvasPermissionedCardField,
  createCanvasPermissionedCardFields,
  type CanvasCardField,
  type CanvasPermissionedCardField,
  type CanvasRestrictedCardField,
  type CanvasRestrictedCardFieldReason
} from './components/canvasPermissionedCardFields'
export {
  createCanvasExternalReferenceEmbedFallback,
  type CanvasExternalReferenceEmbedFallback,
  type CanvasExternalReferenceEmbedFallbackReason,
  type CanvasExternalReferenceEmbedFallbackTone,
  type CreateCanvasExternalReferenceEmbedFallbackInput
} from './components/canvasExternalReferenceEmbedFallbacks'
export {
  CanvasPluginFallbackCard,
  type CanvasPluginFallbackCardProps
} from './components/CanvasPluginFallbackCard'
export {
  createCanvasMissingPluginFallback,
  type CanvasMissingPluginFallback,
  type CanvasMissingPluginFallbackAction,
  type CanvasMissingPluginFallbackActionKind,
  type CanvasMissingPluginFallbackReason,
  type CanvasMissingPluginFallbackTone,
  type CreateCanvasMissingPluginFallbackInput
} from './components/canvasPluginFallbacks'
export {
  FloatingToolbar,
  type FloatingToolbarProps,
  type ToolbarMode,
  type ToolbarItemContribution
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
export { RichLinkNodeView } from './extensions/rich-link'
export { PageEmbedNodeView } from './extensions/page-embed'
export { DatabaseEmbedNodeView } from './extensions/database-embed'
export { TaskViewEmbedNodeView } from './extensions/task-view-embed'

// Blob context
export { BlobProvider, useBlobService } from './context/BlobContext'
export type { BlobContextValue, BlobProviderProps } from './context/BlobContext'

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
export { useEditorExtensions } from './hooks/useEditorExtensions'
export type {
  EditorContribution,
  UseEditorExtensionsResult,
  UseEditorExtensionsOptions
} from './hooks/useEditorExtensions'
export { useSlashCommands } from './hooks/useSlashCommands'
export type { SlashCommandContribution, UseSlashCommandsOptions } from './hooks/useSlashCommands'
export type { PageTaskSnapshot, PageTaskReferenceSnapshot } from './extensions/page-tasks'
export {
  addTaskAssigneeToDoc,
  removeTaskAssigneeFromDoc,
  setTaskDueDateInDoc
} from './extensions/page-tasks/write-through'
export type { TaskMentionSuggestion } from './extensions/task-metadata'
export { createGravatarUrl } from './utils/gravatar'
export { buildTaskMentionSuggestions } from './utils/taskMentionSuggestions'
export {
  buildPersonMentionSuggestions,
  extractMentionDids,
  mentionsFromDoc,
  type MentionablePerson
} from './utils/mentions'
export { extractTagIds, tagsFromDoc } from './utils/hashtags'
export type { HashtagSuggestion } from './extensions/hashtag'
export type { WikilinkTarget } from './extensions/wikilink-suggestion'
export { CREATE_WIKILINK_ID } from './extensions/wikilink-suggestion'
export { serializeWikilink } from './extensions'
export type {
  TaskViewConfig,
  TaskViewEmbedType,
  TaskViewScope,
  TaskViewAssigneeFilter,
  TaskViewDueDateFilter,
  TaskViewStatusFilter
} from './extensions/task-view-embed'
export {
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  normalizeEditorDocumentJson,
  type EditorDocumentCompatibilityResult,
  type EditorDocumentMigration,
  type EditorDocumentMigrationKind
} from './document-compat'

// Re-export hooks from @tiptap/react for convenience
export { useEditor, EditorContent } from '@tiptap/react'
export type { Editor } from '@tiptap/react'

// Shared page-comment subsystem (exploration 0276): the comment state
// machine both the web and desktop PageViews consume.
export { usePageComments } from './hooks/usePageComments'
export type {
  PageCommentPopoverState,
  PageNewCommentState,
  UsePageCommentsOptions,
  UsePageCommentsResult
} from './hooks/usePageComments'
