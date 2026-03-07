/**
 * useUndo - React hook for per-node undo/redo
 *
 * Wraps UndoManager to provide undo/redo actions, stack depth,
 * and canUndo/canRedo state for a given node.
 *
 * @example
 * ```tsx
 * const { undo, redo, canUndo, canRedo, undoCount, redoCount } = useUndo(nodeId)
 *
 * // Wire to keyboard shortcuts
 * <button onClick={undo} disabled={!canUndo}>Undo</button>
 * <button onClick={redo} disabled={!canRedo}>Redo</button>
 * ```
 */

import type { DID } from '@xnetjs/core'
import type { NodeId } from '@xnetjs/data'
import { UndoManager, type UndoManagerOptions } from '@xnetjs/history'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────

export interface UseUndoOptions {
  /** The local user's DID (required for undo to work) */
  localDID: DID
  /** UndoManager configuration overrides */
  options?: Partial<UndoManagerOptions>
}

export interface UseUndoResult {
  /** Undo the last change for this node */
  undo: () => Promise<boolean>
  /** Redo the last undone change for this node */
  redo: () => Promise<boolean>
  /** Undo all changes in a batch */
  undoBatch: (batchId: string) => Promise<boolean>
  /** Whether undo is available */
  canUndo: boolean
  /** Whether redo is available */
  canRedo: boolean
  /** Number of undo entries */
  undoCount: number
  /** Number of redo entries */
  redoCount: number
  /** Clear undo/redo stacks for this node */
  clear: () => void
}

// ─── Hook ────────────────────────────────────────────────────

export function useUndo(nodeId: NodeId | null, opts: UseUndoOptions): UseUndoResult {
  const { store } = useNodeStore()
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)

  const managerRef = useRef<UndoManager | null>(null)
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

  // Create and start UndoManager
  useEffect(() => {
    if (!store) return

    const manager = new UndoManager(store, opts.localDID, normalizedOptions)
    manager.start()
    managerRef.current = manager

    return () => {
      manager.stop()
      managerRef.current = null
    }
  }, [store, opts.localDID, normalizedOptions])

  // Sync counts when node changes or after undo/redo
  const syncCounts = useCallback(() => {
    if (!managerRef.current || !nodeId) {
      setUndoCount(0)
      setRedoCount(0)
      return
    }
    setUndoCount(managerRef.current.getUndoCount(nodeId))
    setRedoCount(managerRef.current.getRedoCount(nodeId))
  }, [nodeId])

  // Re-sync counts when node changes
  useEffect(() => {
    syncCounts()
  }, [syncCounts])

  // Subscribe to store changes to keep counts fresh
  useEffect(() => {
    if (!store || !nodeId) return
    const unsub = store.subscribe((event) => {
      if (event.change.payload.nodeId === nodeId) {
        syncCounts()
      }
    })
    return unsub
  }, [store, nodeId, syncCounts])

  const undo = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current || !nodeId) return false
    const result = await managerRef.current.undo(nodeId)
    syncCounts()
    return result
  }, [nodeId, syncCounts])

  const redo = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current || !nodeId) return false
    const result = await managerRef.current.redo(nodeId)
    syncCounts()
    return result
  }, [nodeId, syncCounts])

  const undoBatch = useCallback(
    async (batchId: string): Promise<boolean> => {
      if (!managerRef.current) return false
      const result = await managerRef.current.undoBatch(batchId)
      syncCounts()
      return result
    },
    [syncCounts]
  )

  const clear = useCallback(() => {
    if (!managerRef.current || !nodeId) return
    managerRef.current.clear(nodeId)
    syncCounts()
  }, [nodeId, syncCounts])

  return {
    undo,
    redo,
    undoBatch,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
    undoCount,
    redoCount,
    clear
  }
}
