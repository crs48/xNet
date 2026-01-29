/**
 * Comment extension for the xNet editor.
 *
 * Provides:
 * - CommentMark: TipTap mark for highlighting commented text
 * - CommentPlugin: ProseMirror plugin for click/hover interactions
 * - Text anchor utilities for Yjs-relative positioning
 */

// Mark extension
export { CommentMark } from './CommentMark'
export type { CommentMarkOptions } from './CommentMark'

// Plugin extension
export {
  CommentPlugin,
  CommentPluginKey,
  setSelectedComment,
  getCommentsAtPosition
} from './CommentPlugin'
export type { CommentPluginOptions } from './CommentPlugin'

// Text anchor utilities
export {
  captureTextAnchor,
  resolveTextAnchor,
  restoreCommentMarks,
  isTextAnchorValid,
  uint8ArrayToBase64,
  base64ToUint8Array
} from './textAnchor'
