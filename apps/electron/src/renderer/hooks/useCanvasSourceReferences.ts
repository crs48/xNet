import type { CanvasNode } from '@xnetjs/canvas'
import { useSyncManager } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'

type CanvasDocHandle = {
  doc: Y.Doc
  dispose: () => void
}

type CanvasRecord = {
  id: string
  title?: string
}

export type CanvasSourceReference = {
  sourceNodeId: string
  canvasId: string
  canvasTitle: string
  objectId: string
  objectType: CanvasNode['type']
  alias: string | null
  title: string
  isCurrentCanvas: boolean
}

type UseCanvasSourceReferencesOptions = {
  enabled: boolean
  currentCanvasId: string
  canvases: CanvasRecord[]
}

type UseCanvasSourceReferencesResult = {
  loading: boolean
  ready: boolean
  indexedCanvases: number
  totalCanvases: number
  getReferences: (
    sourceNodeId: string,
    options?: {
      excludeObjectId?: string
    }
  ) => CanvasSourceReference[]
}

function getCanvasSourceId(node: CanvasNode): string | null {
  const sourceId = node.sourceNodeId ?? node.linkedNodeId
  return typeof sourceId === 'string' && sourceId.length > 0 ? sourceId : null
}

function getCanvasReferenceTitle(node: CanvasNode): string {
  const title = node.alias ?? (node.properties.title as string) ?? 'Untitled'
  return typeof title === 'string' && title.trim().length > 0 ? title.trim() : 'Untitled'
}

function sortCanvasReferences(left: CanvasSourceReference, right: CanvasSourceReference): number {
  if (left.isCurrentCanvas !== right.isCurrentCanvas) {
    return left.isCurrentCanvas ? -1 : 1
  }

  const canvasCompare = left.canvasTitle.localeCompare(right.canvasTitle)
  if (canvasCompare !== 0) {
    return canvasCompare
  }

  const titleCompare = left.title.localeCompare(right.title)
  if (titleCompare !== 0) {
    return titleCompare
  }

  return left.objectId.localeCompare(right.objectId)
}

async function acquireCanvasDoc(
  syncManager: ReturnType<typeof useSyncManager>,
  store: {
    getDocumentContent(nodeId: string): Promise<Uint8Array | null>
  },
  canvasId: string
): Promise<CanvasDocHandle> {
  if (syncManager) {
    const doc = await syncManager.acquire(canvasId)
    const storedContent = await store.getDocumentContent(canvasId)
    if (storedContent && storedContent.length > 0) {
      Y.applyUpdate(doc, storedContent)
    }

    return {
      doc,
      dispose: () => {
        syncManager.release(canvasId)
      }
    }
  }

  const doc = new Y.Doc({ guid: canvasId, gc: false })
  const storedContent = await store.getDocumentContent(canvasId)
  if (storedContent && storedContent.length > 0) {
    Y.applyUpdate(doc, storedContent)
  }

  return {
    doc,
    dispose: () => {
      doc.destroy()
    }
  }
}

export function useCanvasSourceReferences({
  enabled,
  currentCanvasId,
  canvases
}: UseCanvasSourceReferencesOptions): UseCanvasSourceReferencesResult {
  const syncManager = useSyncManager()
  const { store, isReady } = useNodeStore()
  const canvasMetaRef = useRef(new Map<string, CanvasRecord>())
  const handlesRef = useRef(new Map<string, CanvasDocHandle>())
  const refsByCanvasRef = useRef(new Map<string, CanvasSourceReference[]>())
  const refsBySourceRef = useRef(new Map<string, CanvasSourceReference[]>())
  const refreshScheduledRef = useRef(false)
  const [pendingDocs, setPendingDocs] = useState(0)
  const [revision, setRevision] = useState(0)

  const scheduleRefresh = useCallback((): void => {
    if (refreshScheduledRef.current) {
      return
    }

    refreshScheduledRef.current = true
    queueMicrotask(() => {
      refreshScheduledRef.current = false
      startTransition(() => {
        setRevision((value) => value + 1)
      })
    })
  }, [])

  const rebuildSourceIndex = useCallback((): void => {
    const rebuilt = new Map<string, CanvasSourceReference[]>()
    for (const refs of refsByCanvasRef.current.values()) {
      for (const ref of refs) {
        const existing = rebuilt.get(ref.sourceNodeId) ?? []
        existing.push(ref)
        rebuilt.set(ref.sourceNodeId, existing)
      }
    }

    refsBySourceRef.current = rebuilt
    scheduleRefresh()
  }, [scheduleRefresh])

  const indexCanvas = useCallback(
    (canvasId: string): void => {
      const handle = handlesRef.current.get(canvasId)
      const canvasMeta = canvasMetaRef.current.get(canvasId)
      if (!handle || !canvasMeta) {
        return
      }

      const refs: CanvasSourceReference[] = []
      const nodesMap = handle.doc.getMap<CanvasNode>('nodes')

      nodesMap.forEach((value: unknown, key: string) => {
        const node = value as CanvasNode
        const sourceNodeId = getCanvasSourceId(node)
        if (!sourceNodeId) {
          return
        }

        refs.push({
          sourceNodeId,
          canvasId,
          canvasTitle:
            typeof canvasMeta.title === 'string' && canvasMeta.title.length > 0
              ? canvasMeta.title
              : 'Untitled Canvas',
          objectId: key,
          objectType: node.type,
          alias: typeof node.alias === 'string' && node.alias.trim().length > 0 ? node.alias : null,
          title: getCanvasReferenceTitle(node),
          isCurrentCanvas: canvasId === currentCanvasId
        })
      })

      refsByCanvasRef.current.set(canvasId, refs)

      const rebuilt = new Map<string, CanvasSourceReference[]>()
      for (const canvasRefs of refsByCanvasRef.current.values()) {
        for (const ref of canvasRefs) {
          const existing = rebuilt.get(ref.sourceNodeId) ?? []
          existing.push(ref)
          rebuilt.set(ref.sourceNodeId, existing)
        }
      }

      refsBySourceRef.current = rebuilt
      scheduleRefresh()
    },
    [currentCanvasId, scheduleRefresh]
  )

  const releaseCanvas = useCallback(
    (canvasId: string): void => {
      const handle = handlesRef.current.get(canvasId)
      if (!handle) {
        return
      }

      handle.dispose()
      handlesRef.current.delete(canvasId)
      refsByCanvasRef.current.delete(canvasId)
      rebuildSourceIndex()
    },
    [rebuildSourceIndex]
  )

  useEffect(() => {
    if (!enabled) {
      for (const canvasId of Array.from(handlesRef.current.keys())) {
        releaseCanvas(canvasId)
      }
      return
    }

    if (!store || !isReady) {
      return
    }

    let cancelled = false
    const activeIds = new Set<string>()

    for (const canvas of canvases) {
      activeIds.add(canvas.id)
      canvasMetaRef.current.set(canvas.id, {
        id: canvas.id,
        title: typeof canvas.title === 'string' ? canvas.title : 'Untitled Canvas'
      })

      if (handlesRef.current.has(canvas.id)) {
        indexCanvas(canvas.id)
        continue
      }

      setPendingDocs((count) => count + 1)

      void acquireCanvasDoc(syncManager, store, canvas.id)
        .then((acquired) => {
          if (cancelled || !activeIds.has(canvas.id)) {
            acquired.dispose()
            return
          }

          const handleUpdate = () => {
            indexCanvas(canvas.id)
          }

          acquired.doc.on('update', handleUpdate)
          handlesRef.current.set(canvas.id, {
            doc: acquired.doc,
            dispose: () => {
              acquired.doc.off('update', handleUpdate)
              acquired.dispose()
            }
          })

          indexCanvas(canvas.id)
        })
        .catch((error: unknown) => {
          console.warn(
            '[useCanvasSourceReferences] Failed to acquire canvas doc:',
            canvas.id,
            error
          )
        })
        .finally(() => {
          if (!cancelled) {
            setPendingDocs((count) => Math.max(0, count - 1))
          }
        })
    }

    for (const canvasId of Array.from(handlesRef.current.keys())) {
      if (!activeIds.has(canvasId)) {
        releaseCanvas(canvasId)
      }
    }

    return () => {
      cancelled = true
    }
  }, [canvases, enabled, indexCanvas, isReady, releaseCanvas, store, syncManager])

  useEffect(() => {
    return () => {
      for (const canvasId of Array.from(handlesRef.current.keys())) {
        releaseCanvas(canvasId)
      }
    }
  }, [releaseCanvas])

  const indexedCanvases = useMemo(() => handlesRef.current.size, [revision])
  const totalCanvases = canvases.length

  const getReferences = useCallback(
    (
      sourceNodeId: string,
      options?: {
        excludeObjectId?: string
      }
    ): CanvasSourceReference[] => {
      const refs = refsBySourceRef.current.get(sourceNodeId) ?? []
      return refs
        .filter((ref) => ref.objectId !== options?.excludeObjectId)
        .slice()
        .sort(sortCanvasReferences)
    },
    [revision]
  )

  return {
    loading: enabled && pendingDocs > 0,
    ready: enabled && pendingDocs === 0,
    indexedCanvases,
    totalCanvases,
    getReferences
  }
}
