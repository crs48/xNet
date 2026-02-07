/**
 * useSwimlanes Hook
 *
 * React hook for managing swimlane state and interactions.
 */

import type { CanvasNodePosition } from '../types'
import type { SwimlaneNode, GenericCanvasNode, SwimlaneConfig } from './types'
import { useMemo, useCallback } from 'react'
import { SwimlaneManager } from './swimlane-manager'

// ─── Options ───────────────────────────────────────────────────────────────────

export interface UseSwimlaneOptions {
  /** All canvas nodes */
  nodes: GenericCanvasNode[]
  /** Callback when a node is updated */
  onNodeUpdate: (id: string, changes: Partial<GenericCanvasNode>) => void
  /** Swimlane manager config */
  config?: Partial<SwimlaneConfig>
}

// ─── Return Type ───────────────────────────────────────────────────────────────

export interface UseSwimlaneReturn {
  /** All swimlane nodes */
  swimlanes: SwimlaneNode[]
  /** Map of swimlane ID to its child nodes */
  swimlaneChildren: Map<string, GenericCanvasNode[]>
  /** The swimlane manager instance */
  manager: SwimlaneManager
  /** Handle a node being dropped into a swimlane */
  handleNodeDrop: (nodeId: string, swimlaneId: string) => void
  /** Handle a node moving (to update swimlane membership) */
  handleNodeMove: (nodeId: string, newPosition: CanvasNodePosition) => void
  /** Get the swimlane containing a node ID */
  getSwimlaneForNodeId: (nodeId: string) => SwimlaneNode | null
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook for managing swimlane interactions.
 */
export function useSwimlanes({
  nodes,
  onNodeUpdate,
  config
}: UseSwimlaneOptions): UseSwimlaneReturn {
  // Create manager instance
  const manager = useMemo(() => new SwimlaneManager(config), [config])

  // Get all swimlane nodes
  const swimlanes = useMemo(() => {
    const result: SwimlaneNode[] = []
    for (const node of nodes) {
      if (node.type === 'swimlane' && node.properties) {
        result.push(node as SwimlaneNode)
      }
    }
    return result
  }, [nodes])

  // Build swimlane -> children map
  const swimlaneChildren = useMemo(() => {
    const map = new Map<string, GenericCanvasNode[]>()

    for (const lane of swimlanes) {
      const childIds = lane.properties.childNodeIds as string[]
      const children = childIds
        .map((id) => nodes.find((n) => n.id === id))
        .filter((n): n is GenericCanvasNode => n !== undefined)
      map.set(lane.id, children)
    }

    return map
  }, [swimlanes, nodes])

  // Get swimlane containing a node ID
  const getSwimlaneForNodeId = useCallback(
    (nodeId: string): SwimlaneNode | null => {
      return manager.findSwimlaneContaining(nodeId, swimlanes)
    },
    [manager, swimlanes]
  )

  // Handle node drop into swimlane
  const handleNodeDrop = useCallback(
    (nodeId: string, swimlaneId: string) => {
      const lane = swimlanes.find((l) => l.id === swimlaneId)
      if (!lane) return

      // Remove from current swimlane if any
      const currentLane = getSwimlaneForNodeId(nodeId)
      if (currentLane && currentLane.id !== swimlaneId) {
        const newChildIds = currentLane.properties.childNodeIds.filter(
          (id: string) => id !== nodeId
        )
        onNodeUpdate(currentLane.id, {
          properties: {
            ...currentLane.properties,
            childNodeIds: newChildIds
          }
        })
      }

      // Add to new swimlane if not already there
      if (!lane.properties.childNodeIds.includes(nodeId)) {
        const newChildIds = [...lane.properties.childNodeIds, nodeId]
        onNodeUpdate(swimlaneId, {
          properties: { ...lane.properties, childNodeIds: newChildIds }
        })
      }

      // Auto-resize
      const node = nodes.find((n) => n.id === nodeId)
      if (node) {
        const currentChildren = swimlaneChildren.get(swimlaneId) ?? []
        const allChildren = currentChildren.some((c) => c.id === nodeId)
          ? currentChildren
          : [...currentChildren, node]
        const resize = manager.resizeToFitChildren(lane, allChildren)
        if (Object.keys(resize).length > 0) {
          onNodeUpdate(swimlaneId, {
            position: { ...lane.position, ...resize }
          })
        }
      }
    },
    [swimlanes, nodes, swimlaneChildren, manager, onNodeUpdate, getSwimlaneForNodeId]
  )

  // Handle node move (updates swimlane membership based on position)
  const handleNodeMove = useCallback(
    (nodeId: string, newPosition: CanvasNodePosition) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node || node.type === 'swimlane') return

      const nodeCenter = {
        x: newPosition.x + newPosition.width / 2,
        y: newPosition.y + newPosition.height / 2
      }

      const containingLane = manager.getSwimlaneAtPosition(nodeCenter, swimlanes)
      const currentLane = getSwimlaneForNodeId(nodeId)

      // If membership changed
      if (containingLane?.id !== currentLane?.id) {
        // Remove from old swimlane
        if (currentLane) {
          const newChildIds = currentLane.properties.childNodeIds.filter(
            (id: string) => id !== nodeId
          )
          onNodeUpdate(currentLane.id, {
            properties: {
              ...currentLane.properties,
              childNodeIds: newChildIds
            }
          })
        }

        // Add to new swimlane
        if (containingLane) {
          onNodeUpdate(containingLane.id, {
            properties: {
              ...containingLane.properties,
              childNodeIds: [...containingLane.properties.childNodeIds, nodeId]
            }
          })
        }
      }
    },
    [nodes, swimlanes, manager, onNodeUpdate, getSwimlaneForNodeId]
  )

  return {
    swimlanes,
    swimlaneChildren,
    manager,
    handleNodeDrop,
    handleNodeMove,
    getSwimlaneForNodeId
  }
}
