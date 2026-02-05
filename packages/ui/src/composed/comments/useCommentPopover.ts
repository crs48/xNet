/**
 * useCommentPopover - Hook for managing comment popover state.
 *
 * Handles preview/full mode transitions, hover delays, and dismissal.
 */
import type { CommentThreadData } from './CommentPopover'
import { useState, useCallback, useRef } from 'react'

export interface PopoverState {
  /** Whether the popover is visible */
  visible: boolean
  /** Current display mode */
  mode: 'preview' | 'full'
  /** The thread being displayed */
  thread: CommentThreadData | null
  /** Anchor element or coordinates */
  anchor: HTMLElement | { x: number; y: number } | null
}

export interface UseCommentPopoverResult {
  /** Current popover state */
  state: PopoverState
  /** Show popover in preview mode (with hover delay) */
  showPreview: (thread: CommentThreadData, anchor: HTMLElement | { x: number; y: number }) => void
  /** Show popover in full mode immediately */
  showFull: (thread: CommentThreadData, anchor: HTMLElement | { x: number; y: number }) => void
  /** Upgrade from preview to full mode */
  upgradeToFull: () => void
  /** Dismiss the popover */
  dismiss: () => void
  /** Cancel a pending preview (on mouse leave) */
  cancelPreview: () => void
}

const PREVIEW_DELAY_MS = 300

/**
 * Hook to manage comment popover visibility and mode.
 */
export function useCommentPopover(): UseCommentPopoverResult {
  const [state, setState] = useState<PopoverState>({
    visible: false,
    mode: 'preview',
    thread: null,
    anchor: null
  })

  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Show popover in preview mode after a delay.
   */
  const showPreview = useCallback(
    (thread: CommentThreadData, anchor: HTMLElement | { x: number; y: number }) => {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }

      // Delay the preview
      hoverTimeoutRef.current = setTimeout(() => {
        setState({ visible: true, mode: 'preview', thread, anchor })
      }, PREVIEW_DELAY_MS)
    },
    []
  )

  /**
   * Show popover in full mode immediately.
   */
  const showFull = useCallback(
    (thread: CommentThreadData, anchor: HTMLElement | { x: number; y: number }) => {
      // Clear any pending preview
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }

      setState({ visible: true, mode: 'full', thread, anchor })
    },
    []
  )

  /**
   * Upgrade from preview to full mode.
   */
  const upgradeToFull = useCallback(() => {
    setState((prev) => ({ ...prev, mode: 'full' }))
  }, [])

  /**
   * Dismiss the popover.
   */
  const dismiss = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    setState({ visible: false, mode: 'preview', thread: null, anchor: null })
  }, [])

  /**
   * Cancel a pending preview (on mouse leave).
   * Only dismisses if in preview mode, not if in full mode.
   */
  const cancelPreview = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    // Only dismiss if in preview mode
    setState((prev) => (prev.mode === 'preview' ? { ...prev, visible: false } : prev))
  }, [])

  return {
    state,
    showPreview,
    showFull,
    upgradeToFull,
    dismiss,
    cancelPreview
  }
}
