/**
 * Wheel Zoom Hook
 *
 * Ctrl/Cmd + wheel to zoom the canvas towards the cursor position.
 */

import { useEffect, useCallback, useRef } from 'react'
import { Viewport } from '../spatial/index'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseWheelZoomOptions {
  /** Current viewport state */
  viewport: Viewport
  /** Callback when viewport should change */
  onViewportChange: (changes: { x?: number; y?: number; zoom?: number }) => void
  /** Reference to the canvas container element */
  containerRef: React.RefObject<HTMLElement>
  /** Whether wheel zoom is enabled */
  enabled?: boolean
  /** Zoom speed multiplier (default: 0.002) */
  zoomSpeed?: number
  /** Minimum zoom level (default: 0.1) */
  minZoom?: number
  /** Maximum zoom level (default: 4) */
  maxZoom?: number
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWheelZoom({
  viewport,
  onViewportChange,
  containerRef,
  enabled = true,
  zoomSpeed = 0.002,
  minZoom = 0.1,
  maxZoom = 4
}: UseWheelZoomOptions) {
  // Keep viewport ref updated for event handler
  const viewportRef = useRef(viewport)
  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  // Throttle wheel events for smoother performance
  const lastWheelRef = useRef(0)

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!enabled) return

      // Only activate with Ctrl/Cmd key
      if (!e.ctrlKey && !e.metaKey) return

      // Prevent default browser zoom
      e.preventDefault()

      // Throttle to ~60fps
      const now = Date.now()
      if (now - lastWheelRef.current < 16) return
      lastWheelRef.current = now

      const vp = viewportRef.current

      // Calculate new zoom level
      const delta = -e.deltaY * zoomSpeed
      const newZoom = Math.max(minZoom, Math.min(maxZoom, vp.zoom * (1 + delta)))

      if (newZoom === vp.zoom) return

      // Get container rect for cursor position
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) {
        onViewportChange({ zoom: newZoom })
        return
      }

      // Cursor position relative to container center
      const cursorX = e.clientX - rect.left - rect.width / 2
      const cursorY = e.clientY - rect.top - rect.height / 2

      // Canvas position at cursor (before zoom)
      const canvasX = cursorX / vp.zoom + vp.x
      const canvasY = cursorY / vp.zoom + vp.y

      // New viewport position to keep cursor at same canvas position
      const newX = canvasX - cursorX / newZoom
      const newY = canvasY - cursorY / newZoom

      onViewportChange({ x: newX, y: newY, zoom: newZoom })
    },
    [enabled, onViewportChange, containerRef, zoomSpeed, minZoom, maxZoom]
  )

  useEffect(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    // Use passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [enabled, handleWheel, containerRef])
}
