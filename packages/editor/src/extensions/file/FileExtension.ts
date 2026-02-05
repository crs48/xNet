/**
 * FileExtension - Generic file attachment node.
 *
 * Displays files with type icon, name, size, and download button.
 * Supports drag-and-drop upload for non-image files.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { createFileDropPlugin } from './FileDropPlugin'
import { FileNodeView } from './FileNodeView'

export interface FileExtensionOptions {
  /** Maximum file size in bytes (default: 100MB) */
  maxSize: number
  /** Blocked MIME types */
  blockedTypes: string[]
  /** Upload handler */
  onUpload?: (file: File) => Promise<{
    cid: string
    name: string
    mimeType: string
    size: number
  }>
  /** Download handler (returns a URL) */
  onDownload?: (attrs: {
    cid: string
    name: string
    mimeType: string
    size: number
  }) => Promise<string>
  /** HTML attributes */
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    file: {
      /** Insert a file attachment */
      setFile: (attrs: { cid: string; name: string; mimeType: string; size: number }) => ReturnType
    }
  }
}

export const FileExtension = Node.create<FileExtensionOptions>({
  name: 'file',

  addOptions() {
    return {
      maxSize: 100 * 1024 * 1024, // 100MB
      blockedTypes: ['application/x-executable', 'application/x-msdownload'],
      onUpload: undefined,
      onDownload: undefined,
      HTMLAttributes: {}
    }
  },

  group: 'block',

  draggable: true,

  addAttributes() {
    return {
      cid: { default: null },
      name: { default: null },
      mimeType: { default: null },
      size: { default: null },
      uploadProgress: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-file-cid]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-file-cid': HTMLAttributes.cid,
        'data-type': 'file-attachment'
      })
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileNodeView)
  },

  addCommands() {
    return {
      setFile:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              cid: attrs.cid,
              name: attrs.name,
              mimeType: attrs.mimeType,
              size: attrs.size,
              uploadProgress: null
            }
          })
        }
    }
  },

  addProseMirrorPlugins() {
    const { onUpload, maxSize, blockedTypes } = this.options

    if (!onUpload) return []

    return [
      createFileDropPlugin({
        maxSize,
        blockedTypes,
        onUpload,
        editor: this.editor
      })
    ]
  }
})
