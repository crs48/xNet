/**
 * Space-to-Pan Hook
 *
 * Hold Space and drag to pan the canvas.
 * Provides a hand tool experience like in design software.
 */

import { useEffect, useRef, useCallback } from 'react'
import { Viewport } from '../spatial/index'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseSpacePanOptions {
  /** Current viewport state */
  viewport: Viewport
  /** Callback when viewport should change */
  onViewportChange: (changes: { x?: number; y?: number }) => void
  /** Reference to the canvas container element */
  containerRef: React.RefObject<HTMLElement>
  /** Whether space-pan is enabled */
  enabled?: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSpacePan({
  viewport,
  onViewportChange,
  containerRef,
  enabled = true
}: UseSpacePanOptions) {
  const isSpaceHeldRef = useRef(false)
  const isPanningRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })
  const viewportRef = useRef(viewport)

  // Keep viewport ref updated
  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      if (e.code === 'Space' && !isSpaceHeldRef.current) {
        // Don't activate if typing in an input
        const target = e.target as HTMLElement
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable
        ) {
          return
        }

        e.preventDefault()
        isSpaceHeldRef.current = true

        if (containerRef.current) {
          containerRef.current.style.cursor = 'grab'
        }
      }
    },
    [enabled, containerRef]
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceHeldRef.current = false
        isPanningRef.current = false

        if (containerRef.current) {
          containerRef.current.style.cursor = ''
        }
      }
    },
    [containerRef]
  )

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return

      if (isSpaceHeldRef.current && e.button === 0) {
        e.preventDefault()
        isPanningRef.current = true
        lastPosRef.current = { x: e.clientX, y: e.clientY }

        if (containerRef.current) {
          containerRef.current.style.cursor = 'grabbing'
        }
      }
    },
    [enabled, containerRef]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isPanningRef.current) return

      const dx = e.clientX - lastPosRef.current.x
      const dy = e.clientY - lastPosRef.current.y

      const vp = viewportRef.current
      onViewportChange({
        x: vp.x - dx / vp.zoom,
        y: vp.y - dy / vp.zoom
      })

      lastPosRef.current = { x: e.clientX, y: e.clientY }
    },
    [onViewportChange]
  )

  const handleMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false

      if (containerRef.current) {
        containerRef.current.style.cursor = isSpaceHeldRef.current ? 'grab' : ''
      }
    }
  }, [containerRef])

  useEffect(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    container.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      container.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [
    enabled,
    containerRef,
    handleKeyDown,
    handleKeyUp,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
  ])

  return {
    isSpaceHeld: isSpaceHeldRef.current,
    isPanning: isPanningRef.current
  }
}
