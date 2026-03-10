/**
 * Canvas Component
 *
 * Main infinite canvas component with pan, zoom, and node rendering.
 */

import type {
  CanvasAlignment,
  CanvasConfig,
  CanvasDistributionAxis,
  CanvasLayerDirection,
  CanvasNode,
  GridType,
  Point,
  Rect
} from '../types'
import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
  useImperativeHandle,
  useMemo,
  forwardRef
} from 'react'
import * as Y from 'yjs'
import { CommentOverlay } from '../comments/CommentOverlay'
import { CollapsibleMinimap } from '../components/Minimap'
import { NavigationTools } from '../components/NavigationTools'
import { CanvasEdgeComponent } from '../edges/CanvasEdgeComponent'
import { useCanvas } from '../hooks/useCanvas'
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard'
import { createGridLayer, type GridLayer } from '../layers'
import { CanvasNodeComponent, calculateLOD, type LODLevel } from '../nodes/CanvasNodeComponent'
import {
  createAlignmentUpdates,
  createDistributionUpdates,
  createLayerShiftUpdates,
  createLockUpdates,
  createTidySelectionUpdates,
  getSelectionBounds,
  getSelectionLockState,
  getUnlockedSelection
} from '../selection/scene-operations'
import { useCanvasThemeTokens } from '../theme/canvas-theme'
import { createCanvasDisplayList } from './display-list'
import { handleUndoRedoShortcut, isTextInputLikeElement } from './keyboard-shortcuts'
import { OverviewCanvasLayer } from './OverviewCanvasLayer'

/** Minimal Awareness interface (avoids y-protocols dependency) */
interface AwarenessLike {
  clientID: number
  getStates(): Map<number, Record<string, unknown>>
  setLocalStateField(field: string, value: unknown): void
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
}

/**
 * Remote user presence on the canvas
 */
export interface CanvasRemoteUser {
  clientId: number
  did: string
  color: string
  /** Node IDs this user has selected */
  selectedNodes?: string[]
}

/**
 * Imperative handle for Canvas component
 */
export interface CanvasHandle {
  /** Fit the viewport to show all content */
  fitToContent: (padding?: number) => void
  /** Fit the viewport to a specific rectangle */
  fitToRect: (rect: Rect, padding?: number) => void
  /** Reset viewport to origin at zoom 1 */
  resetView: () => void
  /** Get the current viewport state */
  getViewportSnapshot: () => { x: number; y: number; zoom: number }
  /** Restore a previous viewport state */
  setViewportSnapshot: (snapshot: { x: number; y: number; zoom: number }) => void
  /** Clear the current selection */
  clearSelection: () => void
  /** Lock or unlock the current selection */
  toggleSelectionLock: () => boolean
  /** Align the current selection */
  alignSelection: (alignment: CanvasAlignment) => boolean
  /** Distribute the current selection */
  distributeSelection: (axis: CanvasDistributionAxis) => boolean
  /** Tidy the current selection into a compact grid */
  tidySelection: () => boolean
  /** Move the current selection through z-order */
  shiftSelectionLayer: (direction: CanvasLayerDirection) => boolean
  /** Convert a client-space point to canvas coordinates */
  screenToCanvas: (clientX: number, clientY: number) => Point
}

export interface CanvasSelectionSnapshot {
  nodeIds: string[]
  edgeIds: string[]
}

export interface CanvasSurfaceEventContext {
  viewportSnapshot: { x: number; y: number; zoom: number }
  screenToCanvas: (clientX: number, clientY: number) => Point
}

export interface CanvasProps {
  /** Y.Doc containing the canvas data */
  doc: Y.Doc
  /** Canvas configuration */
  config?: CanvasConfig
  /** Initial viewport state */
  initialViewport?: { x?: number; y?: number; zoom?: number }
  /** Custom node renderer */
  renderNode?: (node: CanvasNode, context: CanvasNodeRenderContext) => React.ReactNode
  /** Callback when node is double-clicked */
  onNodeDoubleClick?: (id: string) => void
  /** Callback when canvas background is clicked */
  onBackgroundClick?: () => void
  /** Callback when the canvas selection changes */
  onSelectionChange?: (selection: CanvasSelectionSnapshot) => void
  /** Callback when the user triggers a canvas creation shortcut */
  onCreateObject?: (kind: 'page' | 'database' | 'note') => void
  /** Callback when the user triggers a selection open/peek shortcut */
  onOpenSelection?: (mode: 'peek' | 'focus' | 'split') => void
  /** Callback when the user toggles canvas shortcut help */
  onToggleShortcutHelp?: () => void
  /** Callback when transient canvas UI should be dismissed before clearing selection */
  onDismissTransientUi?: () => boolean | void
  /** Callback when content is dropped on the canvas surface */
  onSurfaceDrop?: (
    event: React.DragEvent<HTMLDivElement>,
    context: CanvasSurfaceEventContext
  ) => void
  /** Callback when the user pastes content into the focused canvas surface */
  onSurfacePaste?: (
    event: React.ClipboardEvent<HTMLDivElement>,
    context: CanvasSurfaceEventContext
  ) => void
  /** Callback during drag-over for custom drop affordances */
  onSurfaceDragOver?: (event: React.DragEvent<HTMLDivElement>) => void
  /** Yjs Awareness instance for presence (optional) */
  awareness?: AwarenessLike | null
  /** CSS class name */
  className?: string
  /** CSS styles */
  style?: React.CSSProperties
  /** Canvas Node ID for comments (enables comment overlay) */
  canvasNodeId?: string
  /** Schema IRI of the canvas (optimization for comments) */
  canvasSchema?: string
  /** Render built-in canvas navigation tools */
  showNavigationTools?: boolean
  /** Render the built-in canvas minimap */
  showMinimap?: boolean
  /** Whether the minimap starts expanded */
  minimapDefaultExpanded?: boolean
  /** Minimap width in pixels */
  minimapWidth?: number
  /** Minimap height in pixels */
  minimapHeight?: number
  /** Show edge lines in the minimap */
  minimapShowEdges?: boolean
  /** Optional class name for the built-in minimap */
  minimapClassName?: string
  /** Position for the built-in navigation tools */
  navigationToolsPosition?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  /** Show the zoom percentage inside the built-in navigation tools */
  navigationToolsShowZoomLabel?: boolean
  /** Optional class name for the built-in navigation tools */
  navigationToolsClassName?: string
  /** Optional style overrides for the built-in navigation tools */
  navigationToolsStyle?: React.CSSProperties
}

export interface CanvasNodeRenderContext {
  selected: boolean
  lod: LODLevel
  selectionSize: number
  viewportZoom: number
}

/**
 * WebGL Grid background hook
 *
 * Creates and manages the WebGL grid layer lifecycle.
 * Falls back to CSS grid if WebGL is unavailable.
 */
function useWebGLGrid(
  containerRef: React.RefObject<HTMLDivElement | null>,
  config: {
    showGrid: boolean
    gridType: GridType
    gridSize: number
    gridColor: [number, number, number, number]
    majorGridColor: [number, number, number, number]
    axisColor: [number, number, number, number]
  },
  viewport: { x: number; y: number; zoom: number }
): void {
  const gridLayerRef = useRef<GridLayer | null>(null)

  // Initialize/cleanup grid layer
  useEffect(() => {
    const container = containerRef.current
    if (!container || !config.showGrid || config.gridType === 'none') {
      // Cleanup if grid is disabled
      gridLayerRef.current?.destroy()
      gridLayerRef.current = null
      return
    }

    // Create grid layer (WebGL with CSS fallback)
    gridLayerRef.current = createGridLayer(container, {
      type: config.gridType === 'dots' ? 'dots' : 'lines',
      gridSpacing: config.gridSize,
      gridColor: config.gridColor,
      majorGridColor: config.majorGridColor,
      axisColor: config.axisColor,
      majorEvery: 5
    })

    // Initial resize
    gridLayerRef.current.resize()

    return () => {
      gridLayerRef.current?.destroy()
      gridLayerRef.current = null
    }
  }, [
    containerRef,
    config.showGrid,
    config.gridType,
    config.gridSize,
    config.gridColor,
    config.majorGridColor,
    config.axisColor
  ])

  // Handle resize - uses ref to avoid re-subscribing on viewport changes
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  useEffect(() => {
    const container = containerRef.current
    if (!container || !gridLayerRef.current) return

    const handleResize = () => {
      gridLayerRef.current?.resize()
      // Re-render after resize with current viewport from ref
      gridLayerRef.current?.render(viewportRef.current)
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(container)

    return () => observer.disconnect()
  }, [containerRef])

  // Render on viewport change
  useEffect(() => {
    gridLayerRef.current?.render(viewport)
  }, [viewport.x, viewport.y, viewport.zoom])
}

/**
 * Canvas Component
 */
export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    doc,
    config = {},
    initialViewport,
    renderNode,
    onNodeDoubleClick,
    onBackgroundClick,
    onSelectionChange,
    onCreateObject,
    onOpenSelection,
    onToggleShortcutHelp,
    onDismissTransientUi,
    onSurfaceDrop,
    onSurfacePaste,
    onSurfaceDragOver,
    awareness,
    className,
    style,
    canvasNodeId,
    canvasSchema,
    showNavigationTools = false,
    showMinimap = false,
    minimapDefaultExpanded = true,
    minimapWidth = 200,
    minimapHeight = 150,
    minimapShowEdges = true,
    minimapClassName,
    navigationToolsPosition = 'bottom-left',
    navigationToolsShowZoomLabel = true,
    navigationToolsClassName,
    navigationToolsStyle
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const undoManagerRef = useRef<Y.UndoManager | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const lastMousePos = useRef<Point>({ x: 0, y: 0 })
  const theme = useCanvasThemeTokens()

  // Track initial positions when drag starts to prevent drift during fast drags
  // Key: nodeId, Value: { x, y } at drag start
  const dragInitialPositions = useRef<Map<string, Point>>(new Map())
  // Track cumulative drag offset since drag started
  const dragCumulativeOffset = useRef<Point>({ x: 0, y: 0 })

  // Use canvas hook
  const canvas = useCanvas({ doc, config, initialViewport })

  // Extract grid config with defaults
  const gridConfig = useMemo(
    () => ({
      showGrid: config.showGrid !== false,
      gridType: config.gridType ?? 'dots',
      gridSize: config.gridSize ?? 20,
      gridColor: theme.gridColor,
      majorGridColor: theme.majorGridColor,
      axisColor: theme.axisColor
    }),
    [
      config.showGrid,
      config.gridType,
      config.gridSize,
      theme.axisColor,
      theme.gridColor,
      theme.majorGridColor
    ]
  )

  // Initialize WebGL grid layer (or CSS fallback)
  useWebGLGrid(containerRef, gridConfig, {
    x: canvas.viewport.x,
    y: canvas.viewport.y,
    zoom: canvas.viewport.zoom
  })

  const {
    nodes,
    edges,
    renderNodes,
    renderEdges,
    chunkStats,
    selectedNodeIds,
    selectedEdgeIds,
    viewport,
    selectNode,
    clearSelection,
    updateNodes,
    updateNodePosition,
    setViewportSize,
    pan,
    zoomAt
  } = canvas

  const clientToCanvas = useCallback(
    (clientX: number, clientY: number): Point => {
      const container = containerRef.current
      if (!container) {
        return { x: viewport.x, y: viewport.y }
      }

      const rect = container.getBoundingClientRect()
      return viewport.screenToCanvas(clientX - rect.left, clientY - rect.top)
    },
    [viewport]
  )

  const getSelectedNodes = useCallback(
    () =>
      Array.from(selectedNodeIds)
        .map((nodeId) => canvas.store.getNode(nodeId))
        .filter((node): node is CanvasNode => node !== undefined),
    [canvas.store, selectedNodeIds]
  )

  const applySelectionPositionUpdates = useCallback(
    (updates: Array<{ id: string; position: Partial<CanvasNode['position']> }>): boolean => {
      if (updates.length === 0) {
        return false
      }

      canvas.updateNodePositions(updates)
      return true
    },
    [canvas]
  )

  const handleToggleSelectionLock = useCallback((): boolean => {
    const selectedNodes = getSelectedNodes()
    const updates = createLockUpdates(selectedNodes)

    if (updates.length === 0) {
      return false
    }

    updateNodes(updates.map((update) => ({ id: update.id, changes: { locked: update.locked } })))
    return true
  }, [getSelectedNodes, updateNodes])

  const handleAlignSelection = useCallback(
    (alignment: CanvasAlignment): boolean => {
      const selectedNodes = getUnlockedSelection(getSelectedNodes())
      return applySelectionPositionUpdates(createAlignmentUpdates(selectedNodes, alignment))
    },
    [applySelectionPositionUpdates, getSelectedNodes]
  )

  const handleDistributeSelection = useCallback(
    (axis: CanvasDistributionAxis): boolean => {
      const selectedNodes = getUnlockedSelection(getSelectedNodes())
      return applySelectionPositionUpdates(createDistributionUpdates(selectedNodes, axis))
    },
    [applySelectionPositionUpdates, getSelectedNodes]
  )

  const handleTidySelection = useCallback((): boolean => {
    const selectedNodes = getUnlockedSelection(getSelectedNodes())
    return applySelectionPositionUpdates(createTidySelectionUpdates(selectedNodes))
  }, [applySelectionPositionUpdates, getSelectedNodes])

  const handleShiftSelectionLayer = useCallback(
    (direction: CanvasLayerDirection): boolean => {
      const selectedNodes = getUnlockedSelection(getSelectedNodes())
      return applySelectionPositionUpdates(createLayerShiftUpdates(selectedNodes, direction))
    },
    [applySelectionPositionUpdates, getSelectedNodes]
  )

  // Expose imperative methods via ref
  useImperativeHandle(
    ref,
    () => ({
      fitToContent: (padding?: number) => canvas.fitToContent(padding),
      fitToRect: (rect: Rect, padding?: number) => canvas.fitToRect(rect, padding),
      resetView: () => canvas.resetView(),
      getViewportSnapshot: () => canvas.getViewportSnapshot(),
      setViewportSnapshot: (snapshot: { x: number; y: number; zoom: number }) =>
        canvas.setViewportSnapshot(snapshot),
      clearSelection: () => clearSelection(),
      toggleSelectionLock: () => handleToggleSelectionLock(),
      alignSelection: (alignment: CanvasAlignment) => handleAlignSelection(alignment),
      distributeSelection: (axis: CanvasDistributionAxis) => handleDistributeSelection(axis),
      tidySelection: () => handleTidySelection(),
      shiftSelectionLayer: (direction: CanvasLayerDirection) =>
        handleShiftSelectionLayer(direction),
      screenToCanvas: (clientX: number, clientY: number) => clientToCanvas(clientX, clientY)
    }),
    [
      canvas,
      clearSelection,
      clientToCanvas,
      handleAlignSelection,
      handleDistributeSelection,
      handleShiftSelectionLayer,
      handleTidySelection,
      handleToggleSelectionLock
    ]
  )

  const createSurfaceEventContext = useCallback(
    (): CanvasSurfaceEventContext => ({
      viewportSnapshot: canvas.getViewportSnapshot(),
      screenToCanvas: clientToCanvas
    }),
    [canvas, clientToCanvas]
  )

  // === Presence: track remote users' selected nodes ===
  const [nodePresence, setNodePresence] = useState<Map<string, CanvasRemoteUser[]>>(new Map())

  // Broadcast local selection to awareness
  useEffect(() => {
    if (!awareness) return
    awareness.setLocalStateField('canvasSelection', Array.from(selectedNodeIds))
  }, [awareness, selectedNodeIds])

  useEffect(() => {
    onSelectionChange?.({
      nodeIds: Array.from(selectedNodeIds),
      edgeIds: Array.from(selectedEdgeIds)
    })
  }, [onSelectionChange, selectedEdgeIds, selectedNodeIds])

  // Listen for remote awareness changes
  useEffect(() => {
    if (!awareness) return

    const updatePresence = () => {
      const states = awareness.getStates()
      const presenceMap = new Map<string, CanvasRemoteUser[]>()

      states.forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return // skip self
        const user = state.user as { did?: string; color?: string } | undefined
        if (!user?.did) return

        const selectedNodes = state.canvasSelection as string[] | undefined
        if (!selectedNodes || selectedNodes.length === 0) return

        const remoteUser: CanvasRemoteUser = {
          clientId,
          did: user.did,
          color: user.color || '#888',
          selectedNodes
        }

        for (const nodeId of selectedNodes) {
          const existing = presenceMap.get(nodeId) || []
          existing.push(remoteUser)
          presenceMap.set(nodeId, existing)
        }
      })

      setNodePresence(presenceMap)
    }

    updatePresence()
    awareness.on('change', updatePresence)
    return () => awareness.off('change', updatePresence)
  }, [awareness])

  // Update viewport size on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      setViewportSize(container.clientWidth, container.clientHeight)
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)

    return () => observer.disconnect()
  }, [setViewportSize])

  // Attach wheel handler with { passive: false } so preventDefault works
  // (React's onWheel registers as passive by default in modern browsers)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom: scale factor by deltaY magnitude for smooth control
        // Clamp delta to avoid extreme jumps from fast scrolling
        const delta = Math.max(-10, Math.min(10, e.deltaY))
        const factor = 1 - delta * 0.01
        // Convert client coordinates to container-relative coordinates
        const rect = container.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        zoomAt(x, y, factor)
      } else {
        // Pan
        pan(-e.deltaX, -e.deltaY)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [pan, zoomAt])

  // Handle background mouse down for pan and far-field hit testing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if (e.target !== containerRef.current) return

      containerRef.current?.focus()

      const canvasPoint = clientToCanvas(e.clientX, e.clientY)
      const hitNode = canvas.findNodeAt(canvasPoint.x, canvasPoint.y)

      if (hitNode) {
        selectNode(hitNode.id, e.shiftKey || e.metaKey)
        return
      }

      // Clicked on background
      clearSelection()
      onBackgroundClick?.()

      // Start panning
      setIsDragging(true)
      lastMousePos.current = { x: e.clientX, y: e.clientY }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - lastMousePos.current.x
        const deltaY = moveEvent.clientY - lastMousePos.current.y
        lastMousePos.current = { x: moveEvent.clientX, y: moveEvent.clientY }
        pan(deltaX, deltaY)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [canvas, clearSelection, clientToCanvas, onBackgroundClick, pan, selectNode]
  )

  const handleBackgroundDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== containerRef.current) {
        return
      }

      const canvasPoint = clientToCanvas(e.clientX, e.clientY)
      const hitNode = canvas.findNodeAt(canvasPoint.x, canvasPoint.y)
      if (hitNode) {
        onNodeDoubleClick?.(hitNode.id)
      }
    },
    [canvas, clientToCanvas, onNodeDoubleClick]
  )

  const handleSurfaceDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (onSurfaceDrop) {
        event.preventDefault()
      }

      onSurfaceDragOver?.(event)
    },
    [onSurfaceDrop, onSurfaceDragOver]
  )

  const handleSurfaceDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!onSurfaceDrop) {
        return
      }

      event.preventDefault()
      containerRef.current?.focus()
      onSurfaceDrop(event, createSurfaceEventContext())
    },
    [createSurfaceEventContext, onSurfaceDrop]
  )

  const handleSurfacePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!onSurfacePaste) {
        return
      }

      onSurfacePaste(event, createSurfaceEventContext())
    },
    [createSurfaceEventContext, onSurfacePaste]
  )

  const handleStepSelection = useCallback(
    (direction: -1 | 1) => {
      const navigableNodes = renderNodes.length > 0 ? renderNodes : nodes
      if (navigableNodes.length === 0) {
        return
      }

      const orderedNodes = [...navigableNodes].sort((left, right) => {
        const leftZ = left.position.zIndex ?? 0
        const rightZ = right.position.zIndex ?? 0
        if (leftZ !== rightZ) {
          return leftZ - rightZ
        }

        if (left.position.y !== right.position.y) {
          return left.position.y - right.position.y
        }

        return left.position.x - right.position.x
      })

      if (selectedNodeIds.size !== 1) {
        const fallbackNode = direction > 0 ? orderedNodes[0] : orderedNodes[orderedNodes.length - 1]
        selectNode(fallbackNode.id)
        return
      }

      const [currentId] = Array.from(selectedNodeIds)
      const currentIndex = orderedNodes.findIndex((node) => node.id === currentId)
      const resolvedIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = (resolvedIndex + direction + orderedNodes.length) % orderedNodes.length
      selectNode(orderedNodes[nextIndex].id)
    },
    [nodes, renderNodes, selectNode, selectedNodeIds]
  )

  const handleNudgeSelection = useCallback(
    (delta: Point) => {
      const updates = Array.from(selectedNodeIds)
        .map((nodeId) => canvas.store.getNode(nodeId))
        .filter((node): node is CanvasNode => node !== undefined && !node.locked)
        .map((node) => ({
          id: node.id,
          position: {
            x: node.position.x + delta.x,
            y: node.position.y + delta.y
          }
        }))

      if (updates.length === 0) {
        return
      }

      canvas.updateNodePositions(updates)
    },
    [canvas, selectedNodeIds]
  )

  // Handle keyboard shortcuts
  useEffect(() => {
    const manager = new Y.UndoManager(
      [doc.getMap('nodes'), doc.getMap('edges'), doc.getMap('metadata')],
      {
        captureTimeout: 300
      }
    )
    undoManagerRef.current = manager

    return () => {
      manager.destroy()
      if (undoManagerRef.current === manager) {
        undoManagerRef.current = null
      }
    }
  }, [doc])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if canvas container or its children have focus
      const container = containerRef.current
      if (!container) return

      // For destructive operations (delete/backspace), only proceed if:
      // 1. Canvas container itself has focus, OR
      // 2. No input/textarea/contenteditable has focus
      const activeElement = document.activeElement
      const isInputFocused = isTextInputLikeElement(activeElement)

      if (
        handleUndoRedoShortcut(e, container, activeElement, {
          undo: () => undoManagerRef.current?.undo(),
          redo: () => undoManagerRef.current?.redo()
        })
      ) {
        return
      }

      // Delete selected - only if canvas has focus or no input focused
      if (!container.contains(activeElement) || isInputFocused) {
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canvas])

  // Node event handlers
  const handleNodeSelect = useCallback(
    (id: string, additive: boolean) => {
      selectNode(id, additive)
    },
    [selectNode]
  )

  const handleNodeDragStart = useCallback(
    (id: string, _point: Point) => {
      // Capture initial positions of all nodes being dragged
      const nodesToMove = selectedNodeIds.has(id) ? Array.from(selectedNodeIds) : [id]

      dragInitialPositions.current.clear()
      dragCumulativeOffset.current = { x: 0, y: 0 }

      nodesToMove.forEach((nodeId) => {
        const node = canvas.store.getNode(nodeId)
        if (node) {
          dragInitialPositions.current.set(nodeId, {
            x: node.position.x,
            y: node.position.y
          })
        }
      })
      // Could start undo batch here
    },
    [selectedNodeIds, canvas.store]
  )

  const handleNodeDrag = useCallback(
    (_id: string, delta: Point) => {
      // Accumulate offset and compute final position from initial positions.
      // This prevents drift during fast drags where deltas might be applied
      // before the store has updated from the previous delta.
      dragCumulativeOffset.current = {
        x: dragCumulativeOffset.current.x + delta.x / viewport.zoom,
        y: dragCumulativeOffset.current.y + delta.y / viewport.zoom
      }

      dragInitialPositions.current.forEach((initialPos, nodeId) => {
        updateNodePosition(nodeId, {
          x: initialPos.x + dragCumulativeOffset.current.x,
          y: initialPos.y + dragCumulativeOffset.current.y
        })
      })
    },
    [updateNodePosition, viewport.zoom]
  )

  const handleNodeDragEnd = useCallback((_id: string) => {
    // Clear drag state
    dragInitialPositions.current.clear()
    dragCumulativeOffset.current = { x: 0, y: 0 }
    // Could end undo batch here
  }, [])

  const handleNodeDoubleClick = useCallback(
    (id: string) => {
      onNodeDoubleClick?.(id)
    },
    [onNodeDoubleClick]
  )

  // PERF-02: Calculate LOD (Level of Detail) based on zoom level
  // This reduces DOM complexity at low zoom levels for better performance
  const lod = useMemo(() => calculateLOD(viewport.zoom), [viewport.zoom])

  const displayList = useMemo(
    () =>
      createCanvasDisplayList({
        viewport,
        nodes: renderNodes,
        edges: renderEdges,
        store: canvas.store,
        selectedNodeIds
      }),
    [canvas.store, renderEdges, renderNodes, selectedNodeIds, viewport]
  )
  const { nodeMap, visibleNodes, visibleEdges, domNodes, overviewNodes } = displayList

  // Build comment objects map (memoized for CommentOverlay)
  // Note: Uses all nodes for comments, not just visible ones
  const commentObjects = useMemo(
    () =>
      new Map(
        nodes.map((n) => [
          n.id,
          {
            id: n.id,
            x: n.position.x,
            y: n.position.y,
            width: n.position.width,
            height: n.position.height
          }
        ])
      ),
    [nodes]
  )
  const selectedNodes = useMemo(() => getSelectedNodes(), [getSelectedNodes])
  const selectionBounds = useMemo(() => getSelectionBounds(selectedNodes), [selectedNodes])
  const selectionLockState = useMemo(() => getSelectionLockState(selectedNodes), [selectedNodes])

  const canvasBounds = useMemo(() => canvas.store.getBounds(), [canvas.store, nodes])
  const navigationToolsInsetRight =
    showMinimap && navigationToolsPosition === 'bottom-right' ? minimapWidth + 40 : 16
  const handleNavigationViewportChange = useCallback(
    (changes: { x?: number; y?: number; zoom?: number }) => {
      const snapshot = canvas.getViewportSnapshot()

      canvas.setViewportSnapshot({
        x: changes.x ?? snapshot.x,
        y: changes.y ?? snapshot.y,
        zoom: changes.zoom ?? snapshot.zoom
      })
    },
    [canvas]
  )

  useCanvasKeyboard({
    containerRef,
    viewport,
    canvasBounds,
    selectedNodeCount: selectedNodeIds.size,
    onViewportChange: handleNavigationViewportChange,
    onDeleteSelection: () => canvas.deleteSelected(),
    onSelectAll: () => canvas.selectAll(),
    onClearSelection: clearSelection,
    onStepSelection: handleStepSelection,
    onNudgeSelection: handleNudgeSelection,
    onToggleSelectionLock: handleToggleSelectionLock,
    onAlignSelection: handleAlignSelection,
    onShiftSelectionLayer: handleShiftSelectionLayer,
    onCreateObject,
    onOpenSelection,
    onToggleShortcutHelp,
    onDismissTransientUi
  })

  // Container styles
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: theme.surfaceBackground,
    cursor: isDragging ? 'grabbing' : 'default',
    ...style
  }

  // Canvas layer styles (applies transform)
  const canvasLayerStyle: React.CSSProperties = {
    position: 'absolute',
    transformOrigin: '0 0',
    transform: viewport.getTransform()
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      data-canvas-surface="true"
      data-canvas-theme={theme.mode}
      data-node-count={nodes.length}
      data-loaded-node-count={renderNodes.length}
      data-visible-node-count={visibleNodes.length}
      data-dom-node-count={domNodes.length}
      data-overview-node-count={overviewNodes.length}
      data-canvas-render-mode={overviewNodes.length > 0 ? 'hybrid' : 'dom'}
      data-edge-count={edges.length}
      data-loaded-edge-count={renderEdges.length}
      data-visible-edge-count={visibleEdges.length}
      data-loaded-chunk-count={chunkStats.loadedCount}
      data-loading-chunk-count={chunkStats.loadingCount}
      data-queued-chunk-count={chunkStats.queuedCount}
      data-cross-chunk-edge-count={chunkStats.crossChunkEdgeCount}
      data-viewport-x={viewport.x}
      data-viewport-y={viewport.y}
      data-viewport-zoom={viewport.zoom}
      data-viewport-width={viewport.width}
      data-viewport-height={viewport.height}
      data-selection-count={selectedNodes.length}
      data-selection-all-locked={selectionLockState.allLocked ? 'true' : 'false'}
      data-selection-any-locked={selectionLockState.anyLocked ? 'true' : 'false'}
      data-selection-bounds-width={selectionBounds?.width ?? 0}
      data-selection-bounds-height={selectionBounds?.height ?? 0}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleBackgroundDoubleClick}
      onDragOver={handleSurfaceDragOver}
      onDrop={handleSurfaceDrop}
      onPaste={handleSurfacePaste}
      tabIndex={0} // Make container focusable for keyboard shortcuts
    >
      {/* Grid background is rendered via WebGL/CSS layer (useWebGLGrid hook) */}

      {/* Edges layer (SVG) - PERF-01: Only render edges with visible endpoints */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible'
        }}
      >
        <g style={{ transform: viewport.getTransform() }}>
          {visibleEdges.map((edge) => {
            const sourceNode = nodeMap.get(edge.sourceId)
            const targetNode = nodeMap.get(edge.targetId)
            if (!sourceNode || !targetNode) return null

            return (
              <CanvasEdgeComponent
                key={edge.id}
                edge={edge}
                sourceNode={sourceNode}
                targetNode={targetNode}
                selected={selectedEdgeIds.has(edge.id)}
                onSelect={(id) => canvas.selectEdge(id)}
              />
            )
          })}
        </g>
      </svg>

      <OverviewCanvasLayer nodes={overviewNodes} viewport={viewport} />

      {/* Nodes layer - PERF-01: Only render DOM islands for the interactive subset */}
      {/* PERF-02: LOD reduces detail at low zoom levels */}
      <div style={canvasLayerStyle}>
        {domNodes.map((node) => {
          const selected = selectedNodeIds.has(node.id)
          const renderContext: CanvasNodeRenderContext = {
            selected,
            lod,
            selectionSize: selectedNodeIds.size,
            viewportZoom: viewport.zoom
          }

          return (
            <CanvasNodeComponent
              key={node.id}
              node={node}
              selected={selected}
              lod={lod}
              remoteUsers={nodePresence.get(node.id)}
              onSelect={handleNodeSelect}
              onDragStart={handleNodeDragStart}
              onDrag={handleNodeDrag}
              onDragEnd={handleNodeDragEnd}
              onDoubleClick={handleNodeDoubleClick}
            >
              {/* Only render custom content at full LOD for performance */}
              {lod === 'full' ? renderNode?.(node, renderContext) : undefined}
            </CanvasNodeComponent>
          )
        })}
      </div>

      {/* Comment overlay (optional - only when canvasNodeId provided) */}
      {canvasNodeId && (
        <CommentOverlay
          canvasNodeId={canvasNodeId}
          canvasSchema={canvasSchema}
          transform={{
            panX: viewport.x,
            panY: viewport.y,
            zoom: viewport.zoom
          }}
          objects={commentObjects}
        />
      )}

      {showNavigationTools && (
        <NavigationTools
          viewport={viewport}
          canvasBounds={canvasBounds}
          onViewportChange={handleNavigationViewportChange}
          position={navigationToolsPosition}
          showZoomLabel={navigationToolsShowZoomLabel}
          className={navigationToolsClassName}
          style={navigationToolsStyle}
          insetRight={navigationToolsInsetRight}
        />
      )}

      {showMinimap && (
        <CollapsibleMinimap
          nodes={nodes}
          edges={edges}
          viewport={viewport}
          width={minimapWidth}
          height={minimapHeight}
          onViewportChange={handleNavigationViewportChange}
          showEdges={minimapShowEdges}
          className={minimapClassName}
          defaultExpanded={minimapDefaultExpanded}
        />
      )}
    </div>
  )
})

export default Canvas
