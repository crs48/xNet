import { useState, useCallback, useEffect, useRef, type RefObject } from 'react'
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
  /** Container element for the drag handle (needed for hover detection) */
  handleContainerRef?: RefObject<HTMLElement>
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
  handleContainerRef,
  draggableSelector = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr',
  handleOffset = -6,
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

      // Don't hide if hovering over the drag handle itself
      if (handleContainerRef?.current?.contains(target)) {
        return
      }

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

    const handleMouseLeave = (event: MouseEvent) => {
      // Don't hide if moving to the drag handle
      const relatedTarget = event.relatedTarget as HTMLElement | null
      if (handleContainerRef?.current?.contains(relatedTarget)) {
        return
      }
      hideHandle()
    }

    // Also track mouse leaving the handle container
    const handleHandleMouseLeave = (event: MouseEvent) => {
      const relatedTarget = event.relatedTarget as HTMLElement | null
      // If moving back to the editor or to the current block, keep visible
      if (editor.view.dom.contains(relatedTarget)) {
        return
      }
      hideHandle()
    }

    editor.view.dom.addEventListener('mousemove', handleMouseMove)
    editor.view.dom.addEventListener('mouseleave', handleMouseLeave)

    if (handleContainerRef?.current) {
      handleContainerRef.current.addEventListener('mouseleave', handleHandleMouseLeave)
    }

    return () => {
      editor.view.dom.removeEventListener('mousemove', handleMouseMove)
      editor.view.dom.removeEventListener('mouseleave', handleMouseLeave)

      if (handleContainerRef?.current) {
        handleContainerRef.current.removeEventListener('mouseleave', handleHandleMouseLeave)
      }

      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current)
      }
    }
  }, [editor, handleContainerRef, draggableSelector, showDelay, showHandle, hideHandle])

  return {
    ...state,
    hideHandle
  }
}
