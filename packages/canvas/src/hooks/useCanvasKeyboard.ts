/**
 * Canvas Keyboard Hook
 *
 * Keyboard shortcuts for canvas navigation and Canvas V2 object flows:
 * - Ctrl/Cmd + Plus: Zoom in
 * - Ctrl/Cmd + Minus: Zoom out
 * - Ctrl/Cmd + 0: Reset view
 * - Ctrl/Cmd + 1: Fit to content
 * - Arrow keys: Pan viewport or nudge selection
 * - Tab / Shift+Tab: Step selection
 * - P / D / N: Create page, database, note
 * - Enter / Alt+Enter / Ctrl+Enter: Peek, split, or open selection
 * - ?: Toggle shortcut help
 */

import type { CanvasAlignment, CanvasLayerDirection, Point, Rect } from '../types'
import type { RefObject } from 'react'
import { useCallback, useEffect } from 'react'
import { isTextInputLikeElement } from '../renderer/keyboard-shortcuts'
import { Viewport } from '../spatial/index'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CanvasCreationShortcut = 'page' | 'database' | 'note'

export type CanvasOpenShortcutMode = 'peek' | 'focus' | 'split'

export interface UseCanvasKeyboardOptions {
  /** Canvas surface element used to scope shortcuts */
  containerRef: RefObject<HTMLElement | null>
  /** Current viewport state */
  viewport: Viewport
  /** Bounds of all canvas content (for fit-to-content) */
  canvasBounds: Rect | null
  /** Callback when viewport should change */
  onViewportChange: (changes: { x?: number; y?: number; zoom?: number }) => void
  /** Callback when the current selection should be nudged */
  onNudgeSelection?: (delta: Point) => void
  /** Callback when the current selection should be deleted */
  onDeleteSelection?: () => void
  /** Callback when all canvas objects should be selected */
  onSelectAll?: () => void
  /** Callback when the current selection should be cleared */
  onClearSelection?: () => void
  /** Callback for keyboard-only selection stepping */
  onStepSelection?: (direction: -1 | 1) => void
  /** Callback for locking or unlocking the current selection */
  onToggleSelectionLock?: () => void
  /** Callback for alignment operations on the current selection */
  onAlignSelection?: (
    alignment: Extract<CanvasAlignment, 'left' | 'right' | 'top' | 'bottom'>
  ) => void
  /** Callback for layer ordering on the current selection */
  onShiftSelectionLayer?: (direction: CanvasLayerDirection) => void
  /** Callback for single-key object creation */
  onCreateObject?: (kind: CanvasCreationShortcut) => void
  /** Callback for peek/open actions on the current selection */
  onOpenSelection?: (mode: CanvasOpenShortcutMode) => void
  /** Callback for toggling the shortcut help overlay */
  onToggleShortcutHelp?: () => void
  /** Callback for dismissing transient canvas UI such as help overlays */
  onDismissTransientUi?: () => boolean | void
  /** Whether keyboard shortcuts are enabled */
  enabled?: boolean
  /** Number of selected nodes on the canvas */
  selectedNodeCount?: number
  /** Pan amount per arrow key press (in screen pixels at zoom 1) */
  panAmount?: number
  /** Nudge amount per arrow key press in canvas coordinates */
  nudgeAmount?: number
  /** Maximum zoom level */
  maxZoom?: number
  /** Minimum zoom level */
  minZoom?: number
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasKeyboard({
  containerRef,
  viewport,
  canvasBounds,
  onViewportChange,
  onNudgeSelection,
  onDeleteSelection,
  onSelectAll,
  onClearSelection,
  onStepSelection,
  onToggleSelectionLock,
  onAlignSelection,
  onShiftSelectionLayer,
  onCreateObject,
  onOpenSelection,
  onToggleShortcutHelp,
  onDismissTransientUi,
  enabled = true,
  selectedNodeCount = 0,
  panAmount = 50,
  nudgeAmount = 16,
  maxZoom = 4,
  minZoom = 0.1
}: UseCanvasKeyboardOptions): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      const container = containerRef.current
      if (!container) return

      const activeElement = document.activeElement
      if (!container.contains(activeElement)) {
        return
      }

      const isTyping = isTextInputLikeElement(activeElement)
      const isMod = e.metaKey || e.ctrlKey
      const normalizedKey = e.key.toLowerCase()

      if (e.key === 'Escape') {
        const dismissed = onDismissTransientUi?.()
        if (dismissed) {
          e.preventDefault()
          return
        }

        if (selectedNodeCount > 0) {
          e.preventDefault()
          onClearSelection?.()
        }
        return
      }

      if (isTyping) {
        return
      }

      // Zoom in: Ctrl/Cmd + Plus or Ctrl/Cmd + =
      if (isMod && (e.key === '+' || e.key === '=' || e.code === 'Equal')) {
        e.preventDefault()
        const newZoom = Math.min(viewport.zoom * 1.5, maxZoom)
        onViewportChange({ zoom: newZoom })
        return
      }

      // Zoom out: Ctrl/Cmd + Minus
      if (isMod && (e.key === '-' || e.code === 'Minus')) {
        e.preventDefault()
        const newZoom = Math.max(viewport.zoom / 1.5, minZoom)
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

      if (!isMod && !e.altKey && normalizedKey === 'tab' && onStepSelection) {
        e.preventDefault()
        onStepSelection(e.shiftKey ? -1 : 1)
        return
      }

      if (isMod && e.shiftKey && selectedNodeCount > 0) {
        if (normalizedKey === 'l') {
          e.preventDefault()
          onToggleSelectionLock?.()
          return
        }

        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          onAlignSelection?.('left')
          return
        }

        if (e.key === 'ArrowRight') {
          e.preventDefault()
          onAlignSelection?.('right')
          return
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          onAlignSelection?.('top')
          return
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onAlignSelection?.('bottom')
          return
        }
      }

      if (!isMod && !e.altKey && !e.shiftKey) {
        if (normalizedKey === 'p') {
          e.preventDefault()
          onCreateObject?.('page')
          return
        }

        if (normalizedKey === 'd') {
          e.preventDefault()
          onCreateObject?.('database')
          return
        }

        if (normalizedKey === 'n') {
          e.preventDefault()
          onCreateObject?.('note')
          return
        }
      }

      if (!isMod && ((e.shiftKey && e.key === '?') || (e.shiftKey && e.key === '/'))) {
        e.preventDefault()
        onToggleShortcutHelp?.()
        return
      }

      if (!isMod && !e.altKey && selectedNodeCount > 0) {
        if (e.key === '[') {
          e.preventDefault()
          onShiftSelectionLayer?.('backward')
          return
        }

        if (e.key === ']') {
          e.preventDefault()
          onShiftSelectionLayer?.('forward')
          return
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeCount > 0) {
        e.preventDefault()
        onDeleteSelection?.()
        return
      }

      if (isMod && normalizedKey === 'a') {
        e.preventDefault()
        onSelectAll?.()
        return
      }

      if (e.key === 'Enter' && selectedNodeCount > 0) {
        e.preventDefault()
        onOpenSelection?.(isMod ? 'focus' : e.altKey ? 'split' : 'peek')
        return
      }

      if (!isMod && !e.altKey) {
        const baseAmount = e.shiftKey ? nudgeAmount * 2 : nudgeAmount
        const scaledPanAmount = (e.shiftKey ? panAmount * 2 : panAmount) / viewport.zoom

        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault()
            if (selectedNodeCount > 0 && onNudgeSelection) {
              onNudgeSelection({ x: 0, y: -baseAmount })
            } else {
              onViewportChange({ y: viewport.y - scaledPanAmount })
            }
            return
          case 'ArrowDown':
            e.preventDefault()
            if (selectedNodeCount > 0 && onNudgeSelection) {
              onNudgeSelection({ x: 0, y: baseAmount })
            } else {
              onViewportChange({ y: viewport.y + scaledPanAmount })
            }
            return
          case 'ArrowLeft':
            e.preventDefault()
            if (selectedNodeCount > 0 && onNudgeSelection) {
              onNudgeSelection({ x: -baseAmount, y: 0 })
            } else {
              onViewportChange({ x: viewport.x - scaledPanAmount })
            }
            return
          case 'ArrowRight':
            e.preventDefault()
            if (selectedNodeCount > 0 && onNudgeSelection) {
              onNudgeSelection({ x: baseAmount, y: 0 })
            } else {
              onViewportChange({ x: viewport.x + scaledPanAmount })
            }
            return
        }
      }
    },
    [
      canvasBounds,
      containerRef,
      enabled,
      maxZoom,
      minZoom,
      nudgeAmount,
      onClearSelection,
      onAlignSelection,
      onCreateObject,
      onDeleteSelection,
      onDismissTransientUi,
      onNudgeSelection,
      onOpenSelection,
      onSelectAll,
      onShiftSelectionLayer,
      onStepSelection,
      onToggleSelectionLock,
      onToggleShortcutHelp,
      onViewportChange,
      panAmount,
      selectedNodeCount,
      viewport
    ]
  )

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleKeyDown])
}
