/**
 * useCanvasTaskSync - Reconcile canvas checklist items with Task nodes.
 *
 * Canvas checklist objects are an editing projection just like page
 * checklists: every item is backed by a canonical Task node (source:
 * 'canvas', `canvas` relation = hosting canvas, anchorBlockId = the
 * checklist object id). Items removed from the canvas archive their nodes;
 * items pasted from elsewhere claim them. Semantics in
 * docs/specs/PAGE_TASK_RECONCILIATION.md.
 */
import {
  useTaskProjectionSync,
  type TaskProjectionInput,
  type UseTaskProjectionSyncResult
} from './useTaskProjectionSync'

export type CanvasTaskInput = TaskProjectionInput

export interface UseCanvasTaskSyncOptions {
  canvasId: string | null
  debounceMs?: number
}

export type UseCanvasTaskSyncResult = UseTaskProjectionSyncResult

export function useCanvasTaskSync({
  canvasId,
  debounceMs
}: UseCanvasTaskSyncOptions): UseCanvasTaskSyncResult {
  return useTaskProjectionSync({
    host: 'canvas',
    hostId: canvasId,
    ...(debounceMs !== undefined ? { debounceMs } : {})
  })
}
