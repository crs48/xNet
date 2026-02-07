/**
 * Navigation Tools Component
 *
 * Zoom controls, fit-to-content, and reset view buttons for canvas navigation.
 */

import type { Rect } from '../types'
import { useCallback } from 'react'
import { Viewport } from '../spatial/index'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NavigationToolsProps {
  /** Current viewport state */
  viewport: Viewport
  /** Bounds of all canvas content (for fit-to-content) */
  canvasBounds: Rect | null
  /** Callback when viewport should change */
  onViewportChange: (changes: { x?: number; y?: number; zoom?: number }) => void
  /** Position of the toolbar */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  /** Show zoom percentage label */
  showZoomLabel?: boolean
  /** Optional CSS class name */
  className?: string
}

// ─── Navigation Tools Component ───────────────────────────────────────────────

export function NavigationTools({
  viewport,
  canvasBounds,
  onViewportChange,
  position = 'bottom-left',
  showZoomLabel = true,
  className
}: NavigationToolsProps) {
  const zoomIn = useCallback(() => {
    const newZoom = Math.min(viewport.zoom * 1.5, 4)
    onViewportChange({ zoom: newZoom })
  }, [viewport.zoom, onViewportChange])

  const zoomOut = useCallback(() => {
    const newZoom = Math.max(viewport.zoom / 1.5, 0.1)
    onViewportChange({ zoom: newZoom })
  }, [viewport.zoom, onViewportChange])

  const zoomTo = useCallback(
    (zoom: number) => {
      const clampedZoom = Math.max(0.1, Math.min(4, zoom))
      onViewportChange({ zoom: clampedZoom })
    },
    [onViewportChange]
  )

  const fitToContent = useCallback(() => {
    if (!canvasBounds || !canvasBounds.width || !canvasBounds.height) return

    const padding = 50
    const scaleX = (viewport.width - padding * 2) / canvasBounds.width
    const scaleY = (viewport.height - padding * 2) / canvasBounds.height
    const newZoom = Math.min(scaleX, scaleY, 1) // Don't zoom in past 100%

    onViewportChange({
      x: canvasBounds.x + canvasBounds.width / 2,
      y: canvasBounds.y + canvasBounds.height / 2,
      zoom: Math.max(0.1, newZoom)
    })
  }, [viewport.width, viewport.height, canvasBounds, onViewportChange])

  const resetView = useCallback(() => {
    onViewportChange({ x: 0, y: 0, zoom: 1 })
  }, [onViewportChange])

  const zoomPercent = Math.round(viewport.zoom * 100)

  const positionStyles = getPositionStyles(position)

  return (
    <div className={`navigation-tools ${className ?? ''}`} style={positionStyles}>
      <div style={styles.toolGroup}>
        <button
          style={styles.button}
          onClick={zoomIn}
          title="Zoom In (Ctrl/Cmd +)"
          disabled={viewport.zoom >= 4}
          aria-label="Zoom in"
        >
          <PlusIcon />
        </button>

        <div style={styles.sliderContainer}>
          <input
            type="range"
            min="10"
            max="400"
            value={zoomPercent}
            onChange={(e) => zoomTo(Number(e.target.value) / 100)}
            style={styles.slider}
            title={`${zoomPercent}%`}
            aria-label="Zoom level"
          />
          {showZoomLabel && <span style={styles.zoomLabel}>{zoomPercent}%</span>}
        </div>

        <button
          style={styles.button}
          onClick={zoomOut}
          title="Zoom Out (Ctrl/Cmd -)"
          disabled={viewport.zoom <= 0.1}
          aria-label="Zoom out"
        >
          <MinusIcon />
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.toolGroup}>
        <button
          style={styles.button}
          onClick={fitToContent}
          title="Fit to Content (Ctrl/Cmd 1)"
          disabled={!canvasBounds}
          aria-label="Fit to content"
        >
          <FitIcon />
        </button>

        <button
          style={styles.button}
          onClick={resetView}
          title="Reset View (Ctrl/Cmd 0)"
          aria-label="Reset view"
        >
          <ResetIcon />
        </button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getPositionStyles(position: string): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'white',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    border: '1px solid #e5e7eb',
    zIndex: 10
  }

  switch (position) {
    case 'bottom-left':
      return { ...base, bottom: 16, left: 16 }
    case 'bottom-right':
      return { ...base, bottom: 16, right: 240 } // Offset for minimap
    case 'top-left':
      return { ...base, top: 16, left: 16 }
    case 'top-right':
      return { ...base, top: 16, right: 16 }
    default:
      return { ...base, bottom: 16, left: 16 }
  }
}

const styles: Record<string, React.CSSProperties> = {
  toolGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  button: {
    width: 28,
    height: 28,
    border: 'none',
    background: 'transparent',
    borderRadius: 4,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#374151'
  },
  sliderContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  slider: {
    width: 80,
    height: 4,
    cursor: 'pointer'
  },
  zoomLabel: {
    fontSize: 11,
    color: '#6b7280',
    minWidth: 32,
    textAlign: 'right' as const
  },
  divider: {
    width: 1,
    height: 20,
    background: '#e5e7eb',
    margin: '0 4px'
  }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function FitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  )
}
