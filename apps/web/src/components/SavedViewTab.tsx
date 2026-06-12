/**
 * SavedViewTab — a saved view as first-class openable content
 * (exploration 0166): equal to a page, mounted in the editor area.
 */
import { validateSavedViewDescriptor, type SavedViewDescriptor } from '@xnetjs/data'
import { SavedViewSchema } from '@xnetjs/data'
import { SavedViewRunner, useQuery } from '@xnetjs/react'
import { useEffect, useMemo } from 'react'
import { WORKBENCH_SAVED_VIEW_REGISTRY } from '../lib/saved-view-registry'
import { useWorkbench } from '../workbench/state'

export function SavedViewTab({ viewId }: { viewId: string }) {
  const { data: view, loading } = useQuery(SavedViewSchema, viewId)

  const title = view?.title
  useEffect(() => {
    if (title) useWorkbench.getState().setTabTitle(viewId, title)
  }, [viewId, title])

  const descriptor = useMemo<SavedViewDescriptor | null>(() => {
    if (!view?.descriptor) return null
    try {
      const parsed = JSON.parse(view.descriptor) as SavedViewDescriptor
      return validateSavedViewDescriptor(parsed).valid ? parsed : null
    } catch {
      return null
    }
  }, [view?.descriptor])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-ink-3">Loading…</div>
    )
  }

  if (!view || !descriptor) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-ink-3">
        This saved view is missing or has an invalid descriptor.
      </div>
    )
  }

  return (
    <SavedViewRunner
      descriptor={descriptor}
      registry={WORKBENCH_SAVED_VIEW_REGISTRY}
      title={view.title ?? null}
      fallbackId={viewId}
      resetKey={viewId}
    />
  )
}
