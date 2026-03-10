/**
 * Minimap Component
 *
 * Canvas-based minimap for navigation on large canvases.
 * Shows a simplified overview of all nodes and edges with a viewport indicator.
 */

import type { CanvasNode, CanvasEdge } from '../types'
import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { getCanvasEdgeSourceObjectId, getCanvasEdgeTargetObjectId } from '../edges/bindings'
import { getCanvasResolvedNodeKind, isFrameLikeCanvasNode } from '../scene/node-kind'
import { Viewport } from '../spatial/index'
import { useCanvasThemeTokens } from '../theme/canvas-theme'

// ─── Types ────────────────────────────────────────────────────────────────────

const MAX_DIRECT_MINIMAP_NODES = 1200
const MINIMAP_BUCKET_SIZE_PX = 6

type MinimapRenderNode = {
  id: string
  type: CanvasNode['type']
  properties?: CanvasNode['properties']
  position: {
    x: number
    y: number
    width: number
    height: number
    zIndex?: number
  }
}

export interface MinimapProps {
  /** All canvas nodes */
  nodes: CanvasNode[]
  /** All canvas edges */
  edges: CanvasEdge[]
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
  /** Show edge lines */
  showEdges?: boolean
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

function getNodeMinimapColor(
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

// ─── Minimap Component ────────────────────────────────────────────────────────

export function Minimap({
  nodes,
  edges,
  viewport,
  width = 200,
  height = 150,
  onViewportChange,
  className,
  backgroundColor,
  showEdges = true
}: MinimapProps) {
  const theme = useCanvasThemeTokens()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const resolvedBackgroundColor = backgroundColor ?? theme.minimapBackground

  // Calculate bounds of all content
  const canvasBounds = useMemo(() => {
    if (nodes.length === 0) {
      return { x: -500, y: -500, width: 1000, height: 1000 }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of nodes) {
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + node.position.width)
      maxY = Math.max(maxY, node.position.y + node.position.height)
    }

    // Add padding
    const padding = Math.max(100, (maxX - minX) * 0.1, (maxY - minY) * 0.1)
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2
    }
  }, [nodes])

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

  const { renderNodes, renderMode } = useMemo(() => {
    if (nodes.length <= MAX_DIRECT_MINIMAP_NODES) {
      return {
        renderNodes: nodes as MinimapRenderNode[],
        renderMode: 'full' as const
      }
    }

    const buckets = new Map<
      string,
      {
        id: string
        minX: number
        minY: number
        maxX: number
        maxY: number
        typeCounts: Map<CanvasNode['type'], number>
      }
    >()

    for (const node of nodes) {
      const centerX = (node.position.x + node.position.width / 2) * scale + offset.x
      const centerY = (node.position.y + node.position.height / 2) * scale + offset.y
      const bucketX = Math.floor(centerX / MINIMAP_BUCKET_SIZE_PX)
      const bucketY = Math.floor(centerY / MINIMAP_BUCKET_SIZE_PX)
      const bucketKey = `${bucketX}:${bucketY}`
      const bucket = buckets.get(bucketKey)

      if (bucket) {
        bucket.minX = Math.min(bucket.minX, node.position.x)
        bucket.minY = Math.min(bucket.minY, node.position.y)
        bucket.maxX = Math.max(bucket.maxX, node.position.x + node.position.width)
        bucket.maxY = Math.max(bucket.maxY, node.position.y + node.position.height)
        bucket.typeCounts.set(node.type, (bucket.typeCounts.get(node.type) ?? 0) + 1)
      } else {
        buckets.set(bucketKey, {
          id: `bucket:${bucketKey}`,
          minX: node.position.x,
          minY: node.position.y,
          maxX: node.position.x + node.position.width,
          maxY: node.position.y + node.position.height,
          typeCounts: new Map([[node.type, 1]])
        })
      }
    }

    const aggregatedNodes = Array.from(buckets.values()).map((bucket) => {
      const dominantType =
        Array.from(bucket.typeCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ??
        'group'

      return {
        id: bucket.id,
        type: dominantType,
        position: {
          x: bucket.minX,
          y: bucket.minY,
          width: Math.max(bucket.maxX - bucket.minX, 40),
          height: Math.max(bucket.maxY - bucket.minY, 30),
          zIndex: 0
        }
      } satisfies MinimapRenderNode
    })

    return {
      renderNodes: aggregatedNodes,
      renderMode: 'aggregated' as const
    }
  }, [nodes, offset.x, offset.y, scale])

  const shouldRenderEdges = showEdges && renderMode === 'full'

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

    // Draw edges
    if (shouldRenderEdges && edges.length > 0) {
      ctx.strokeStyle = theme.minimapEdge
      ctx.lineWidth = 1
      ctx.beginPath()

      // Build node lookup for efficiency
      const nodeMap = new Map(nodes.map((n) => [n.id, n]))

      for (const edge of edges) {
        const sourceId = getCanvasEdgeSourceObjectId(edge)
        const targetId = getCanvasEdgeTargetObjectId(edge)
        const source = sourceId ? nodeMap.get(sourceId) : undefined
        const target = targetId ? nodeMap.get(targetId) : undefined
        if (!source || !target) continue

        const sx = (source.position.x + source.position.width / 2) * scale + offset.x
        const sy = (source.position.y + source.position.height / 2) * scale + offset.y
        const tx = (target.position.x + target.position.width / 2) * scale + offset.x
        const ty = (target.position.y + target.position.height / 2) * scale + offset.y

        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
      }
      ctx.stroke()
    }

    // Draw nodes (frames/groups first, then regular nodes on top)
    const sortedNodes = [...renderNodes].sort((a, b) => {
      const aKind = getCanvasResolvedNodeKind(a)
      const bKind = getCanvasResolvedNodeKind(b)
      const aIsContainer = aKind === 'frame' || aKind === 'group'
      const bIsContainer = bKind === 'frame' || bKind === 'group'
      if (aIsContainer && !bIsContainer) return -1
      if (!aIsContainer && bIsContainer) return 1
      return (a.position.zIndex ?? 0) - (b.position.zIndex ?? 0)
    })

    for (const node of sortedNodes) {
      const x = node.position.x * scale + offset.x
      const y = node.position.y * scale + offset.y
      const w = Math.max(node.position.width * scale, 3)
      const h = Math.max(node.position.height * scale, 2)

      ctx.fillStyle = getNodeMinimapColor(node)

      // Frames get a border instead of fill
      if (isFrameLikeCanvasNode(node)) {
        ctx.strokeStyle = getNodeMinimapColor(node)
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, w, h)
      } else {
        ctx.fillRect(x, y, w, h)
      }
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
    edges,
    nodes,
    viewport,
    canvasBounds,
    scale,
    offset,
    renderNodes,
    width,
    height,
    resolvedBackgroundColor,
    theme.minimapBorder,
    theme.minimapEdge,
    theme.minimapViewportFill,
    theme.minimapViewportStroke,
    shouldRenderEdges
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
      data-canvas-minimap-node-count={nodes.length}
      data-canvas-minimap-rendered-node-count={renderNodes.length}
      data-canvas-minimap-edge-count={edges.length}
      data-canvas-minimap-show-edges={showEdges ? 'true' : 'false'}
      data-canvas-minimap-render-mode={renderMode}
      data-canvas-minimap-edge-mode={shouldRenderEdges ? 'full' : 'hidden'}
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
