/**
 * Attachment viewing surface (exploration 0385).
 *
 * - AttachmentLightbox: full-screen viewer for a cell's file refs
 * - AttachmentLightboxProvider / useAttachmentLightbox: one lightbox per
 *   surface, opened from any file chip
 */

export {
  AttachmentLightbox,
  type AttachmentLightboxProps,
  type AttachmentLightboxRequest
} from './AttachmentLightbox.js'

export {
  AttachmentLightboxProvider,
  type AttachmentLightboxProviderProps,
  useAttachmentLightbox,
  type OpenAttachmentLightbox
} from './AttachmentLightboxProvider.js'
