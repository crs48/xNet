/**
 * FileDropPlugin - ProseMirror plugin for drag-and-drop file upload.
 *
 * Handles non-image files dropped onto the editor.
 * Images are handled by the ImagePastePlugin instead.
 */
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const FileDropPluginKey = new PluginKey('fileDrop')

export interface FileDropPluginOptions {
  maxSize: number
  blockedTypes: string[]
  onUpload: (file: File) => Promise<{
    cid: string
    name: string
    mimeType: string
    size: number
  }>
  editor: Editor
}

export function createFileDropPlugin(options: FileDropPluginOptions) {
  return new Plugin({
    key: FileDropPluginKey,

    props: {
      handleDrop(view, event, _slice, moved) {
        if (moved) return false

        const files = event.dataTransfer?.files
        if (!files?.length) return false

        // Filter: non-image, not blocked, within size limit
        const attachments = Array.from(files).filter((file) => {
          if (file.type.startsWith('image/')) return false // handled by image plugin
          if (options.blockedTypes.some((t) => file.type.match(t))) return false
          if (file.size > options.maxSize) return false
          return true
        })

        if (attachments.length === 0) return false

        event.preventDefault()

        // Get drop position
        const dropPos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY
        })

        for (const file of attachments) {
          handleFileUpload(file, options, dropPos?.pos)
        }

        return true
      }
    }
  })
}

async function handleFileUpload(file: File, options: FileDropPluginOptions, insertPos?: number) {
  const { editor, onUpload } = options

  // Insert placeholder at drop position or cursor
  const pos = insertPos ?? editor.state.selection.from
  editor
    .chain()
    .focus()
    .insertContentAt(pos, {
      type: 'file',
      attrs: {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadProgress: 0
      }
    })
    .run()

  try {
    const result = await onUpload(file)

    // Find and update placeholder
    editor.state.doc.descendants((node, nodePos) => {
      if (
        node.type.name === 'file' &&
        node.attrs.uploadProgress !== null &&
        node.attrs.name === file.name
      ) {
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(nodePos, undefined, {
            cid: result.cid,
            name: result.name,
            mimeType: result.mimeType,
            size: result.size,
            uploadProgress: null
          })
        )
        return false
      }
    })
  } catch (error) {
    console.error('File upload failed:', error)

    // Remove placeholder
    editor.state.doc.descendants((node, nodePos) => {
      if (
        node.type.name === 'file' &&
        node.attrs.uploadProgress !== null &&
        node.attrs.name === file.name
      ) {
        editor.view.dispatch(editor.state.tr.delete(nodePos, nodePos + node.nodeSize))
        return false
      }
    })
  }
}
