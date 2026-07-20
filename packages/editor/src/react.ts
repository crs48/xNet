/**
 * @xnetjs/editor/react - React components for the xNet editor
 *
 * BlockNote-based collaborative editor (0312) plus the canvas card
 * family, blob context, upload hooks, and the shared page-comment
 * subsystem.
 *
 * @example
 * ```tsx
 * import { XNetEditor } from '@xnetjs/editor/react'
 *
 * function DocumentEditor({ document, onNavigate }) {
 *   return <XNetEditor ydoc={document.ydoc} onNavigate={onNavigate} />
 * }
 * ```
 */
// BlockNote-based editor surface (0312) — the editor.
export * from './blocknote'

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

// Blob context
export { BlobProvider, useBlobService } from './context/BlobContext'
export type { BlobContextValue, BlobProviderProps } from './context/BlobContext'

// Upload hooks
export { useImageUpload } from './hooks/useImageUpload'
export type { UseImageUploadOptions, ImageUploadResult } from './hooks/useImageUpload'
export { useFileUpload } from './hooks/useFileUpload'
export type { FileUploadResult } from './hooks/useFileUpload'
export { useFileDownload } from './hooks/useFileDownload'
export type { FileDownloadAttrs } from './hooks/useFileDownload'

// Mention picker suggestion builders
export { createGravatarUrl } from './utils/gravatar'
export { buildTaskMentionSuggestions } from './utils/taskMentionSuggestions'
export { buildPersonMentionSuggestions, type MentionablePerson } from './utils/mentions'

// Shared page-comment subsystem (exploration 0276, editor-decoupled 0312):
// the comment state machine both the web and desktop PageViews consume.
export { usePageComments } from './hooks/usePageComments'
export type {
  PageCommentPopoverState,
  PageNewCommentState,
  UsePageCommentsOptions,
  UsePageCommentsResult
} from './hooks/usePageComments'

// Inline-thread actions the host needs now that BlockNote's own comment UI is
// off and CommentIsland is the only comment surface (0375).
export {
  createInlineCommentThread,
  cancelInlineCommentThread,
  clearSelectedInlineThread
} from './blocknote/comments/inline-thread-actions'
