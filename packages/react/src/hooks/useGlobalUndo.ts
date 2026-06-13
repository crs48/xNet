/**
 * useGlobalUndo - app-wide Cmd+Z (exploration 0179)
 *
 * Reads the single app-level UndoManager from XNetProvider context and
 * exposes undo/redo backed by undoLatest()/redoLatest(), so one keybinding
 * reverses the most recent action across every node-backed surface —
 * folders, tasks, databases, chat, settings — without the caller caring
 * which surface produced it.
 *
 * Rich-text editing (TipTap) and the canvas keep their own document-scoped
 * undo and claim Cmd+Z while focused via the command registry's scope
 * stack; this hook is the fallthrough for everything else.
 *
 * @example
 * ```tsx
 * const { undo, redo, canUndo, canRedo } = useGlobalUndo()
 * registry.register({ id: 'edit.undo', key: 'Mod-Z', run: () => void undo() })
 * ```
 */

import type { XNetContextValue } from '../context'
import type { NodeStore } from '@xnetjs/data'
import type { UndoManager } from '@xnetjs/history'
import { useCallback, useContext, useEffect, useReducer } from 'react'
import { XNetContext } from '../context'

export interface UseGlobalUndoResult {
  /** Reverse the most recent local action across all node-backed surfaces */
  undo: () => Promise<boolean>
  /** Re-apply the most recently undone action */
  redo: () => Promise<boolean>
  /** Whether anything is undoable right now */
  canUndo: boolean
  /** Whether anything is redoable right now */
  canRedo: boolean
}

type UndoContext = { undoManager: UndoManager | null; nodeStore: NodeStore | null }

/** Pull the app-level undo manager + store off context (null outside a provider). */
function readUndoContext(ctx: XNetContextValue | null): UndoContext {
  if (!ctx) return { undoManager: null, nodeStore: null }
  return { undoManager: ctx.undoManager, nodeStore: ctx.nodeStore }
}

export function useGlobalUndo(): UseGlobalUndoResult {
  const ctx = useContext(XNetContext)
  const { undoManager, nodeStore } = readUndoContext(ctx)

  // Re-render canUndo/canRedo whenever the store changes (a new tracked
  // action, or a remote change) or after we run an undo/redo.
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!nodeStore) return
    return nodeStore.subscribe(() => bump())
  }, [nodeStore])

  const undo = useCallback(async (): Promise<boolean> => {
    if (!undoManager) return false
    const ok = await undoManager.undoLatest()
    bump()
    return ok
  }, [undoManager])

  const redo = useCallback(async (): Promise<boolean> => {
    if (!undoManager) return false
    const ok = await undoManager.redoLatest()
    bump()
    return ok
  }, [undoManager])

  return {
    undo,
    redo,
    canUndo: undoManager ? undoManager.hasUndo() : false,
    canRedo: undoManager ? undoManager.hasRedo() : false
  }
}
