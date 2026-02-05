import type { Editor } from '@tiptap/core'
import { useEffect, useState, useCallback } from 'react'
import { DragDropPluginKey, type DragState } from '../../extensions/drag-handle/DragDropPlugin'

export interface UseDragDropOptions {
  editor: Editor | null
}

/**
 * React hook that tracks the drag-and-drop state from the DragDropPlugin.
 * Provides `isDragging` and the full `dragState` for UI feedback.
 */
export function useDragDrop({ editor }: UseDragDropOptions) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragState, setDragState] = useState<DragState>({
    draggedPos: null,
    draggedNode: null,
    dropPos: null,
    dropSide: null
  })

  useEffect(() => {
    if (!editor) return

    const updateState = () => {
      const state = DragDropPluginKey.getState(editor.state) as DragState | undefined
      if (state) {
        setDragState(state)
        setIsDragging(state.draggedNode !== null)
      }
    }

    editor.on('transaction', updateState)

    return () => {
      editor.off('transaction', updateState)
    }
  }, [editor])

  const startDrag = useCallback(
    (pos: number) => {
      if (!editor) return

      // Update the data-drag-pos on the handle element so the plugin can read it
      const handle = editor.view.dom.parentElement?.querySelector('.xnet-drag-handle')
      if (handle) {
        handle.setAttribute('data-drag-pos', String(pos))
      }
    },
    [editor]
  )

  return {
    isDragging,
    dragState,
    startDrag
  }
}
