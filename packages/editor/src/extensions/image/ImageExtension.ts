/**
 * ImageExtension - TipTap node for content-addressed images.
 *
 * Images reference blobs by CID via BlobService. Supports:
 * - Paste/drop upload
 * - Resize handles
 * - Alignment (left/center/right/full)
 * - Upload progress indication
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from './ImageNodeView'
import { createImagePastePlugin } from './ImagePastePlugin'

export interface ImageOptions {
  /** Allowed MIME types */
  allowedMimeTypes: string[]
  /** Maximum file size in bytes */
  maxSize: number
  /** Enable inline images (vs block) */
  inline: boolean
  /** Custom upload handler - called when an image is pasted/dropped */
  onUpload?: (file: File) => Promise<{
    src: string
    width?: number
    height?: number
    cid?: string
  }>
  /** HTMLAttributes to apply to the rendered element */
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      /** Insert an image */
      setImage: (options: {
        src: string
        alt?: string
        title?: string
        width?: number
        height?: number
        alignment?: 'left' | 'center' | 'right' | 'full'
        cid?: string
        uploadProgress?: number | null
      }) => ReturnType
      /** Update image attributes */
      updateImage: (
        options: Partial<{
          alt: string
          title: string
          width: number
          height: number
          alignment: 'left' | 'center' | 'right' | 'full'
        }>
      ) => ReturnType
    }
  }
}

export const ImageExtension = Node.create<ImageOptions>({
  name: 'image',

  addOptions() {
    return {
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      maxSize: 10 * 1024 * 1024, // 10MB
      inline: false,
      onUpload: undefined,
      HTMLAttributes: {}
    }
  },

  group() {
    return this.options.inline ? 'inline' : 'block'
  },

  inline() {
    return this.options.inline
  },

  draggable: true,

  addAttributes() {
    return {
      /** Content ID for blob lookup */
      cid: { default: null },
      /** Resolved URL for display */
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      height: { default: null },
      alignment: { default: 'center' },
      /** Upload progress (0-100), null when complete */
      uploadProgress: { default: null },
      /** Unique upload ID for matching placeholders during concurrent uploads */
      uploadId: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Don't render blob: URLs - they're ephemeral and won't work across sessions
    // The React NodeView will resolve the CID to a fresh blob URL
    const attrs = { ...HTMLAttributes }
    if (attrs.src && attrs.src.startsWith('blob:')) {
      delete attrs.src
    }

    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, attrs, {
        'data-cid': HTMLAttributes.cid,
        'data-alignment': HTMLAttributes.alignment
      })
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options
          })
        },

      updateImage:
        (options) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, options)
        }
    }
  },

  addProseMirrorPlugins() {
    const { onUpload, allowedMimeTypes, maxSize } = this.options

    if (!onUpload) return []

    return [
      createImagePastePlugin({
        allowedMimeTypes,
        maxSize,
        onUpload,
        editor: this.editor
      })
    ]
  }
})
