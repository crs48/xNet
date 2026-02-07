/**
 * Cursor Tracking Hook
 *
 * Tracks mouse movement within the canvas and broadcasts position via presence.
 */

import type { CanvasPresenceManager } from '../presence/canvas-presence'
import { useEffect, useRef, useCallback } from 'react'
import { Viewport } from '../spatial/index'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseCursorTrackingOptions {
  /** Presence manager for broadcasting cursor */
  presenceManager: CanvasPresenceManager
  /** Viewport for coordinate conversion */
  viewport: Viewport
  /** Reference to the canvas container element */
  containerRef: React.RefObject<HTMLElement>
  /** Whether cursor tracking is enabled */
  enabled?: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCursorTracking({
  presenceManager,
  viewport,
  containerRef,
  enabled = true
}: UseCursorTrackingOptions) {
  const isInsideRef = useRef(false)
  const viewportRef = useRef(viewport)

  // Keep viewport ref updated
  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!enabled || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      // Convert to canvas coordinates
      const vp = viewportRef.current
      const canvasPos = vp.screenToCanvas(screenX, screenY)

      presenceManager.updateCursor(canvasPos)
    },
    [enabled, presenceManager, containerRef]
  )

  const handleMouseEnter = useCallback(() => {
    isInsideRef.current = true
  }, [])

  const handleMouseLeave = useCallback(() => {
    isInsideRef.current = false
    if (enabled) {
      presenceManager.updateCursor(null)
    }
  }, [enabled, presenceManager])

  useEffect(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseenter', handleMouseEnter)
    container.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseenter', handleMouseEnter)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [enabled, handleMouseMove, handleMouseEnter, handleMouseLeave, containerRef])

  // Clear cursor on unmount
  useEffect(() => {
    return () => {
      presenceManager.updateCursor(null)
    }
  }, [presenceManager])

  return {
    isInsideCanvas: isInsideRef.current
  }
}
