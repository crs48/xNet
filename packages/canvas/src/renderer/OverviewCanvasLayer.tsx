/**
 * Canvas overview layer.
 *
 * Draws simplified far-field objects on a canvas so dense scenes do not
 * require every visible object to mount as a DOM island.
 */

import type { Viewport } from '../spatial'
import type { CanvasNode } from '../types'
import React, { useEffect, useMemo, useRef } from 'react'
import { getCanvasResolvedNodeKind } from '../scene/node-kind'

export interface OverviewCanvasLayerProps {
  nodes: CanvasNode[]
  viewport: Viewport
}

function getNodeFill(node: CanvasNode): string {
  switch (getCanvasResolvedNodeKind(node)) {
    case 'page':
      return 'rgba(59, 130, 246, 0.18)'
    case 'database':
      return 'rgba(16, 185, 129, 0.18)'
    case 'external-reference':
      return 'rgba(236, 72, 153, 0.18)'
    case 'media':
      return 'rgba(139, 92, 246, 0.18)'
    case 'note':
      return 'rgba(245, 158, 11, 0.2)'
    case 'group':
      return 'rgba(107, 114, 128, 0.1)'
    case 'shape':
      return 'rgba(14, 165, 233, 0.16)'
    case 'frame':
      return 'rgba(16, 185, 129, 0.08)'
    default:
      return 'rgba(148, 163, 184, 0.16)'
  }
}

function getNodeStroke(node: CanvasNode): string {
  switch (getCanvasResolvedNodeKind(node)) {
    case 'page':
      return 'rgba(37, 99, 235, 0.55)'
    case 'database':
      return 'rgba(5, 150, 105, 0.55)'
    case 'external-reference':
      return 'rgba(219, 39, 119, 0.55)'
    case 'media':
      return 'rgba(124, 58, 237, 0.55)'
    case 'note':
      return 'rgba(217, 119, 6, 0.6)'
    case 'group':
      return 'rgba(100, 116, 139, 0.35)'
    case 'shape':
      return 'rgba(2, 132, 199, 0.45)'
    case 'frame':
      return 'rgba(5, 150, 105, 0.3)'
    default:
      return 'rgba(100, 116, 139, 0.45)'
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const clampedRadius = Math.max(0, Math.min(radius, width / 2, height / 2))

  ctx.beginPath()
  ctx.moveTo(x + clampedRadius, y)
  ctx.lineTo(x + width - clampedRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius)
  ctx.lineTo(x + width, y + height - clampedRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height)
  ctx.lineTo(x + clampedRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius)
  ctx.lineTo(x, y + clampedRadius)
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y)
  ctx.closePath()
}

export function OverviewCanvasLayer({
  nodes,
  viewport
}: OverviewCanvasLayerProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sortedNodes = useMemo(
    () =>
      [...nodes].sort((left, right) => {
        const leftZ = left.position.zIndex ?? 0
        const rightZ = right.position.zIndex ?? 0
        if (leftZ !== rightZ) {
          return leftZ - rightZ
        }

        return left.id.localeCompare(right.id)
      }),
    [nodes]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(viewport.width * dpr))
    const height = Math.max(1, Math.round(viewport.height * dpr))

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (sortedNodes.length === 0) {
      return
    }

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    ctx.setTransform(
      viewport.zoom * dpr,
      0,
      0,
      viewport.zoom * dpr,
      -viewport.x * viewport.zoom * dpr + centerX,
      -viewport.y * viewport.zoom * dpr + centerY
    )

    for (const node of sortedNodes) {
      const { x, y, width: nodeWidth, height: nodeHeight } = node.position
      const radius = Math.max(8 / Math.max(viewport.zoom, 1), 4)

      ctx.fillStyle = getNodeFill(node)
      ctx.strokeStyle = getNodeStroke(node)
      ctx.lineWidth = 1 / Math.max(viewport.zoom, 1)

      drawRoundedRect(ctx, x, y, nodeWidth, nodeHeight, radius)
      ctx.fill()
      ctx.stroke()
    }
  }, [sortedNodes, viewport])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-canvas-overview-layer="true"
      data-canvas-overview-node-count={sortedNodes.length}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
      }}
    />
  )
}
