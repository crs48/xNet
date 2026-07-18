/**
 * SavedViewTab — a saved view as first-class openable content
 * (exploration 0166): equal to a page, mounted in the editor area.
 */
import { validateSavedViewDescriptor, type SavedViewDescriptor } from '@xnetjs/data'
import { SavedViewSchema } from '@xnetjs/data'
import { SavedViewRunner, useQuery } from '@xnetjs/react'
import { useEffect, useMemo } from 'react'
import { useSocialFeedEnrichment } from '../hooks/useSocialFeedEnrichment'
import { WORKBENCH_SAVED_VIEW_REGISTRY } from '../lib/saved-view-registry'
import { usePublishTitle } from '../workbench/route-title'
import { useWorkbench } from '../workbench/state'

/** Parse + validate a stored descriptor; null when missing/invalid. */
export function parseStoredDescriptor(
  view: { descriptor?: string } | null | undefined
): SavedViewDescriptor | null {
  const raw = view?.descriptor
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SavedViewDescriptor
    return validateSavedViewDescriptor(parsed).valid ? parsed : null
  } catch {
    return null
  }
}

function SavedViewPlaceholder({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-ink-3">
      {loading ? 'Loading…' : 'This saved view is missing or has an invalid descriptor.'}
    </div>
  )
}

/** Publish a loaded node's title for the header/tab/recents (0353). */
function useTabTitleSync(nodeId: string, node: { title?: string } | null | undefined): void {
  usePublishTitle(nodeId, node?.title)
}

function SavedViewReady({
  viewId,
  title,
  descriptor
}: {
  viewId: string
  title: string | undefined
  descriptor: SavedViewDescriptor
}) {
  const feedEnrichment = useSocialFeedEnrichment()

  return (
    <SavedViewRunner
      descriptor={descriptor}
      registry={WORKBENCH_SAVED_VIEW_REGISTRY}
      title={title ?? null}
      fallbackId={viewId}
      resetKey={viewId}
      feedEnrichment={feedEnrichment}
    />
  )
}

export function SavedViewTab({ viewId }: { viewId: string }) {
  const { data: view, loading } = useQuery(SavedViewSchema, viewId)
  useTabTitleSync(viewId, view)

  const descriptor = useMemo<SavedViewDescriptor | null>(() => parseStoredDescriptor(view), [view])

  if (!view || !descriptor) {
    return <SavedViewPlaceholder loading={loading} />
  }

  return <SavedViewReady viewId={viewId} title={view.title} descriptor={descriptor} />
}
