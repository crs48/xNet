/**
 * Drawing Layer Component
 *
 * Canvas-based layer for freehand drawing with pressure sensitivity.
 */

import type { DrawingPath, DrawingTool, Point } from './types'
import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, memo } from 'react'
import { DrawingToolController, drawPaths } from './drawing-tool'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrawingLayerProps {
  /** Viewport state for coordinate conversion */
  viewport: {
    x: number
    y: number
    zoom: number
    width: number
    height: number
  }
  /** Completed drawing paths to render */
  paths: DrawingPath[]
  /** Active drawing tool (null = not drawing) */
  activeTool: DrawingTool | null
  /** Called when a path is completed */
  onPathComplete: (path: DrawingPath) => void
  /** Convert screen coordinates to canvas coordinates */
  screenToCanvas?: (screenX: number, screenY: number) => Point
}

export interface DrawingLayerRef {
  /** Set the current tool */
  setTool: (tool: Partial<DrawingTool>) => void
  /** Clear and re-render paths */
  clear: () => void
  /** Force re-render */
  render: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DrawingLayer = memo(
  forwardRef<DrawingLayerRef, DrawingLayerProps>(function DrawingLayer(
    { viewport, paths, activeTool, onPathComplete, screenToCanvas },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const controllerRef = useRef<DrawingToolController | null>(null)
    const pathsRef = useRef<DrawingPath[]>(paths)
    const viewportRef = useRef(viewport)

    // Keep refs updated
    pathsRef.current = paths
    viewportRef.current = viewport

    // Default screen to canvas conversion
    const defaultScreenToCanvas = useCallback((screenX: number, screenY: number): Point => {
      const vp = viewportRef.current
      return {
        x: (screenX - vp.width / 2) / vp.zoom + vp.x,
        y: (screenY - vp.height / 2) / vp.zoom + vp.y
      }
    }, [])

    const toCanvas = screenToCanvas ?? defaultScreenToCanvas

    // Initialize controller
    useEffect(() => {
      if (!canvasRef.current) return

      controllerRef.current = new DrawingToolController(canvasRef.current, onPathComplete)

      return () => {
        controllerRef.current = null
      }
    }, [onPathComplete])

    // Update tool when it changes
    useEffect(() => {
      if (activeTool && controllerRef.current) {
        controllerRef.current.setTool(activeTool)
      }
    }, [activeTool])

    // Render all paths
    const renderPaths = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const vp = viewportRef.current

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Apply viewport transform
      ctx.save()
      ctx.setTransform(
        vp.zoom * dpr,
        0,
        0,
        vp.zoom * dpr,
        (-vp.x * vp.zoom + vp.width / 2) * dpr,
        (-vp.y * vp.zoom + vp.height / 2) * dpr
      )

      // Draw all paths
      drawPaths(ctx, pathsRef.current)

      ctx.restore()
    }, [])

    // Resize canvas and re-render
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = viewport.width * dpr
      canvas.height = viewport.height * dpr

      renderPaths()
    }, [viewport.width, viewport.height, renderPaths])

    // Re-render when paths or viewport change
    useEffect(() => {
      renderPaths()
    }, [paths, viewport.x, viewport.y, viewport.zoom, renderPaths])

    // Handle pointer events
    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (!activeTool || !controllerRef.current) return

        const rect = canvasRef.current!.getBoundingClientRect()
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        const canvasPoint = toCanvas(screenX, screenY)

        controllerRef.current.onPointerDown(e.nativeEvent, canvasPoint)
      },
      [activeTool, toCanvas]
    )

    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!controllerRef.current) return

        const rect = canvasRef.current!.getBoundingClientRect()
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        const canvasPoint = toCanvas(screenX, screenY)

        controllerRef.current.onPointerMove(e.nativeEvent, canvasPoint)
      },
      [toCanvas]
    )

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
      controllerRef.current?.onPointerUp(e.nativeEvent)
    }, [])

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        setTool: (tool) => controllerRef.current?.setTool(tool),
        clear: () => renderPaths(),
        render: () => renderPaths()
      }),
      [renderPaths]
    )

    return (
      <canvas
        ref={canvasRef}
        className="drawing-layer"
        style={styles.canvas}
        data-active={activeTool !== null}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    )
  })
)

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    touchAction: 'none'
  }
}
