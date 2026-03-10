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
import { getCanvasEdgeSourceObjectId, getCanvasEdgeTargetObjectId } from '../edges/bindings'
import { CanvasEdgeComponent } from '../edges/CanvasEdgeComponent'
import { useCanvas } from '../hooks/useCanvas'
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard'
import { createGridLayer, type GridLayer } from '../layers'
import { CanvasNodeComponent, calculateLOD, type LODLevel } from '../nodes/CanvasNodeComponent'
import { CanvasPrimitiveNodeContent } from '../nodes/CanvasPrimitiveNodeContent'
import {
  createCanvasPresenceManager,
  type AwarenessLike as CanvasPresenceAwarenessLike,
  type CanvasActivity
} from '../presence'
import {
  createAlignmentUpdates,
  createDistributionUpdates,
  createFrameSelectionNode,
  createLayerShiftUpdates,
  createLockUpdates,
  createTidySelectionUpdates,
  expandContainerPositionUpdates,
  getSelectionBounds,
  getSelectionLockState,
  getUnlockedSelection
} from '../selection/scene-operations'
import { useCanvasThemeTokens } from '../theme/canvas-theme'
import { createCanvasDisplayList } from './display-list'
import { handleUndoRedoShortcut, isTextInputLikeElement } from './keyboard-shortcuts'
import { OverviewCanvasLayer } from './OverviewCanvasLayer'

/** Minimal Awareness interface (avoids a direct y-protocols dependency). */
interface AwarenessLike extends CanvasPresenceAwarenessLike {
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
  name: string
  color: string
  /** Node IDs this user has selected */
  selectedNodes?: string[]
  /** Canvas-space cursor position when the user is active on this canvas */
  cursor?: Point
  /** User viewport for future overview/minimap affordances */
  viewport?: { x: number; y: number; zoom: number }
  /** Current interaction intent on the canvas */
  activity?: CanvasActivity
  /** Canvas object currently being edited by this user */
  editingNodeId?: string
}

export interface CanvasPresenceIntent {
  activity: Exclude<CanvasActivity, 'dragging' | 'panning' | 'resizing' | 'selecting'>
  editingNodeId?: string | null
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
  /** Replace the current node selection */
  selectNodes: (nodeIds: string[]) => void
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
  /** Wrap the current selection in a frame container */
  wrapSelectionInFrame: () => boolean
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
  onCreateObject?: (kind: 'page' | 'database' | 'note' | 'shape' | 'frame') => void
  /** Callback when the user triggers a selection open/peek shortcut */
  onOpenSelection?: (mode: 'peek' | 'focus' | 'split') => void
  /** Callback when the user toggles canvas shortcut help */
  onToggleShortcutHelp?: () => void
  /** Callback when the user wants to edit the selection alias */
  onEditSelectionAlias?: () => void
  /** Callback when the user wants to create a comment on the selection */
  onCreateSelectionComment?: () => void
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
  /** App-shell presence intent that should override canvas-local gesture state */
  presenceIntent?: CanvasPresenceIntent | null
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
    gridLayerRef.current?.render(viewportRef.current)
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
    onEditSelectionAlias,
    onCreateSelectionComment,
    onDismissTransientUi,
    onSurfaceDrop,
    onSurfacePaste,
    onSurfaceDragOver,
    awareness,
    presenceIntent,
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
  const presenceManagerRef = useRef<ReturnType<typeof createCanvasPresenceManager> | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [pointerActivity, setPointerActivity] = useState<CanvasActivity>('idle')
  const [focusedEditingNodeId, setFocusedEditingNodeId] = useState<string | null>(null)
  const [remoteUsers, setRemoteUsers] = useState<CanvasRemoteUser[]>([])
  const lastMousePos = useRef<Point>({ x: 0, y: 0 })
  const selectionActivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusSyncFrameRef = useRef<number | null>(null)
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
      const expandedUpdates = expandContainerPositionUpdates(canvas.store.getNodesMap(), updates)
      if (expandedUpdates.length === 0) {
        return false
      }

      canvas.updateNodePositions(expandedUpdates)
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

  const handleWrapSelectionInFrame = useCallback((): boolean => {
    const frameNode = createFrameSelectionNode(getSelectedNodes())
    if (!frameNode) {
      return false
    }

    canvas.addNode(frameNode)
    selectNode(frameNode.id)
    return true
  }, [canvas, getSelectedNodes, selectNode])

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
      selectNodes: (nodeIds: string[]) => {
        canvas.selectNodes(nodeIds)
      },
      toggleSelectionLock: () => handleToggleSelectionLock(),
      alignSelection: (alignment: CanvasAlignment) => handleAlignSelection(alignment),
      distributeSelection: (axis: CanvasDistributionAxis) => handleDistributeSelection(axis),
      tidySelection: () => handleTidySelection(),
      shiftSelectionLayer: (direction: CanvasLayerDirection) =>
        handleShiftSelectionLayer(direction),
      wrapSelectionInFrame: () => handleWrapSelectionInFrame(),
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
      handleToggleSelectionLock,
      handleWrapSelectionInFrame
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
  const scheduleTransientActivity = useCallback((activity: CanvasActivity, duration = 420) => {
    setPointerActivity(activity)
    if (selectionActivityTimeoutRef.current) {
      clearTimeout(selectionActivityTimeoutRef.current)
    }
    selectionActivityTimeoutRef.current = setTimeout(() => {
      setPointerActivity((current) => (current === activity ? 'idle' : current))
      selectionActivityTimeoutRef.current = null
    }, duration)
  }, [])

  const resolvedPresenceActivity = useMemo<CanvasActivity>(() => {
    if (presenceIntent?.activity) {
      return presenceIntent.activity
    }

    if (focusedEditingNodeId) {
      return 'editing'
    }

    return pointerActivity
  }, [focusedEditingNodeId, pointerActivity, presenceIntent?.activity])

  const resolvedEditingNodeId = presenceIntent?.editingNodeId ?? focusedEditingNodeId

  useEffect(() => {
    return () => {
      if (selectionActivityTimeoutRef.current) {
        clearTimeout(selectionActivityTimeoutRef.current)
      }
      if (focusSyncFrameRef.current !== null) {
        cancelAnimationFrame(focusSyncFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!awareness) {
      presenceManagerRef.current?.dispose()
      presenceManagerRef.current = null
      return
    }

    const manager = createCanvasPresenceManager(awareness)
    presenceManagerRef.current = manager

    return () => {
      if (presenceManagerRef.current === manager) {
        presenceManagerRef.current = null
      }
      manager.dispose()
    }
  }, [awareness])

  useEffect(() => {
    presenceManagerRef.current?.updateSelection(Array.from(selectedNodeIds))
  }, [selectedNodeIds])

  useEffect(() => {
    presenceManagerRef.current?.updateViewport({
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom
    })
  }, [viewport.x, viewport.y, viewport.zoom])

  useEffect(() => {
    presenceManagerRef.current?.updateActivity(resolvedPresenceActivity)
  }, [resolvedPresenceActivity])

  useEffect(() => {
    presenceManagerRef.current?.updateEditingNodeId(resolvedEditingNodeId ?? null)
  }, [resolvedEditingNodeId])

  const syncFocusedEditingSurface = useCallback(() => {
    if (focusSyncFrameRef.current !== null) {
      cancelAnimationFrame(focusSyncFrameRef.current)
    }

    focusSyncFrameRef.current = requestAnimationFrame(() => {
      const container = containerRef.current
      const activeElement = document.activeElement
      if (
        !container ||
        !(activeElement instanceof HTMLElement) ||
        !container.contains(activeElement)
      ) {
        setFocusedEditingNodeId(null)
        focusSyncFrameRef.current = null
        return
      }

      const editingSurface = activeElement.closest<HTMLElement>(
        '[data-canvas-editing-surface="true"][data-canvas-object-id]'
      )
      setFocusedEditingNodeId(editingSurface?.dataset.canvasObjectId ?? null)
      focusSyncFrameRef.current = null
    })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleFocusChange = () => {
      syncFocusedEditingSurface()
    }

    container.addEventListener('focusin', handleFocusChange)
    container.addEventListener('focusout', handleFocusChange)

    return () => {
      container.removeEventListener('focusin', handleFocusChange)
      container.removeEventListener('focusout', handleFocusChange)
    }
  }, [syncFocusedEditingSurface])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      presenceManagerRef.current?.updateCursor(clientToCanvas(event.clientX, event.clientY))
    }

    const handleMouseLeave = () => {
      presenceManagerRef.current?.updateCursor(null)
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [clientToCanvas])

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
      const nextRemoteUsers: CanvasRemoteUser[] = []

      states.forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return // skip self
        const user = state.user as { did?: string; name?: string; color?: string } | undefined
        if (!user?.did) return

        const selectedNodes = Array.isArray(state.selection)
          ? (state.selection as string[])
          : Array.isArray(state.canvasSelection)
            ? (state.canvasSelection as string[])
            : undefined
        const cursor =
          state.cursor &&
          typeof state.cursor === 'object' &&
          typeof (state.cursor as Point).x === 'number' &&
          typeof (state.cursor as Point).y === 'number'
            ? { x: (state.cursor as Point).x, y: (state.cursor as Point).y }
            : undefined
        const remoteViewport =
          state.viewport &&
          typeof state.viewport === 'object' &&
          typeof (state.viewport as { x: number }).x === 'number' &&
          typeof (state.viewport as { y: number }).y === 'number' &&
          typeof (state.viewport as { zoom: number }).zoom === 'number'
            ? {
                x: (state.viewport as { x: number }).x,
                y: (state.viewport as { y: number }).y,
                zoom: (state.viewport as { zoom: number }).zoom
              }
            : undefined
        const activity =
          typeof state.activity === 'string' ? (state.activity as CanvasActivity) : undefined
        const editingNodeId =
          typeof state.editingNodeId === 'string' ? state.editingNodeId : undefined

        const remoteUser: CanvasRemoteUser = {
          clientId,
          did: user.did,
          name: user.name ?? user.did.slice(0, 12),
          color: user.color || '#888',
          selectedNodes,
          cursor,
          viewport: remoteViewport,
          activity,
          editingNodeId
        }

        if (
          (selectedNodes && selectedNodes.length > 0) ||
          cursor ||
          remoteViewport ||
          activity ||
          editingNodeId
        ) {
          nextRemoteUsers.push(remoteUser)
        }

        if (selectedNodes && selectedNodes.length > 0) {
          for (const nodeId of selectedNodes) {
            const existing = presenceMap.get(nodeId) || []
            existing.push(remoteUser)
            presenceMap.set(nodeId, existing)
          }
        }
      })

      setNodePresence(presenceMap)
      setRemoteUsers(nextRemoteUsers)
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
        scheduleTransientActivity('panning')
        pan(-e.deltaX, -e.deltaY)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [pan, scheduleTransientActivity, zoomAt])

  // Handle background mouse down for pan and far-field hit testing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if (e.target !== containerRef.current) return

      containerRef.current?.focus()

      const canvasPoint = clientToCanvas(e.clientX, e.clientY)
      const hitNode = canvas.findNodeAt(canvasPoint.x, canvasPoint.y)

      if (hitNode) {
        scheduleTransientActivity('selecting')
        selectNode(hitNode.id, e.shiftKey || e.metaKey)
        return
      }

      // Clicked on background
      clearSelection()
      onBackgroundClick?.()

      // Start panning
      setIsDragging(true)
      setPointerActivity('panning')
      lastMousePos.current = { x: e.clientX, y: e.clientY }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - lastMousePos.current.x
        const deltaY = moveEvent.clientY - lastMousePos.current.y
        lastMousePos.current = { x: moveEvent.clientX, y: moveEvent.clientY }
        pan(deltaX, deltaY)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        setPointerActivity('idle')
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [
      canvas,
      clearSelection,
      clientToCanvas,
      onBackgroundClick,
      pan,
      scheduleTransientActivity,
      selectNode
    ]
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
        scheduleTransientActivity('selecting')
        selectNode(fallbackNode.id)
        return
      }

      const [currentId] = Array.from(selectedNodeIds)
      const currentIndex = orderedNodes.findIndex((node) => node.id === currentId)
      const resolvedIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = (resolvedIndex + direction + orderedNodes.length) % orderedNodes.length
      scheduleTransientActivity('selecting')
      selectNode(orderedNodes[nextIndex].id)
    },
    [nodes, renderNodes, scheduleTransientActivity, selectNode, selectedNodeIds]
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

      applySelectionPositionUpdates(updates)
    },
    [applySelectionPositionUpdates, canvas.store, selectedNodeIds]
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
      scheduleTransientActivity('selecting')
      selectNode(id, additive)
    },
    [scheduleTransientActivity, selectNode]
  )

  const handleNodeDragStart = useCallback(
    (id: string, _point: Point) => {
      setPointerActivity('dragging')
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

      const updates = Array.from(dragInitialPositions.current.entries()).map(
        ([nodeId, initialPos]) => ({
          id: nodeId,
          position: {
            x: initialPos.x + dragCumulativeOffset.current.x,
            y: initialPos.y + dragCumulativeOffset.current.y
          }
        })
      )

      applySelectionPositionUpdates(updates)
    },
    [applySelectionPositionUpdates, viewport.zoom]
  )

  const handleNodeDragEnd = useCallback((_id: string) => {
    // Clear drag state
    dragInitialPositions.current.clear()
    dragCumulativeOffset.current = { x: 0, y: 0 }
    setPointerActivity('idle')
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
  const remoteCursorIndicators = useMemo(
    () =>
      remoteUsers
        .filter((user) => user.cursor)
        .map((user) => {
          const screenPoint = viewport.canvasToScreen(user.cursor!.x, user.cursor!.y)

          return {
            ...user,
            screenPoint
          }
        })
        .filter(
          (user) =>
            user.screenPoint.x >= -48 &&
            user.screenPoint.x <= viewport.width + 48 &&
            user.screenPoint.y >= -48 &&
            user.screenPoint.y <= viewport.height + 48
        ),
    [remoteUsers, viewport]
  )

  const canvasBounds = useMemo(() => canvas.store.getBounds(), [canvas.store])
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
    onWrapSelectionInFrame: handleWrapSelectionInFrame,
    onEditSelectionAlias,
    onCreateSelectionComment,
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
      data-canvas-local-activity={resolvedPresenceActivity}
      data-canvas-editing-node-id={resolvedEditingNodeId ?? ''}
      data-canvas-remote-user-count={remoteUsers.length}
      data-canvas-remote-cursor-count={remoteCursorIndicators.length}
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
            const sourceId = getCanvasEdgeSourceObjectId(edge)
            const targetId = getCanvasEdgeTargetObjectId(edge)
            const sourceNode = sourceId ? nodeMap.get(sourceId) : undefined
            const targetNode = targetId ? nodeMap.get(targetId) : undefined
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

      {remoteCursorIndicators.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden'
          }}
          data-canvas-remote-cursors="true"
        >
          {remoteCursorIndicators.map((user) => (
            <div
              key={user.clientId}
              style={{
                position: 'absolute',
                left: user.screenPoint.x,
                top: user.screenPoint.y,
                transform: 'translate(-2px, -2px)'
              }}
              data-canvas-remote-cursor="true"
              data-canvas-remote-client-id={user.clientId}
              data-canvas-remote-activity={user.activity ?? 'idle'}
              data-canvas-remote-editing-node-id={user.editingNodeId ?? ''}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '999px',
                  backgroundColor: user.color,
                  boxShadow:
                    theme.mode === 'dark'
                      ? '0 0 0 2px rgba(10, 10, 10, 0.9)'
                      : '0 0 0 2px rgba(255, 255, 255, 0.96)'
                }}
              />
              <div
                style={{
                  marginTop: 6,
                  marginLeft: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 999,
                  padding: '4px 10px',
                  background: theme.minimapOverlayBackground,
                  color: theme.panelText,
                  border: `1px solid ${theme.panelBorder}`,
                  boxShadow: theme.panelShadow,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}
              >
                <span>{user.name}</span>
                {user.activity && user.activity !== 'idle' ? (
                  <span style={{ color: theme.panelMutedText, fontWeight: 500 }}>
                    {user.activity}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

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
              {lod === 'full'
                ? (renderNode?.(node, renderContext) ??
                  (node.type === 'shape' || node.type === 'group' || node.type === 'frame' ? (
                    <CanvasPrimitiveNodeContent node={node} />
                  ) : undefined))
                : undefined}
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
