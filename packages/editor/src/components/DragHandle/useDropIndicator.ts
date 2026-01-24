import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import { DragDropPluginKey, type DragState } from '../../extensions/drag-handle/DragDropPlugin'

export interface DropIndicatorState {
  visible: boolean
  top: number
  side: 'before' | 'after'
}

export interface UseDropIndicatorOptions {
  editor: Editor | null
}

/**
 * React hook that computes the visual position of the drop indicator
 * based on the drag state from DragDropPlugin.
 */
export function useDropIndicator({ editor }: UseDropIndicatorOptions): DropIndicatorState {
  const [state, setState] = useState<DropIndicatorState>({
    visible: false,
    top: 0,
    side: 'before'
  })

  useEffect(() => {
    if (!editor) return

    const updateIndicator = () => {
      const dragState = DragDropPluginKey.getState(editor.state) as DragState | undefined

      if (!dragState?.dropPos || !dragState.dropSide) {
        setState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        return
      }

      const { dropPos, dropSide } = dragState

      try {
        const coords = editor.view.coordsAtPos(dropPos)
        const editorRect = editor.view.dom.getBoundingClientRect()

        let top = coords.top - editorRect.top + editor.view.dom.scrollTop
        if (dropSide === 'after') {
          top += coords.bottom - coords.top
        }

        setState({
          visible: true,
          top,
          side: dropSide
        })
      } catch {
        setState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      }
    }

    editor.on('transaction', updateIndicator)

    return () => {
      editor.off('transaction', updateIndicator)
    }
  }, [editor])

  return state
}
