/**
 * Minimap Component
 *
 * Canvas-based minimap for navigation on large canvases.
 * Renders fixed-budget Canvas v3 summary tiles instead of raw scene objects.
 */

import type { CanvasNode } from '../types'
import type { CanvasObjectKind, CanvasTileSummary, MinimapSummary } from '@xnetjs/canvas-core'
import { getDominantCanvasObjectKind } from '@xnetjs/canvas-core'
import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { getCanvasResolvedNodeKind } from '../scene/node-kind'
import { Viewport } from '../spatial/index'
import { useCanvasThemeTokens } from '../theme/canvas-theme'

// ─── Types ────────────────────────────────────────────────────────────────────

const MIN_DENSITY_ALPHA = 0.12
const MAX_DENSITY_ALPHA = 0.72

export interface MinimapProps {
  /** Fixed-budget summary of the canvas scene */
  summary: MinimapSummary
  /** Current viewport state */
  viewport: Viewport
  /** Minimap width in pixels */
  width?: number
  /** Minimap height in pixels */
  height?: number
  /** Callback when user interacts with minimap to change viewport */
  onViewportChange: (changes: { x?: number; y?: number; zoom?: number }) => void
  /** Optional CSS class name */
  className?: string
  /** Background color */
  backgroundColor?: string
  /** Show tile boundary diagnostics */
  showTileBoundaries?: boolean
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

export function getNodeMinimapColor(
  node: Pick<CanvasNode, 'type'> & { properties?: Record<string, unknown> }
): string {
  switch (getCanvasResolvedNodeKind(node)) {
    case 'page':
      return 'rgba(59, 130, 246, 0.7)'
    case 'database':
      return 'rgba(16, 185, 129, 0.7)'
    case 'external-reference':
      return 'rgba(236, 72, 153, 0.7)'
    case 'media':
      return 'rgba(139, 92, 246, 0.7)'
    case 'note':
      return 'rgba(245, 158, 11, 0.7)'
    case 'frame':
      return 'rgba(16, 185, 129, 0.5)' // Green (lighter for frames)
    case 'shape':
      return 'rgba(245, 158, 11, 0.7)' // Amber
    case 'group':
      return 'rgba(107, 114, 128, 0.3)' // Gray (lighter for groups)
    default:
      return 'rgba(107, 114, 128, 0.7)' // Gray default
  }
}

export function getCanvasObjectKindMinimapColor(kind: CanvasObjectKind): string {
  switch (kind) {
    case 'page':
      return 'rgba(59, 130, 246, 0.7)'
    case 'database':
      return 'rgba(16, 185, 129, 0.7)'
    case 'external-reference':
      return 'rgba(236, 72, 153, 0.7)'
    case 'media':
      return 'rgba(139, 92, 246, 0.7)'
    case 'note':
    case 'shape':
      return 'rgba(245, 158, 11, 0.7)'
    case 'group':
      return 'rgba(107, 114, 128, 0.35)'
  }
}

function getTileDominantColor(tile: CanvasTileSummary): string {
  return getCanvasObjectKindMinimapColor(getDominantCanvasObjectKind(tile.typeCounts))
}

// ─── Minimap Component ────────────────────────────────────────────────────────

export function Minimap({
  summary,
  viewport,
  width = 200,
  height = 150,
  onViewportChange,
  className,
  backgroundColor,
  showTileBoundaries = false
}: MinimapProps) {
  const theme = useCanvasThemeTokens()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const resolvedBackgroundColor = backgroundColor ?? theme.minimapBackground
  const canvasBounds = summary.bounds

  // Calculate scale to fit canvas bounds in minimap
  const scale = useMemo(() => {
    if (!canvasBounds.width || !canvasBounds.height) return 1
    const padding = 10
    const scaleX = (width - padding * 2) / canvasBounds.width
    const scaleY = (height - padding * 2) / canvasBounds.height
    return Math.min(scaleX, scaleY)
  }, [canvasBounds, width, height])

  // Calculate offset to center content
  const offset = useMemo(() => {
    return {
      x: width / 2 - (canvasBounds.x + canvasBounds.width / 2) * scale,
      y: height / 2 - (canvasBounds.y + canvasBounds.height / 2) * scale
    }
  }, [canvasBounds, scale, width, height])

  const maxDensityValue = useMemo(() => {
    return Math.max(
      1,
      ...summary.tiles.flatMap((tile) => tile.density.values.filter((value) => value > 0))
    )
  }, [summary.tiles])

  // Render minimap
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    // Set up canvas size
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Clear background
    ctx.fillStyle = resolvedBackgroundColor
    ctx.fillRect(0, 0, width, height)

    for (const tile of summary.tiles) {
      const tileColor = getTileDominantColor(tile)
      const cellWidth = tile.bounds.width / tile.density.columns
      const cellHeight = tile.bounds.height / tile.density.rows

      for (let index = 0; index < tile.density.values.length; index += 1) {
        const value = tile.density.values[index] ?? 0
        if (value <= 0) {
          continue
        }

        const column = index % tile.density.columns
        const row = Math.floor(index / tile.density.columns)
        const alpha =
          MIN_DENSITY_ALPHA +
          Math.min(value / maxDensityValue, 1) * (MAX_DENSITY_ALPHA - MIN_DENSITY_ALPHA)
        const x = (tile.bounds.x + column * cellWidth) * scale + offset.x
        const y = (tile.bounds.y + row * cellHeight) * scale + offset.y
        const w = Math.max(cellWidth * scale, 1)
        const h = Math.max(cellHeight * scale, 1)

        ctx.fillStyle = tileColor.replace(/[\d.]+\)$/u, `${alpha})`)
        ctx.fillRect(x, y, w, h)
      }

      if (showTileBoundaries) {
        ctx.strokeStyle = tile.dirty ? 'rgba(239, 68, 68, 0.7)' : theme.minimapBorder
        ctx.lineWidth = 1
        ctx.strokeRect(
          tile.bounds.x * scale + offset.x,
          tile.bounds.y * scale + offset.y,
          tile.bounds.width * scale,
          tile.bounds.height * scale
        )
      }
    }

    for (const cluster of summary.tiles.flatMap((tile) => tile.clusters)) {
      const x = cluster.bounds.x * scale + offset.x
      const y = cluster.bounds.y * scale + offset.y
      const w = Math.max(cluster.bounds.width * scale, summary.mode === 'small-scene' ? 3 : 2)
      const h = Math.max(cluster.bounds.height * scale, summary.mode === 'small-scene' ? 2 : 2)

      ctx.fillStyle = getCanvasObjectKindMinimapColor(cluster.dominantKind)
      ctx.fillRect(x, y, w, h)
    }

    // Draw viewport rectangle
    const visibleRect = viewport.getVisibleRect()
    const vx = visibleRect.x * scale + offset.x
    const vy = visibleRect.y * scale + offset.y
    const vw = visibleRect.width * scale
    const vh = visibleRect.height * scale

    // Viewport fill
    ctx.fillStyle = theme.minimapViewportFill
    ctx.fillRect(vx, vy, vw, vh)

    // Viewport border
    ctx.strokeStyle = theme.minimapViewportStroke
    ctx.lineWidth = 2
    ctx.strokeRect(vx, vy, vw, vh)

    // Minimap border
    ctx.strokeStyle = theme.minimapBorder
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
  }, [
    summary,
    viewport,
    canvasBounds,
    scale,
    offset,
    width,
    height,
    maxDensityValue,
    resolvedBackgroundColor,
    theme.minimapBorder,
    theme.minimapViewportFill,
    theme.minimapViewportStroke,
    showTileBoundaries
  ])

  // Convert minimap coordinates to canvas coordinates
  const minimapToCanvas = useCallback(
    (minimapX: number, minimapY: number) => {
      return {
        x: (minimapX - offset.x) / scale,
        y: (minimapY - offset.y) / scale
      }
    },
    [offset, scale]
  )

  // Handle click to navigate
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const minimapX = e.clientX - rect.left
      const minimapY = e.clientY - rect.top

      const canvasPos = minimapToCanvas(minimapX, minimapY)
      onViewportChange({ x: canvasPos.x, y: canvasPos.y })

      isDraggingRef.current = true
      e.preventDefault()
    },
    [minimapToCanvas, onViewportChange]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingRef.current) return

      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const minimapX = e.clientX - rect.left
      const minimapY = e.clientY - rect.top

      const canvasPos = minimapToCanvas(minimapX, minimapY)
      onViewportChange({ x: canvasPos.x, y: canvasPos.y })
    },
    [minimapToCanvas, onViewportChange]
  )

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  // Handle global mouse up
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false
    }

    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: theme.panelShadow,
        cursor: 'crosshair',
        userSelect: 'none'
      }}
      data-canvas-minimap="true"
      data-canvas-theme={theme.mode}
      data-canvas-minimap-node-count={summary.totalObjectCount}
      data-canvas-minimap-rendered-tile-count={summary.tiles.length}
      data-canvas-minimap-edge-count={summary.totalEdgeCount}
      data-canvas-minimap-render-mode={summary.mode}
      data-canvas-minimap-edge-mode="summary"
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        data-canvas-minimap-canvas="true"
      />
    </div>
  )
}

// ─── Map Icon ─────────────────────────────────────────────────────────────────

function MapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="4" width="4" height="3" fill="currentColor" opacity="0.6" />
      <rect x="9" y="8" width="3" height="2" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

// ─── Collapsible Minimap ──────────────────────────────────────────────────────

export interface CollapsibleMinimapProps extends MinimapProps {
  /** Whether minimap is expanded by default */
  defaultExpanded?: boolean
}

export function CollapsibleMinimap({ defaultExpanded = true, ...props }: CollapsibleMinimapProps) {
  const theme = useCanvasThemeTokens()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div
      className="collapsible-minimap"
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16
      }}
      data-canvas-minimap-shell="true"
      data-canvas-minimap-expanded={isExpanded ? 'true' : 'false'}
    >
      {isExpanded ? (
        <div style={{ position: 'relative' }}>
          <Minimap
            {...props}
            // Override position since we're wrapping
            className={props.className}
          />
          <button
            onClick={() => setIsExpanded(false)}
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 20,
              height: 20,
              border: 'none',
              background: theme.minimapOverlayBackground,
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.panelMutedText,
              zIndex: 1
            }}
            title="Hide minimap"
            aria-label="Hide minimap"
            data-canvas-minimap-toggle="hide"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2 5.5h8v1H2z" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            width: 32,
            height: 32,
            border: `1px solid ${theme.panelBorder}`,
            background: theme.panelBackground,
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: theme.panelShadow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.panelMutedText,
            backdropFilter: 'blur(16px)'
          }}
          title="Show minimap"
          aria-label="Show minimap"
          data-canvas-minimap-toggle="show"
        >
          <MapIcon />
        </button>
      )}
    </div>
  )
}
