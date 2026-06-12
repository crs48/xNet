/**
 * Status bar items and background jobs (exploration 0166).
 *
 * Ephemeral (non-persisted) registry. Left side = workspace scope
 * (sync, hub, jobs); right side = view scope (word count, row count,
 * zoom). Views publish via useStatusBarItem; long-running work
 * publishes via useWorkbenchJobs / reportJob.
 */
import { useEffect } from 'react'
import { create } from 'zustand'

export interface StatusBarItem {
  id: string
  text: string
  /** Workspace scope renders left; view scope renders right */
  side: 'left' | 'right'
  title?: string
  onClick?: () => void
}

export interface WorkbenchJob {
  id: string
  label: string
  /** 0..1, or undefined for indeterminate */
  progress?: number
}

interface StatusState {
  items: Record<string, StatusBarItem>
  jobs: Record<string, WorkbenchJob>
  setItem: (item: StatusBarItem) => void
  removeItem: (id: string) => void
  setJob: (job: WorkbenchJob) => void
  removeJob: (id: string) => void
}

export const useWorkbenchStatus = create<StatusState>()((set) => ({
  items: {},
  jobs: {},
  setItem: (item) => set((state) => ({ items: { ...state.items, [item.id]: item } })),
  removeItem: (id) =>
    set((state) => {
      const items = { ...state.items }
      delete items[id]
      return { items }
    }),
  setJob: (job) => set((state) => ({ jobs: { ...state.jobs, [job.id]: job } })),
  removeJob: (id) =>
    set((state) => {
      const jobs = { ...state.jobs }
      delete jobs[id]
      return { jobs }
    })
}))

/** Publish a status bar item for the lifetime of the calling component. */
export function useStatusBarItem(item: StatusBarItem | null): void {
  const setItem = useWorkbenchStatus((state) => state.setItem)
  const removeItem = useWorkbenchStatus((state) => state.removeItem)

  const key = item ? `${item.id}|${item.text}|${item.side}|${item.title ?? ''}` : null

  useEffect(() => {
    if (!item) return
    setItem(item)
    return () => removeItem(item.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setItem, removeItem])
}

/** Imperative job reporting for non-React call sites (imports, sync). */
export function reportJob(job: WorkbenchJob): () => void {
  useWorkbenchStatus.getState().setJob(job)
  return () => useWorkbenchStatus.getState().removeJob(job.id)
}
