/**
 * ImagePastePlugin - ProseMirror plugin for paste/drop image upload.
 *
 * Intercepts clipboard paste and drag-drop events containing images,
 * inserts a placeholder node with upload progress, then updates it
 * with the final URL once the upload completes.
 */
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const ImagePastePluginKey = new PluginKey('imagePaste')

export interface ImagePastePluginOptions {
  allowedMimeTypes: string[]
  maxSize: number
  onUpload: (file: File) => Promise<{
    src: string
    width?: number
    height?: number
    cid?: string
  }>
  editor: Editor
}

export function createImagePastePlugin(options: ImagePastePluginOptions) {
  return new Plugin({
    key: ImagePastePluginKey,

    props: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false

        for (const item of Array.from(items)) {
          if (!options.allowedMimeTypes.some((type) => item.type.match(type))) {
            continue
          }

          const file = item.getAsFile()
          if (!file) continue

          if (file.size > options.maxSize) {
            console.warn(`Image too large: ${file.size} bytes (max: ${options.maxSize})`)
            continue
          }

          event.preventDefault()
          handleImageUpload(file, options, view.state.selection.from)
          return true
        }

        return false
      },

      handleDrop(view, event, _slice, moved) {
        if (moved) return false

        const files = event.dataTransfer?.files
        if (!files?.length) return false

        const images = Array.from(files).filter((file) =>
          options.allowedMimeTypes.some((type) => file.type.match(type))
        )

        if (images.length === 0) return false

        event.preventDefault()

        // Get drop position
        const pos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY
        })

        for (const file of images) {
          if (file.size <= options.maxSize) {
            handleImageUpload(file, options, pos?.pos)
          }
        }

        return true
      }
    }
  })
}

async function handleImageUpload(file: File, options: ImagePastePluginOptions, insertPos?: number) {
  const { editor, onUpload } = options

  // Insert placeholder with upload progress
  const pos = insertPos ?? editor.state.selection.from

  editor
    .chain()
    .focus()
    .insertContentAt(pos, {
      type: 'image',
      attrs: {
        src: null,
        alt: file.name,
        uploadProgress: 0
      }
    })
    .run()

  try {
    // Upload the file
    const result = await onUpload(file)

    // Find the placeholder node (has uploadProgress !== null) and update it
    editor.state.doc.descendants((node, nodePos) => {
      if (
        node.type.name === 'image' &&
        node.attrs.uploadProgress !== null &&
        node.attrs.alt === file.name
      ) {
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(nodePos, undefined, {
            src: result.src,
            width: result.width || null,
            height: result.height || null,
            cid: result.cid || null,
            alt: file.name,
            alignment: 'center',
            uploadProgress: null
          })
        )
        return false // Stop traversal
      }
    })
  } catch (error) {
    console.error('Image upload failed:', error)

    // Remove placeholder on error
    editor.state.doc.descendants((node, nodePos) => {
      if (
        node.type.name === 'image' &&
        node.attrs.uploadProgress !== null &&
        node.attrs.alt === file.name
      ) {
        editor.view.dispatch(editor.state.tr.delete(nodePos, nodePos + node.nodeSize))
        return false
      }
    })
  }
}
