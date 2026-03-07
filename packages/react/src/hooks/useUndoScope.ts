/**
 * useUndoScope - Internal hook for scoped undo/redo across multiple nodes.
 *
 * Wraps UndoManager's scoped helpers so app surfaces can treat a composite
 * model like "database node plus visible rows" as one undo domain.
 */

import type { DID } from '@xnetjs/core'
import type { NodeId } from '@xnetjs/data'
import { UndoManager, type UndoManagerOptions } from '@xnetjs/history'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNodeStore } from './useNodeStore'

export interface UseUndoScopeOptions {
  /** The local user's DID. When absent, undo is disabled until identity is ready. */
  localDID: DID | null
  /** UndoManager configuration overrides */
  options?: Partial<UndoManagerOptions>
}

export interface UseUndoScopeResult {
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
  canUndo: boolean
  canRedo: boolean
  undoCount: number
  redoCount: number
  clear: () => void
}

export function useUndoScope(nodeIds: NodeId[], opts: UseUndoScopeOptions): UseUndoScopeResult {
  const { store } = useNodeStore()
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const managerRef = useRef<UndoManager | null>(null)
  const nodeIdsRef = useRef(nodeIds)
  nodeIdsRef.current = nodeIds
  const normalizedOptions = useMemo(
    () =>
      opts.options
        ? {
            localOnly: opts.options.localOnly,
            maxStackSize: opts.options.maxStackSize,
            mergeInterval: opts.options.mergeInterval
          }
        : undefined,
    [opts.options?.localOnly, opts.options?.maxStackSize, opts.options?.mergeInterval]
  )

  useEffect(() => {
    if (!store || !opts.localDID) {
      managerRef.current = null
      setUndoCount(0)
      setRedoCount(0)
      return
    }

    const manager = new UndoManager(store, opts.localDID, normalizedOptions)
    manager.start()
    managerRef.current = manager

    return () => {
      manager.stop()
      managerRef.current = null
    }
  }, [store, opts.localDID, normalizedOptions])

  const syncCounts = useCallback(() => {
    const manager = managerRef.current
    const scope = nodeIdsRef.current

    if (!manager || scope.length === 0) {
      setUndoCount(0)
      setRedoCount(0)
      return
    }

    setUndoCount(scope.reduce((count, nodeId) => count + manager.getUndoCount(nodeId), 0))
    setRedoCount(scope.reduce((count, nodeId) => count + manager.getRedoCount(nodeId), 0))
  }, [])

  useEffect(() => {
    syncCounts()
  }, [nodeIds, syncCounts])

  useEffect(() => {
    if (!store) return

    const unsubscribe = store.subscribe((event) => {
      if (nodeIdsRef.current.includes(event.change.payload.nodeId)) {
        syncCounts()
      }
    })

    return unsubscribe
  }, [store, syncCounts])

  const undo = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current) return false
    const result = await managerRef.current.undoLatest(nodeIdsRef.current)
    syncCounts()
    return result
  }, [syncCounts])

  const redo = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current) return false
    const result = await managerRef.current.redoLatest(nodeIdsRef.current)
    syncCounts()
    return result
  }, [syncCounts])

  const clear = useCallback(() => {
    if (!managerRef.current) return

    for (const nodeId of nodeIdsRef.current) {
      managerRef.current.clear(nodeId)
    }

    syncCounts()
  }, [syncCounts])

  return {
    undo,
    redo,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
    undoCount,
    redoCount,
    clear
  }
}
