/**
 * useCanvas Hook
 *
 * React hook for managing canvas state with a Yjs-backed store.
 */

import type { CanvasNode, CanvasEdge, CanvasNodePosition, CanvasConfig, Rect } from '../types'
import type * as Y from 'yjs'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createLayoutEngine, type LayoutConfig } from '../layout/index'
import { Viewport, createViewport } from '../spatial/index'
import { CanvasStore, createCanvasStore } from '../store'
import { DEFAULT_CANVAS_CONFIG } from '../types'

/**
 * Canvas hook options
 */
export interface UseCanvasOptions {
  /** Y.Doc containing the canvas data */
  doc: Y.Doc
  /** Canvas configuration */
  config?: CanvasConfig
  /** Initial viewport state */
  initialViewport?: { x?: number; y?: number; zoom?: number }
}

/**
 * Canvas hook return value
 */
export interface UseCanvasReturn {
  // State
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  selectedNodeIds: Set<string>
  selectedEdgeIds: Set<string>
  viewport: Viewport

  // Node operations
  addNode: (node: CanvasNode) => void
  updateNodePosition: (id: string, position: Partial<CanvasNodePosition>) => void
  updateNodePositions: (
    updates: Array<{ id: string; position: Partial<CanvasNodePosition> }>
  ) => void
  removeNode: (id: string) => void
  removeNodes: (ids: string[]) => void

  // Edge operations
  addEdge: (edge: CanvasEdge) => void
  removeEdge: (id: string) => void

  // Selection
  selectNode: (id: string, additive?: boolean) => void
  selectNodes: (ids: string[]) => void
  selectEdge: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  deleteSelected: () => void

  // Viewport
  pan: (deltaX: number, deltaY: number) => void
  zoomAt: (x: number, y: number, factor: number) => void
  fitToContent: (padding?: number) => void
  fitToRect: (rect: Rect, padding?: number) => void
  resetView: () => void
  getViewportSnapshot: () => { x: number; y: number; zoom: number }
  setViewportSnapshot: (snapshot: { x: number; y: number; zoom: number }) => void

  // Layout
  autoLayout: (config?: LayoutConfig) => Promise<void>
  layoutSelected: (config?: LayoutConfig) => Promise<void>

  // Queries
  findNodeAt: (x: number, y: number) => CanvasNode | undefined
  findNodesInRect: (rect: Rect) => CanvasNode[]
  getVisibleNodes: () => CanvasNode[]

  // Store access
  store: CanvasStore
}

/**
 * useCanvas hook
 */
export function useCanvas(options: UseCanvasOptions): UseCanvasReturn {
  const { doc, config = {}, initialViewport } = options
  const fullConfig = { ...DEFAULT_CANVAS_CONFIG, ...config }

  // Create store (memoized on doc)
  const store = useMemo(() => createCanvasStore(doc), [doc])

  // Create viewport
  const viewportRef = useRef(
    createViewport({
      x: initialViewport?.x ?? 0,
      y: initialViewport?.y ?? 0,
      zoom: initialViewport?.zoom ?? 1
    })
  )

  // Create layout engine
  const layoutEngineRef = useRef(createLayoutEngine())

  // State
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set())
  const [viewportState, setViewportState] = useState(viewportRef.current)

  // Sync state from store
  useEffect(() => {
    const updateState = () => {
      setNodes(store.getNodes())
      setEdges(store.getEdges())
    }

    // Initial load
    updateState()

    // Subscribe to changes
    const unsubscribe = store.subscribe(() => {
      updateState()
    })

    return () => {
      unsubscribe()
      store.dispose()
    }
  }, [store])

  // ============================================================================
  // Node operations
  // ============================================================================

  const addNode = useCallback(
    (node: CanvasNode) => {
      store.addNode(node)
    },
    [store]
  )

  const updateNodePosition = useCallback(
    (id: string, position: Partial<CanvasNodePosition>) => {
      store.updateNodePosition(id, position)
    },
    [store]
  )

  const updateNodePositions = useCallback(
    (updates: Array<{ id: string; position: Partial<CanvasNodePosition> }>) => {
      store.updateNodePositions(updates)
    },
    [store]
  )

  const removeNode = useCallback(
    (id: string) => {
      store.removeNode(id)
      setSelectedNodeIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [store]
  )

  const removeNodes = useCallback(
    (ids: string[]) => {
      store.removeNodes(ids)
      setSelectedNodeIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    },
    [store]
  )

  // ============================================================================
  // Edge operations
  // ============================================================================

  const addEdge = useCallback(
    (edge: CanvasEdge) => {
      store.addEdge(edge)
    },
    [store]
  )

  const removeEdge = useCallback(
    (id: string) => {
      store.removeEdge(id)
      setSelectedEdgeIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [store]
  )

  // ============================================================================
  // Selection
  // ============================================================================

  const selectNode = useCallback((id: string, additive = false) => {
    setSelectedNodeIds((prev) => {
      if (additive) {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      } else {
        return new Set([id])
      }
    })
    setSelectedEdgeIds(new Set())
  }, [])

  const selectNodes = useCallback((ids: string[]) => {
    setSelectedNodeIds(new Set(ids))
    setSelectedEdgeIds(new Set())
  }, [])

  const selectEdge = useCallback((id: string) => {
    setSelectedEdgeIds(new Set([id]))
    setSelectedNodeIds(new Set())
  }, [])

  const selectAll = useCallback(() => {
    // Read fresh nodes from store to avoid stale closure
    const currentNodes = store.getNodes()
    setSelectedNodeIds(new Set(currentNodes.map((n) => n.id)))
  }, [store])

  const clearSelection = useCallback(() => {
    setSelectedNodeIds(new Set())
    setSelectedEdgeIds(new Set())
  }, [])

  const deleteSelected = useCallback(() => {
    if (selectedNodeIds.size > 0) {
      removeNodes(Array.from(selectedNodeIds))
    }
    selectedEdgeIds.forEach((id) => {
      store.removeEdge(id)
    })
    setSelectedEdgeIds(new Set())
  }, [selectedNodeIds, selectedEdgeIds, removeNodes, store])

  // ============================================================================
  // Viewport
  // ============================================================================

  const pan = useCallback((deltaX: number, deltaY: number) => {
    viewportRef.current.pan(deltaX, deltaY)
    setViewportState(viewportRef.current.clone())
  }, [])

  const zoomAt = useCallback(
    (x: number, y: number, factor: number) => {
      viewportRef.current.zoomAt(x, y, factor, fullConfig.minZoom, fullConfig.maxZoom)
      setViewportState(viewportRef.current.clone())
    },
    [fullConfig.minZoom, fullConfig.maxZoom]
  )

  const fitToContent = useCallback(
    (padding = 50) => {
      const bounds = store.getBounds()
      if (bounds) {
        viewportRef.current.fitToRect(bounds, padding)
        setViewportState(viewportRef.current.clone())
      }
    },
    [store]
  )

  const fitToRect = useCallback((rect: Rect, padding = 50) => {
    viewportRef.current.fitToRect(rect, padding)
    setViewportState(viewportRef.current.clone())
  }, [])

  const resetView = useCallback(() => {
    viewportRef.current.reset()
    setViewportState(viewportRef.current.clone())
  }, [])

  const getViewportSnapshot = useCallback(() => {
    const snapshot = viewportRef.current.clone()
    return {
      x: snapshot.x,
      y: snapshot.y,
      zoom: snapshot.zoom
    }
  }, [])

  const setViewportSnapshot = useCallback(
    (snapshot: { x: number; y: number; zoom: number }) => {
      const x = Number.isFinite(snapshot.x) ? snapshot.x : 0
      const y = Number.isFinite(snapshot.y) ? snapshot.y : 0
      const requestedZoom = Number.isFinite(snapshot.zoom) ? snapshot.zoom : 1
      const zoom = Math.min(fullConfig.maxZoom, Math.max(fullConfig.minZoom, requestedZoom))

      viewportRef.current.x = x
      viewportRef.current.y = y
      viewportRef.current.zoom = zoom
      setViewportState(viewportRef.current.clone())
    },
    [fullConfig.maxZoom, fullConfig.minZoom]
  )

  // ============================================================================
  // Layout
  // ============================================================================

  const autoLayout = useCallback(
    async (layoutConfig?: LayoutConfig) => {
      // Read fresh nodes/edges from store to avoid stale closure during async ELK computation
      const currentNodes = store.getNodes()
      const currentEdges = store.getEdges()
      const result = await layoutEngineRef.current.layout(currentNodes, currentEdges, layoutConfig)

      // Apply positions
      const updates = Array.from(result.positions.entries()).map(([id, pos]) => ({
        id,
        position: pos
      }))
      store.updateNodePositions(updates)

      // Fit to new layout
      viewportRef.current.fitToRect(result.bounds, 50)
      setViewportState(viewportRef.current.clone())
    },
    [store]
  )

  const layoutSelected = useCallback(
    async (layoutConfig?: LayoutConfig) => {
      if (selectedNodeIds.size === 0) return

      // Read fresh nodes/edges from store to avoid stale closure during async ELK computation
      const currentNodes = store.getNodes()
      const currentEdges = store.getEdges()
      const result = await layoutEngineRef.current.layoutSubset(
        currentNodes,
        selectedNodeIds,
        currentEdges,
        layoutConfig
      )

      const updates = Array.from(result.positions.entries()).map(([id, pos]) => ({
        id,
        position: pos
      }))
      store.updateNodePositions(updates)
    },
    [selectedNodeIds, store]
  )

  // ============================================================================
  // Queries
  // ============================================================================

  const findNodeAt = useCallback(
    (x: number, y: number) => {
      return store.findNodeAt(x, y)
    },
    [store]
  )

  const findNodesInRect = useCallback(
    (rect: Rect) => {
      return store.findNodesInRect(rect)
    },
    [store]
  )

  const getVisibleNodes = useCallback(() => {
    const visibleRect = viewportRef.current.getVisibleRect()
    return store.getVisibleNodes(visibleRect)
  }, [store])

  return {
    // State
    nodes,
    edges,
    selectedNodeIds,
    selectedEdgeIds,
    viewport: viewportState,

    // Node operations
    addNode,
    updateNodePosition,
    updateNodePositions,
    removeNode,
    removeNodes,

    // Edge operations
    addEdge,
    removeEdge,

    // Selection
    selectNode,
    selectNodes,
    selectEdge,
    selectAll,
    clearSelection,
    deleteSelected,

    // Viewport
    pan,
    zoomAt,
    fitToContent,
    fitToRect,
    resetView,
    getViewportSnapshot,
    setViewportSnapshot,

    // Layout
    autoLayout,
    layoutSelected,

    // Queries
    findNodeAt,
    findNodesInRect,
    getVisibleNodes,

    // Store access
    store
  }
}
