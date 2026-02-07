/**
 * Canvas Keyboard Hook
 *
 * Keyboard shortcuts for canvas navigation:
 * - Ctrl/Cmd + Plus: Zoom in
 * - Ctrl/Cmd + Minus: Zoom out
 * - Ctrl/Cmd + 0: Reset view
 * - Ctrl/Cmd + 1: Fit to content
 * - Arrow keys: Pan viewport
 */

import type { Rect } from '../types'
import { useEffect, useCallback } from 'react'
import { Viewport } from '../spatial/index'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseCanvasKeyboardOptions {
  /** Current viewport state */
  viewport: Viewport
  /** Bounds of all canvas content (for fit-to-content) */
  canvasBounds: Rect | null
  /** Callback when viewport should change */
  onViewportChange: (changes: { x?: number; y?: number; zoom?: number }) => void
  /** Whether keyboard shortcuts are enabled */
  enabled?: boolean
  /** Pan amount per arrow key press (in screen pixels at zoom 1) */
  panAmount?: number
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasKeyboard({
  viewport,
  canvasBounds,
  onViewportChange,
  enabled = true,
  panAmount = 50
}: UseCanvasKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      // Don't activate if user is typing in an input
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return
      }

      const isMod = e.metaKey || e.ctrlKey

      // Zoom in: Ctrl/Cmd + Plus or Ctrl/Cmd + =
      if (isMod && (e.key === '+' || e.key === '=' || e.code === 'Equal')) {
        e.preventDefault()
        const newZoom = Math.min(viewport.zoom * 1.5, 4)
        onViewportChange({ zoom: newZoom })
        return
      }

      // Zoom out: Ctrl/Cmd + Minus
      if (isMod && (e.key === '-' || e.code === 'Minus')) {
        e.preventDefault()
        const newZoom = Math.max(viewport.zoom / 1.5, 0.1)
        onViewportChange({ zoom: newZoom })
        return
      }

      // Reset view: Ctrl/Cmd + 0
      if (isMod && (e.key === '0' || e.code === 'Digit0')) {
        e.preventDefault()
        onViewportChange({ x: 0, y: 0, zoom: 1 })
        return
      }

      // Fit to content: Ctrl/Cmd + 1
      if (isMod && (e.key === '1' || e.code === 'Digit1')) {
        e.preventDefault()
        if (canvasBounds && canvasBounds.width && canvasBounds.height) {
          const padding = 50
          const scaleX = (viewport.width - padding * 2) / canvasBounds.width
          const scaleY = (viewport.height - padding * 2) / canvasBounds.height
          const newZoom = Math.max(0.1, Math.min(scaleX, scaleY, 1))

          onViewportChange({
            x: canvasBounds.x + canvasBounds.width / 2,
            y: canvasBounds.y + canvasBounds.height / 2,
            zoom: newZoom
          })
        }
        return
      }

      // Arrow key panning (when no modifier)
      if (!isMod && !e.shiftKey && !e.altKey) {
        const scaledPanAmount = panAmount / viewport.zoom

        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault()
            onViewportChange({ y: viewport.y - scaledPanAmount })
            break
          case 'ArrowDown':
            e.preventDefault()
            onViewportChange({ y: viewport.y + scaledPanAmount })
            break
          case 'ArrowLeft':
            e.preventDefault()
            onViewportChange({ x: viewport.x - scaledPanAmount })
            break
          case 'ArrowRight':
            e.preventDefault()
            onViewportChange({ x: viewport.x + scaledPanAmount })
            break
        }
      }
    },
    [enabled, viewport, canvasBounds, onViewportChange, panAmount]
  )

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleKeyDown])
}
