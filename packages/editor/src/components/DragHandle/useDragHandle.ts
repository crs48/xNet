import { useState, useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'

export interface DragHandleState {
  visible: boolean
  top: number
  left: number
  height: number
  blockElement: HTMLElement | null
  blockPos: number | null
}

export interface UseDragHandleOptions {
  editor: Editor | null
  draggableSelector?: string
  handleOffset?: number
  showDelay?: number
}

/**
 * React hook that tracks drag handle visibility and position.
 * Shows a handle when hovering over draggable block-level elements.
 */
export function useDragHandle({
  editor,
  draggableSelector = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr',
  handleOffset = -28,
  showDelay = 50
}: UseDragHandleOptions) {
  const [state, setState] = useState<DragHandleState>({
    visible: false,
    top: 0,
    left: handleOffset,
    height: 0,
    blockElement: null,
    blockPos: null
  })

  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentBlockRef = useRef<HTMLElement | null>(null)

  const showHandle = useCallback(
    (block: HTMLElement) => {
      if (!editor?.view.dom) return

      const editorRect = editor.view.dom.getBoundingClientRect()
      const blockRect = block.getBoundingClientRect()
      const pos = editor.view.posAtDOM(block, 0)

      const top = blockRect.top - editorRect.top + editor.view.dom.scrollTop
      const height = blockRect.height

      currentBlockRef.current = block

      setState({
        visible: true,
        top,
        left: handleOffset,
        height,
        blockElement: block,
        blockPos: pos
      })
    },
    [editor, handleOffset]
  )

  const hideHandle = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }

    currentBlockRef.current = null

    setState((prev) => ({
      ...prev,
      visible: false,
      blockElement: null,
      blockPos: null
    }))
  }, [])

  useEffect(() => {
    if (!editor?.view.dom) return

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const block = target.closest(draggableSelector) as HTMLElement | null

      if (!block || !editor.view.dom.contains(block)) {
        hideHandle()
        return
      }

      if (block === currentBlockRef.current) return

      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current)
      }

      showTimeoutRef.current = setTimeout(() => {
        showHandle(block)
      }, showDelay)
    }

    const handleMouseLeave = () => {
      hideHandle()
    }

    editor.view.dom.addEventListener('mousemove', handleMouseMove)
    editor.view.dom.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      editor.view.dom.removeEventListener('mousemove', handleMouseMove)
      editor.view.dom.removeEventListener('mouseleave', handleMouseLeave)

      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current)
      }
    }
  }, [editor, draggableSelector, showDelay, showHandle, hideHandle])

  return {
    ...state,
    hideHandle
  }
}
