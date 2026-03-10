/**
 * Canvas edge layer.
 *
 * Renders non-interactive connectors onto a single canvas so dense scenes
 * avoid an SVG DOM node for every visible edge.
 */

import type { CanvasEdge, Rect } from '../types'
import React, { useEffect, useRef } from 'react'
import {
  createEdgeRenderer,
  type EdgeRenderer,
  type EdgeRendererViewport
} from '../layers/edge-renderer'

export interface CanvasEdgeCanvasLayerProps {
  edges: CanvasEdge[]
  nodeRects: Map<string, Rect>
  viewport: EdgeRendererViewport
}

function canUseCanvasEdgeLayer(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }

  return !/\bjsdom\b/i.test(window.navigator.userAgent)
}

export function CanvasEdgeCanvasLayer({
  edges,
  nodeRects,
  viewport
}: CanvasEdgeCanvasLayerProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<EdgeRenderer | null>(null)
  const latestRenderInputRef = useRef({
    edges,
    nodeRects,
    viewport
  })

  latestRenderInputRef.current = {
    edges,
    nodeRects,
    viewport
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container || !canUseCanvasEdgeLayer()) {
      return
    }

    let renderer: EdgeRenderer
    try {
      renderer = createEdgeRenderer(container)
    } catch {
      return
    }

    rendererRef.current = renderer
    renderer.resize()
    renderer.render(edges, nodeRects, viewport)

    const resizeObserver = new ResizeObserver(() => {
      const latest = latestRenderInputRef.current
      renderer.resize()
      renderer.render(latest.edges, latest.nodeRects, latest.viewport)
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      renderer.destroy()
      if (rendererRef.current === renderer) {
        rendererRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) {
      return
    }

    renderer.resize()
    renderer.render(edges, nodeRects, viewport)
  }, [edges, nodeRects, viewport])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-canvas-edge-layer="true"
      data-canvas-edge-count={edges.length}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none'
      }}
    />
  )
}
