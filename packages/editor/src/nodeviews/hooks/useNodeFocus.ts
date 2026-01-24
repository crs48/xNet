import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Hook to track if the cursor is within a specific node.
 *
 * @param editor - The TipTap editor instance
 * @param getPos - Function that returns the node's position in the document
 * @returns boolean indicating if the cursor is inside this node
 */
export function useNodeFocus(
  editor: Editor | null,
  getPos: (() => number | undefined) | undefined
): boolean {
  const [isFocused, setIsFocused] = useState(false)
  const prevFocusedRef = useRef(false)

  const checkFocus = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      if (prevFocusedRef.current) {
        setIsFocused(false)
        prevFocusedRef.current = false
      }
      return
    }

    if (!getPos) {
      if (prevFocusedRef.current) {
        setIsFocused(false)
        prevFocusedRef.current = false
      }
      return
    }

    const pos = getPos()
    if (typeof pos !== 'number') {
      if (prevFocusedRef.current) {
        setIsFocused(false)
        prevFocusedRef.current = false
      }
      return
    }

    const node = editor.state.doc.nodeAt(pos)
    if (!node) {
      if (prevFocusedRef.current) {
        setIsFocused(false)
        prevFocusedRef.current = false
      }
      return
    }

    const { from, to } = editor.state.selection
    const nodeEnd = pos + node.nodeSize

    // Check if selection is within this node
    const focused = from > pos && to < nodeEnd

    if (focused !== prevFocusedRef.current) {
      setIsFocused(focused)
      prevFocusedRef.current = focused
    }
  }, [editor, getPos])

  useEffect(() => {
    if (!editor) return

    checkFocus()

    const handleBlur = () => {
      setIsFocused(false)
      prevFocusedRef.current = false
    }

    editor.on('selectionUpdate', checkFocus)
    editor.on('focus', checkFocus)
    editor.on('blur', handleBlur)

    return () => {
      editor.off('selectionUpdate', checkFocus)
      editor.off('focus', checkFocus)
      editor.off('blur', handleBlur)
    }
  }, [editor, checkFocus])

  return isFocused
}
