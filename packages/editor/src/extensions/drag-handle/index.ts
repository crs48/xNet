import { Extension } from '@tiptap/core'
import { DragHandle, type DragHandleOptions, DragHandlePluginKey } from './DragHandle'
import { createDragDropPlugin, DragDropPluginKey, type DragState } from './DragDropPlugin'
import { createDropIndicatorPlugin, DropIndicatorPluginKey } from './DropIndicatorPlugin'

export interface DragHandleExtensionOptions extends DragHandleOptions {
  /** Enable drag and drop reordering */
  enableDragDrop: boolean
  /** Show visual drop indicator during drag */
  showDropIndicator: boolean
}

/**
 * Combined extension that bundles drag handle visibility,
 * block drag-and-drop, and the drop indicator decoration.
 */
export const DragHandleExtension = Extension.create<DragHandleExtensionOptions>({
  name: 'dragHandleExtension',

  addOptions() {
    return {
      draggableSelector: 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr',
      handleOffset: -28,
      showDelay: 50,
      enableDragDrop: true,
      showDropIndicator: true
    }
  },

  addExtensions() {
    return [
      DragHandle.configure({
        draggableSelector: this.options.draggableSelector,
        handleOffset: this.options.handleOffset,
        showDelay: this.options.showDelay
      })
    ]
  },

  addProseMirrorPlugins() {
    const plugins = []

    if (this.options.enableDragDrop) {
      plugins.push(createDragDropPlugin())
    }

    if (this.options.showDropIndicator) {
      plugins.push(createDropIndicatorPlugin())
    }

    return plugins
  }
})

// Re-export types and keys
export { DragHandle, DragHandlePluginKey } from './DragHandle'
export type { DragHandleOptions } from './DragHandle'
export { createDragDropPlugin, DragDropPluginKey } from './DragDropPlugin'
export type { DragState } from './DragDropPlugin'
export { createDropIndicatorPlugin, DropIndicatorPluginKey } from './DropIndicatorPlugin'
