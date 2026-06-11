/**
 * usePageTaskSync - Reconcile page task rows with Task nodes.
 *
 * Checklist items inside page editors remain the inline editing surface, while
 * Task nodes stay the canonical cross-surface records for querying and reuse.
 * Thin wrapper over useTaskProjectionSync (host: 'page'); semantics in
 * docs/specs/PAGE_TASK_RECONCILIATION.md.
 */
import {
  useTaskProjectionSync,
  type TaskProjectionInput,
  type TaskProjectionReferenceInput,
  type UseTaskProjectionSyncResult
} from './useTaskProjectionSync'

export type PageTaskReferenceInput = TaskProjectionReferenceInput

export type PageTaskInput = TaskProjectionInput

export interface UsePageTaskSyncOptions {
  pageId: string | null
  debounceMs?: number
}

export type UsePageTaskSyncResult = UseTaskProjectionSyncResult

export function usePageTaskSync({
  pageId,
  debounceMs
}: UsePageTaskSyncOptions): UsePageTaskSyncResult {
  return useTaskProjectionSync({
    host: 'page',
    hostId: pageId,
    ...(debounceMs !== undefined ? { debounceMs } : {})
  })
}
