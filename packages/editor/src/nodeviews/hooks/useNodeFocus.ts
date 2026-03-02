import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useState, useEffect, useCallback, useRef } from 'react'

export interface NodeFocusSnapshot {
  nodePos: number
  nodeSize: number
  selectionFrom: number
  selectionTo: number
  isNodeSelection: boolean
}

export function isNodeFocused(snapshot: NodeFocusSnapshot): boolean {
  const { nodePos, nodeSize, selectionFrom, selectionTo, isNodeSelection } = snapshot

  if (isNodeSelection) {
    return selectionFrom === nodePos
  }

  const contentStart = nodePos + 1
  const contentEnd = nodePos + nodeSize - 1

  if (selectionFrom < contentStart || selectionTo > contentEnd) {
    return false
  }

  return true
}

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
    const focused = isNodeFocused({
      nodePos: pos,
      nodeSize: node.nodeSize,
      selectionFrom: from,
      selectionTo: to,
      isNodeSelection: editor.state.selection instanceof NodeSelection
    })

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
