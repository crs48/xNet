/**
 * useCanvas Hook
 *
 * React hook for managing canvas state with a Yjs-backed store.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type * as Y from 'yjs'
import type {
  CanvasNode,
  CanvasEdge,
  CanvasNodePosition,
  CanvasConfig,
  SelectionState,
  Point,
  Rect,
  ResizeHandle
} from '../types'
import { DEFAULT_CANVAS_CONFIG } from '../types'
import { CanvasStore, createCanvasStore } from '../store'
import { Viewport, createViewport } from '../spatial/index'
import { LayoutEngine, createLayoutEngine, type LayoutConfig } from '../layout/index'

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
  resetView: () => void

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
    setSelectedNodeIds(new Set(nodes.map((n) => n.id)))
  }, [nodes])

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

  const resetView = useCallback(() => {
    viewportRef.current.reset()
    setViewportState(viewportRef.current.clone())
  }, [])

  // ============================================================================
  // Layout
  // ============================================================================

  const autoLayout = useCallback(
    async (layoutConfig?: LayoutConfig) => {
      const result = await layoutEngineRef.current.layout(nodes, edges, layoutConfig)

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
    [nodes, edges, store]
  )

  const layoutSelected = useCallback(
    async (layoutConfig?: LayoutConfig) => {
      if (selectedNodeIds.size === 0) return

      const result = await layoutEngineRef.current.layoutSubset(
        nodes,
        selectedNodeIds,
        edges,
        layoutConfig
      )

      const updates = Array.from(result.positions.entries()).map(([id, pos]) => ({
        id,
        position: pos
      }))
      store.updateNodePositions(updates)
    },
    [nodes, edges, selectedNodeIds, store]
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
    resetView,

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
