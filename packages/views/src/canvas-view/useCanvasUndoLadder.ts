/**
 * Canvas multi-domain undo ladder (exploration 0277, E5/W8).
 *
 * A canvas edit session interleaves four undo domains: the scene itself
 * (move/resize/create), the selected source node (inline page edits),
 * the selection scope (multi-node source edits), and the selected
 * database document (cell edits in an inline database surface). Each
 * user-visible mutation records a boundary; undo/redo replays the most
 * recent boundary across whichever domain owns it.
 *
 * Extracted from the desktop CanvasView so both platforms share the
 * same undo semantics. On the web this replaces the single scene
 * Y.UndoManager: Mod+Z inside a focused canvas now undoes an
 * inline-edited source document when that was the latest change.
 */

import { createCanvasUndoManager } from '@xnetjs/canvas'
import { useDatabaseDoc, useUndo } from '@xnetjs/react'
import { useUndoScope } from '@xnetjs/react/internal'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'

export type CanvasUndoDomain = 'scene' | 'source-node' | 'source-scope' | 'source-document'

function createUndoOrderMap(): Record<CanvasUndoDomain, number[]> {
  return {
    scene: [],
    'source-node': [],
    'source-scope': [],
    'source-document': []
  }
}

function getYjsStackDepth(manager: Y.UndoManager | null, stack: 'undoStack' | 'redoStack'): number {
  if (!manager) {
    return 0
  }

  const entries = (manager as unknown as Record<'undoStack' | 'redoStack', unknown[]>)[stack]
  return Array.isArray(entries) ? entries.length : 0
}

export interface UseCanvasUndoLadderOptions {
  /**
   * The canvas doc; the ladder owns the scene Y.UndoManager over its maps.
   * (`CanvasHandle.undo()` delegates back to `onUndoRedoShortcut`, so the
   * scene rung must NOT round-trip through the handle — that recursion was
   * a latent desktop bug this extraction fixed.)
   */
  doc: Y.Doc | null
  selectedSourceNodeIds: string[]
  /** Source id of the selected database card, or '' when none. */
  selectedDatabaseSourceId: string
  did: string | null | undefined
}

export interface UseCanvasUndoLadderResult {
  activeUndoDomain: CanvasUndoDomain
  recordUndoBoundary: (domain: CanvasUndoDomain) => void
  runCanvasScopedUndo: (direction: 'undo' | 'redo') => boolean
}

export function useCanvasUndoLadder({
  doc,
  selectedSourceNodeIds,
  selectedDatabaseSourceId,
  did
}: UseCanvasUndoLadderOptions): UseCanvasUndoLadderResult {
  const selectedDatabaseUndoManagerRef = useRef<Y.UndoManager | null>(null)
  // Scene undo (0179): a Y.UndoManager over the scene maps, owned here.
  const sceneUndoManager = useMemo(() => (doc ? createCanvasUndoManager(doc) : null), [doc])

  useEffect(() => {
    if (!sceneUndoManager) return

    return () => {
      sceneUndoManager.destroy()
    }
  }, [sceneUndoManager])
  const undoOrderSequenceRef = useRef(0)
  const undoOrderRef = useRef<Record<CanvasUndoDomain, number[]>>(createUndoOrderMap())
  const redoOrderRef = useRef<Record<CanvasUndoDomain, number[]>>(createUndoOrderMap())
  const [activeUndoDomain, setActiveUndoDomain] = useState<CanvasUndoDomain>('scene')

  const { doc: selectedDatabaseDoc } = useDatabaseDoc(selectedDatabaseSourceId)
  const {
    undo: undoSelectedSource,
    redo: redoSelectedSource,
    canUndo: canUndoSelectedSource,
    canRedo: canRedoSelectedSource
  } = useUndo(selectedSourceNodeIds.length === 1 ? selectedSourceNodeIds[0] : null, {
    localDID: (did as `did:key:${string}` | null | undefined) ?? null,
    options: {
      mergeInterval: 750
    }
  })
  const {
    undo: undoSelectedSourceScope,
    redo: redoSelectedSourceScope,
    canUndo: canUndoSelectedSourceScope,
    canRedo: canRedoSelectedSourceScope
  } = useUndoScope(selectedSourceNodeIds, {
    localDID: (did as `did:key:${string}` | null | undefined) ?? null,
    options: {
      mergeInterval: 750
    }
  })

  useEffect(() => {
    if (!selectedDatabaseDoc) {
      selectedDatabaseUndoManagerRef.current = null
      return
    }

    const dataMap = selectedDatabaseDoc.getMap('data')
    const manager = new Y.UndoManager([dataMap], { captureTimeout: 300 })
    selectedDatabaseUndoManagerRef.current = manager

    return () => {
      manager.destroy()
      if (selectedDatabaseUndoManagerRef.current === manager) {
        selectedDatabaseUndoManagerRef.current = null
      }
    }
  }, [selectedDatabaseDoc])

  const recordUndoBoundary = useCallback((domain: CanvasUndoDomain) => {
    undoOrderSequenceRef.current += 1
    undoOrderRef.current[domain].push(undoOrderSequenceRef.current)
    redoOrderRef.current = createUndoOrderMap()
    setActiveUndoDomain(domain)
  }, [])
  const getUndoBoundaryOrder = useCallback(
    (domain: CanvasUndoDomain, direction: 'undo' | 'redo'): number => {
      const stack =
        direction === 'undo' ? undoOrderRef.current[domain] : redoOrderRef.current[domain]
      return stack.length > 0 ? (stack.at(-1) ?? -1) : -1
    },
    []
  )
  const applyUndoBoundary = useCallback((domain: CanvasUndoDomain, direction: 'undo' | 'redo') => {
    const sourceStack =
      direction === 'undo' ? undoOrderRef.current[domain] : redoOrderRef.current[domain]
    const targetStack =
      direction === 'undo' ? redoOrderRef.current[domain] : undoOrderRef.current[domain]
    const boundaryOrder = sourceStack.pop()

    if (typeof boundaryOrder === 'number') {
      targetStack.push(boundaryOrder)
    }

    setActiveUndoDomain(domain)
  }, [])

  const runCanvasScopedUndo = useCallback(
    (direction: 'undo' | 'redo'): boolean => {
      const canSelectedSource = direction === 'undo' ? canUndoSelectedSource : canRedoSelectedSource
      const canSelectedSourceScope =
        direction === 'undo' ? canUndoSelectedSourceScope : canRedoSelectedSourceScope
      const canSelectedSourceDocument =
        getYjsStackDepth(
          selectedDatabaseUndoManagerRef.current,
          direction === 'undo' ? 'undoStack' : 'redoStack'
        ) > 0

      const canScene =
        getYjsStackDepth(sceneUndoManager, direction === 'undo' ? 'undoStack' : 'redoStack') > 0

      const runScene = (): boolean => {
        if (!canScene || !sceneUndoManager) {
          return false
        }

        if (direction === 'undo') {
          sceneUndoManager.undo()
        } else {
          sceneUndoManager.redo()
        }

        applyUndoBoundary('scene', direction)
        return true
      }

      const runSelectedSource = (): boolean => {
        if (!canSelectedSource) {
          return false
        }

        applyUndoBoundary('source-node', direction)
        void (direction === 'undo' ? undoSelectedSource() : redoSelectedSource())
        return true
      }

      const runSelectedSourceScope = (): boolean => {
        if (!canSelectedSourceScope) {
          return false
        }

        applyUndoBoundary('source-scope', direction)
        void (direction === 'undo' ? undoSelectedSourceScope() : redoSelectedSourceScope())
        return true
      }

      const runSelectedSourceDocument = (): boolean => {
        if (!canSelectedSourceDocument || !selectedDatabaseUndoManagerRef.current) {
          return false
        }

        applyUndoBoundary('source-document', direction)
        if (direction === 'undo') {
          selectedDatabaseUndoManagerRef.current.undo()
        } else {
          selectedDatabaseUndoManagerRef.current.redo()
        }
        return true
      }

      const orderedDomains = (
        [
          { domain: 'scene', available: canScene, run: runScene },
          {
            domain: 'source-document',
            available: canSelectedSourceDocument,
            run: runSelectedSourceDocument
          },
          {
            domain: 'source-scope',
            available: canSelectedSourceScope,
            run: runSelectedSourceScope
          },
          { domain: 'source-node', available: canSelectedSource, run: runSelectedSource }
        ] as const
      )
        .filter((entry) => entry.available)
        .sort(
          (left, right) =>
            getUndoBoundaryOrder(right.domain, direction) -
            getUndoBoundaryOrder(left.domain, direction)
        )

      for (const entry of orderedDomains) {
        if (entry.run()) {
          return true
        }
      }

      return false
    },
    [
      applyUndoBoundary,
      canRedoSelectedSource,
      canRedoSelectedSourceScope,
      canUndoSelectedSource,
      canUndoSelectedSourceScope,
      sceneUndoManager,
      getUndoBoundaryOrder,
      redoSelectedSource,
      redoSelectedSourceScope,
      undoSelectedSource,
      undoSelectedSourceScope
    ]
  )

  return {
    activeUndoDomain,
    recordUndoBoundary,
    runCanvasScopedUndo
  }
}
