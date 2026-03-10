/**
 * Navigation Tools Component
 *
 * Zoom controls, fit-to-content, and reset view buttons for canvas navigation.
 */

import type { Rect } from '../types'
import { useCallback } from 'react'
import { Viewport } from '../spatial/index'
import { useCanvasThemeTokens } from '../theme/canvas-theme'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NavigationToolsProps {
  /** Current viewport state */
  viewport: Pick<Viewport, 'x' | 'y' | 'zoom' | 'width' | 'height'>
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
  /** Optional style overrides for the toolbar container */
  style?: React.CSSProperties
  /** Right inset used for bottom-right positioning */
  insetRight?: number
}

// ─── Navigation Tools Component ───────────────────────────────────────────────

export function NavigationTools({
  viewport,
  canvasBounds,
  onViewportChange,
  position = 'bottom-left',
  showZoomLabel = true,
  className,
  style,
  insetRight = 16
}: NavigationToolsProps) {
  const theme = useCanvasThemeTokens()

  const zoomIn = useCallback(() => {
    const newZoom = Math.min(viewport.zoom * 1.5, 4)
    onViewportChange({ zoom: newZoom })
  }, [viewport.zoom, onViewportChange])

  const zoomOut = useCallback(() => {
    const newZoom = Math.max(viewport.zoom / 1.5, 0.1)
    onViewportChange({ zoom: newZoom })
  }, [viewport.zoom, onViewportChange])

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

  const positionStyles = {
    ...getPositionStyles(position, insetRight, theme),
    ...style
  }

  const getButtonStyle = (disabled: boolean): React.CSSProperties => ({
    ...styles.button,
    color: disabled ? theme.panelButtonDisabled : theme.panelIconColor,
    background: 'transparent',
    cursor: disabled ? 'not-allowed' : 'pointer'
  })

  const dividerStyle: React.CSSProperties = {
    ...styles.divider,
    background: theme.panelDivider
  }

  const zoomLabelStyle: React.CSSProperties = {
    ...styles.zoomLabel,
    color: theme.panelMutedText
  }

  return (
    <div
      className={`navigation-tools ${className ?? ''}`}
      style={positionStyles}
      data-canvas-theme={theme.mode}
    >
      <div style={styles.toolGroup}>
        <button
          style={getButtonStyle(viewport.zoom <= 0.1)}
          onClick={zoomOut}
          title="Zoom out (Ctrl/Cmd -)"
          disabled={viewport.zoom <= 0.1}
          aria-label="Zoom out"
          data-navigation-tool="zoom-out"
        >
          <MinusIcon />
        </button>

        {showZoomLabel ? (
          <span style={zoomLabelStyle} title={`Current zoom: ${zoomPercent}%`} aria-live="polite">
            {zoomPercent}%
          </span>
        ) : null}

        <button
          style={getButtonStyle(viewport.zoom >= 4)}
          onClick={zoomIn}
          title="Zoom in (Ctrl/Cmd +)"
          disabled={viewport.zoom >= 4}
          aria-label="Zoom in"
          data-navigation-tool="zoom-in"
        >
          <PlusIcon />
        </button>
      </div>

      <div style={dividerStyle} />

      <div style={styles.toolGroup}>
        <button
          style={getButtonStyle(!canvasBounds)}
          onClick={fitToContent}
          title="Fit to content (Ctrl/Cmd 1)"
          disabled={!canvasBounds}
          aria-label="Fit to content"
          data-navigation-tool="fit"
        >
          <FitIcon />
        </button>

        <button
          style={getButtonStyle(false)}
          onClick={resetView}
          title="Reset view (Ctrl/Cmd 0)"
          aria-label="Reset view"
          data-navigation-tool="reset"
        >
          <ResetIcon />
        </button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getPositionStyles(
  position: string,
  insetRight: number,
  theme: ReturnType<typeof useCanvasThemeTokens>
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    padding: 4,
    background: theme.panelBackground,
    borderRadius: 999,
    boxShadow: theme.panelShadow,
    border: `1px solid ${theme.panelBorder}`,
    overflow: 'hidden',
    zIndex: 10
  }

  switch (position) {
    case 'bottom-left':
      return { ...base, bottom: 16, left: 16 }
    case 'bottom-right':
      return { ...base, bottom: 16, right: insetRight }
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
    gap: 1
  },
  button: {
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 120ms ease'
  },
  zoomLabel: {
    fontSize: 10,
    minWidth: 36,
    padding: '0 4px',
    textAlign: 'center' as const,
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none'
  },
  divider: {
    width: 1,
    height: 16,
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
