/**
 * useLayout Hook
 *
 * React hook for managing layout computation.
 */

import type { Point } from '../types'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  LayoutManager,
  type LayoutAlgorithm,
  type LayoutNode,
  type LayoutEdge
} from './layout-manager'

// ─── Options ───────────────────────────────────────────────────────────────────

export interface UseLayoutOptions {
  /** Canvas nodes */
  nodes: LayoutNode[]
  /** Canvas edges */
  edges: LayoutEdge[]
  /** Callback when layout is applied */
  onApplyLayout: (positions: Map<string, Point>) => void
}

// ─── Return Type ───────────────────────────────────────────────────────────────

export interface UseLayoutReturn {
  /** Whether layout is currently being computed */
  isLayouting: boolean
  /** Error message if layout failed */
  error: string | null
  /** Apply layout with specified algorithm */
  applyLayout: (algorithm?: LayoutAlgorithm, options?: Record<string, string>) => Promise<void>
  /** Cancel current layout */
  cancelLayout: () => void
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook for managing layout computation.
 */
export function useLayout({ nodes, edges, onApplyLayout }: UseLayoutOptions): UseLayoutReturn {
  const [isLayouting, setIsLayouting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const managerRef = useRef<LayoutManager | null>(null)

  // Initialize manager
  useEffect(() => {
    managerRef.current = new LayoutManager()
    return () => {
      managerRef.current?.terminate()
    }
  }, [])

  // Apply layout
  const applyLayout = useCallback(
    async (algorithm: LayoutAlgorithm = 'layered', options?: Record<string, string>) => {
      if (!managerRef.current || nodes.length === 0) return

      setIsLayouting(true)
      setError(null)

      try {
        const positions = await managerRef.current.layout({
          nodes,
          edges,
          algorithm,
          options
        })

        onApplyLayout(positions)
      } catch (err) {
        if (err instanceof Error && err.message !== 'Layout cancelled') {
          setError(err.message)
        }
      } finally {
        setIsLayouting(false)
      }
    },
    [nodes, edges, onApplyLayout]
  )

  // Cancel layout
  const cancelLayout = useCallback(() => {
    managerRef.current?.cancel()
    setIsLayouting(false)
  }, [])

  return {
    isLayouting,
    error,
    applyLayout,
    cancelLayout
  }
}
