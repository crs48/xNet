/**
 * Shared scene-mutation dispatcher for the canvas v3 renderer.
 *
 * The renderer applies many flavours of node updates (position, lock,
 * properties) that all follow the same shape: run one Y.Doc transaction,
 * merge each update into the existing node, and notify `onSceneMutation`
 * only when something actually changed.
 */

import type { CanvasLockUpdate, CanvasPositionUpdate } from '../selection/scene-operations'
import type { CanvasNode, CanvasNodeProperties } from '../types'
import type * as Y from 'yjs'
import { getCanvasObjectsMap } from '../scene/doc-layout'

export type CanvasNodePropertiesUpdate = {
  id: string
  properties: CanvasNodeProperties
}

export type ApplyCanvasSceneUpdatesInput<TUpdate extends { id: string }> = {
  doc: Y.Doc
  updates: readonly TUpdate[]
  /** Returns the next node for an update; must not mutate the current node. */
  merge: (node: CanvasNode, update: TUpdate) => CanvasNode
  onSceneMutation?: () => void
}

/**
 * Applies a batch of node updates in a single transaction. Updates whose id
 * has no matching node are skipped. Returns true when at least one node
 * changed, in which case `onSceneMutation` has been notified.
 */
export function applyCanvasSceneUpdates<TUpdate extends { id: string }>(
  input: ApplyCanvasSceneUpdatesInput<TUpdate>
): boolean {
  const { doc, updates, merge, onSceneMutation } = input

  if (updates.length === 0) {
    return false
  }

  const objects = getCanvasObjectsMap<CanvasNode>(doc)
  let changed = false

  doc.transact(() => {
    for (const update of updates) {
      const node = objects.get(update.id)
      if (!node) {
        continue
      }

      objects.set(update.id, merge(node, update))
      changed = true
    }
  })

  if (changed) {
    onSceneMutation?.()
  }

  return changed
}

export function mergeCanvasNodePositionUpdate(
  node: CanvasNode,
  update: CanvasPositionUpdate
): CanvasNode {
  return {
    ...node,
    position: {
      ...node.position,
      ...update.position
    }
  }
}

export function mergeCanvasNodeLockUpdate(node: CanvasNode, update: CanvasLockUpdate): CanvasNode {
  return {
    ...node,
    locked: update.locked
  }
}

export function mergeCanvasNodePropertiesUpdate(
  node: CanvasNode,
  update: CanvasNodePropertiesUpdate
): CanvasNode {
  return {
    ...node,
    properties: {
      ...node.properties,
      ...update.properties
    }
  }
}
