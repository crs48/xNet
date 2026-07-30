/**
 * Live page search and backlink surface.
 *
 * Acquires page docs through the active sync/runtime layer so search and
 * backlinks reuse the same live document path as editing.
 */
import type { DocumentLinkMatch, SearchResult } from '@xnetjs/sdk'
import { PageSchema } from '@xnetjs/data'
import { useQuery, useSyncManager } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import { createSearchIndex, extractBacklinks } from '@xnetjs/sdk'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'

type IndexedPage = {
  id: string
  title: string
  doc: Y.Doc
}

type PageHandle = {
  doc: Y.Doc
  dispose: () => void
}

type BacklinkResult = {
  docId: string
  title: string
  context: string
  matchCount: number
}

type UsePageSearchSurfaceOptions = {
  enabled: boolean
}

export function usePageSearchSurface({ enabled }: UsePageSearchSurfaceOptions) {
  const syncManager = useSyncManager()
  const { store, isReady } = useNodeStore()
  const { data: pages, loading: pagesLoading } = useQuery(PageSchema)
  const indexRef = useRef(createSearchIndex())
  const handlesRef = useRef(new Map<string, PageHandle>())
  const indexedPagesRef = useRef(new Map<string, IndexedPage>())
  const pageMetaRef = useRef(new Map<string, { title: string }>())
  const refreshScheduledRef = useRef(false)
  const [revision, setRevision] = useState(0)
  const [pendingDocs, setPendingDocs] = useState(0)

  const scheduleRefresh = useCallback(() => {
    if (refreshScheduledRef.current) return

    refreshScheduledRef.current = true
    queueMicrotask(() => {
      refreshScheduledRef.current = false
      startTransition(() => {
        setRevision((value) => value + 1)
      })
    })
  }, [])

  const syncIndexedPage = useCallback(
    (pageId: string) => {
      const handle = handlesRef.current.get(pageId)
      const meta = pageMetaRef.current.get(pageId)
      if (!handle || !meta) return

      indexedPagesRef.current.set(pageId, {
        id: pageId,
        title: meta.title,
        doc: handle.doc
      })

      indexRef.current.update({
        id: pageId,
        ydoc: handle.doc,
        type: 'page',
        workspace: 'local',
        metadata: { title: meta.title }
      })

      scheduleRefresh()
    },
    [scheduleRefresh]
  )

  const releasePage = useCallback(
    (pageId: string) => {
      const handle = handlesRef.current.get(pageId)
      if (!handle) return

      handle.dispose()
      handlesRef.current.delete(pageId)
      indexedPagesRef.current.delete(pageId)
      pageMetaRef.current.delete(pageId)
      indexRef.current.remove(pageId)
      scheduleRefresh()
    },
    [scheduleRefresh]
  )

  useEffect(() => {
    if (!enabled) {
      for (const pageId of Array.from(handlesRef.current.keys())) {
        releasePage(pageId)
      }
      return
    }

    if (!store || !isReady || pagesLoading) {
      return
    }

    let cancelled = false
    const activeIds = new Set<string>()

    for (const page of pages) {
      activeIds.add(page.id)
      pageMetaRef.current.set(page.id, {
        title: typeof page.title === 'string' && page.title.length > 0 ? page.title : 'Untitled'
      })

      if (handlesRef.current.has(page.id)) {
        syncIndexedPage(page.id)
        continue
      }

      setPendingDocs((count) => count + 1)

      void acquirePageDoc(syncManager, store, page.id)
        .then((acquired) => {
          if (cancelled || !activeIds.has(page.id)) {
            acquired.dispose()
            return
          }

          const handleUpdate = () => {
            syncIndexedPage(page.id)
          }

          acquired.doc.on('update', handleUpdate)
          handlesRef.current.set(page.id, {
            doc: acquired.doc,
            dispose: () => {
              acquired.doc.off('update', handleUpdate)
              acquired.dispose()
            }
          })

          syncIndexedPage(page.id)
        })
        .catch((error: unknown) => {
          console.warn('[usePageSearchSurface] Failed to acquire page doc:', page.id, error)
        })
        .finally(() => {
          if (!cancelled) {
            setPendingDocs((count) => Math.max(0, count - 1))
          }
        })
    }

    for (const pageId of Array.from(handlesRef.current.keys())) {
      if (!activeIds.has(pageId)) {
        releasePage(pageId)
      }
    }

    return () => {
      cancelled = true
    }
  }, [enabled, isReady, pages, pagesLoading, releasePage, store, syncIndexedPage, syncManager])

  useEffect(() => {
    return () => {
      for (const pageId of Array.from(handlesRef.current.keys())) {
        releasePage(pageId)
      }
    }
  }, [releasePage])

  const indexedPages = useMemo(() => Array.from(indexedPagesRef.current.values()), [revision])

  const search = useCallback((query: string, limit = 10): SearchResult[] => {
    if (!query.trim()) return []
    return indexRef.current.search({ text: query, limit })
  }, [])

  const getBacklinks = useCallback(
    (targetId: string): BacklinkResult[] => {
      const backlinks = indexedPages
        .map((page) => {
          const matches = extractBacklinks(page.doc, targetId)
          if (matches.length === 0 || page.id === targetId) {
            return null
          }

          return {
            docId: page.id,
            title: page.title,
            context: pickBacklinkContext(matches),
            matchCount: matches.length
          }
        })
        .filter((entry): entry is BacklinkResult => entry !== null)

      backlinks.sort((left, right) => {
        if (right.matchCount !== left.matchCount) {
          return right.matchCount - left.matchCount
        }
        return left.title.localeCompare(right.title)
      })

      return backlinks
    },
    [indexedPages]
  )

  return {
    loading: enabled && (pagesLoading || pendingDocs > 0),
    ready: enabled && !pagesLoading && pendingDocs === 0,
    totalPages: pages.length,
    indexedPages: indexedPages.length,
    search,
    getBacklinks
  }
}

function pickBacklinkContext(matches: DocumentLinkMatch[]): string {
  const first = matches[0]
  return first?.context ?? ''
}

async function acquirePageDoc(
  syncManager: ReturnType<typeof useSyncManager>,
  store: { getDocumentContent(nodeId: string): Promise<Uint8Array | null> },
  pageId: string
): Promise<{ doc: Y.Doc; dispose: () => void }> {
  if (syncManager) {
    const doc = await syncManager.acquire(pageId)
    const storedContent = await store.getDocumentContent(pageId)
    if (storedContent && storedContent.length > 0) {
      Y.applyUpdate(doc, storedContent, 'storage')
    }

    return {
      doc,
      dispose: () => syncManager.release(pageId)
    }
  }

  const doc = new Y.Doc({ guid: pageId, gc: false })
  const storedContent = await store.getDocumentContent(pageId)
  if (storedContent && storedContent.length > 0) {
    Y.applyUpdate(doc, storedContent, 'storage')
  }

  return {
    doc,
    dispose: () => doc.destroy()
  }
}
