/**
 * Remote Selections Overlay
 *
 * Renders selection indicators for all remote users' selections.
 */

import type { SelectionLockManager, SelectionLock } from '../presence/selection-lock'
import type { Viewport } from '../spatial/index'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { SelectionIndicator } from './SelectionIndicator'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CanvasNodePosition {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasNode {
  id: string
  position: CanvasNodePosition
}

export interface RemoteSelectionsOverlayProps {
  /** Selection lock manager for presence data */
  lockManager: SelectionLockManager
  /** Current viewport for coordinate conversion */
  viewport: Viewport
  /** Map of node ID to node data */
  nodes: Map<string, CanvasNode>
}

interface RemoteSelection {
  clientId: number
  nodeIds: string[]
  user: { name: string; color: string }
}

interface IndicatorData {
  key: string
  bounds: { x: number; y: number; width: number; height: number }
  user: { name: string; color: string }
  isEditLocked: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RemoteSelectionsOverlay({
  lockManager,
  viewport,
  nodes
}: RemoteSelectionsOverlayProps) {
  const [remoteSelections, setRemoteSelections] = useState<RemoteSelection[]>([])
  const [locks, setLocks] = useState<Map<string, SelectionLock>>(new Map())

  // Update selections from lock manager
  const updateSelections = useCallback(() => {
    const selections = lockManager.getRemoteSelections()
    setRemoteSelections(
      Array.from(selections.entries()).map(([clientId, data]) => ({
        clientId,
        ...data
      }))
    )
  }, [lockManager])

  // Subscribe to selection and lock changes
  useEffect(() => {
    // Subscribe to lock changes
    const unsubscribeLocks = lockManager.onLocksChange((newLocks) => {
      setLocks(newLocks)
      // Also update selections when locks change
      updateSelections()
    })

    // Initial load
    updateSelections()

    // Poll for selection changes (presence changes don't have direct subscription)
    const interval = setInterval(updateSelections, 100)

    return () => {
      clearInterval(interval)
      unsubscribeLocks()
    }
  }, [lockManager, updateSelections])

  // Convert to screen coordinates
  const indicators = useMemo((): IndicatorData[] => {
    const result: IndicatorData[] = []

    for (const selection of remoteSelections) {
      for (const nodeId of selection.nodeIds) {
        const node = nodes.get(nodeId)
        if (!node) continue

        // Convert node bounds to screen
        const screenPos = viewport.canvasToScreen(node.position.x, node.position.y)
        const screenBounds = {
          x: screenPos.x,
          y: screenPos.y,
          width: node.position.width * viewport.zoom,
          height: node.position.height * viewport.zoom
        }

        // Check if this node is edit-locked by this user
        const lock = locks.get(nodeId)
        const isEditLocked = lock?.ownerId === selection.clientId

        result.push({
          key: `${selection.clientId}-${nodeId}`,
          bounds: screenBounds,
          user: selection.user,
          isEditLocked
        })
      }
    }

    return result
  }, [remoteSelections, locks, nodes, viewport])

  return (
    <div
      className="remote-selections-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      {indicators.map((indicator) => (
        <SelectionIndicator
          key={indicator.key}
          bounds={indicator.bounds}
          user={indicator.user}
          isEditLocked={indicator.isEditLocked}
        />
      ))}
    </div>
  )
}
