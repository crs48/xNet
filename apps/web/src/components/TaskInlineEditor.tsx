/**
 * TaskInlineEditor - binds the shared TaskDetailForm to this app's
 * mutation layer, people directory, workbench pins, and router.
 *
 * One host for every surface that edits a task in place: the Tasks
 * surface (list expansion + board peek + context panel), the page
 * right-panel checklist, and the left-sidebar dashboard.
 *
 * Field authority (docs/specs/PAGE_TASK_RECONCILIATION.md): a page-hosted
 * checklist task owns its title, assignees, and due date in the host
 * document. When the host page's live editor is available (`hostEditor`),
 * assignee/due-date edits write through to the document's inline metadata
 * (mentions, due chips) and reconcile back to the node; without it those
 * fields are read-only and the form links to the page. Status, priority,
 * and pins are node-owned and always editable.
 */
import { useNavigate } from '@tanstack/react-router'
import { TaskSchema, isCompletedTaskStatus, type DID, type TaskStatusId } from '@xnetjs/data'
import {
  addTaskAssigneeToDoc,
  removeTaskAssigneeFromDoc,
  setTaskDueDateInDoc,
  type Editor,
  type TaskMentionSuggestion
} from '@xnetjs/editor/react'
import { useMutate, type UseTasksResult } from '@xnetjs/react'
import { TaskDetailForm, type TaskDisplayData } from '@xnetjs/ui'
import { Pin } from 'lucide-react'
import { useMemo, type JSX } from 'react'
import { useWorkspacePeople } from '../hooks/useWorkspacePeople'
import { useWorkbench } from '../workbench/state'

export type TaskNode = UseTasksResult['data'][number]

/** Live editor of the page hosting this task (node → editor direction). */
export interface TaskHostEditor {
  getEditor: () => Editor | null
  /** Presence-derived people for mention metadata (labels, colors) */
  suggestions: TaskMentionSuggestion[]
}

/** Project the raw Task node onto the shared display contract. */
function toTaskDisplayData(task: TaskNode): TaskDisplayData {
  return {
    id: task.id,
    title: typeof task.title === 'string' ? task.title : '',
    completed: Boolean(task.completed),
    status: typeof task.status === 'string' ? task.status : undefined,
    priority: typeof task.priority === 'string' ? task.priority : undefined,
    dueDate: typeof task.dueDate === 'number' ? task.dueDate : null,
    assignees: Array.isArray(task.assignees) ? task.assignees.map(String) : [],
    referenceCount: Array.isArray(task.references) ? task.references.length : 0,
    shortId: typeof task.shortId === 'string' ? task.shortId : null
  }
}

export interface TaskInlineEditorProps {
  task: TaskNode
  /** Pass when the hosting page's editor is mounted (page right panel) */
  hostEditor?: TaskHostEditor
  onClose?: () => void
  autoFocusTitle?: boolean
  className?: string
}

export function TaskInlineEditor({
  task,
  hostEditor,
  onClose,
  autoFocusTitle,
  className
}: TaskInlineEditorProps): JSX.Element {
  const navigate = useNavigate()
  const { update } = useMutate()
  const people = useWorkspacePeople()
  const pinned = useWorkbench((state) => state.pinnedNodeIds.includes(task.id))
  const togglePinnedNode = useWorkbench((state) => state.togglePinnedNode)

  const display = useMemo(() => toTaskDisplayData(task), [task])

  const pageId = typeof task.page === 'string' && task.page ? task.page : null
  const canvasId = typeof task.canvas === 'string' && task.canvas ? task.canvas : null
  const sourceLabel = pageId ? 'Open page' : canvasId ? 'Open canvas' : null
  // Hosted checklist tasks mirror title/assignees/dueDate from their host
  // document; node-side writes would be overwritten by the next snapshot.
  const hostOwned = Boolean(pageId || canvasId)
  const docEditable = hostOwned && Boolean(hostEditor)

  const handleOpenSource = () => {
    if (pageId) void navigate({ to: '/doc/$docId', params: { docId: pageId } })
    else if (canvasId) void navigate({ to: '/canvas/$canvasId', params: { canvasId } })
  }

  const mentionFor = (did: string): TaskMentionSuggestion => {
    const fromPresence = hostEditor?.suggestions.find((entry) => entry.id === did)
    if (fromPresence) return fromPresence
    return { id: did, label: did.startsWith('did:key:') ? did.slice(8, 18) : did }
  }

  const handleDocAssigneesChange = (taskId: string, assignees: string[]) => {
    const editor = hostEditor?.getEditor()
    if (!editor) return
    const current = display.assignees ?? []
    for (const added of assignees.filter((did) => !current.includes(did))) {
      addTaskAssigneeToDoc(editor, taskId, mentionFor(added))
    }
    for (const removed of current.filter((did) => !assignees.includes(did))) {
      removeTaskAssigneeFromDoc(editor, taskId, removed)
    }
  }

  const handleDocDueDateChange = (taskId: string, dueDate: number | null) => {
    const editor = hostEditor?.getEditor()
    if (!editor) return
    setTaskDueDateInDoc(
      editor,
      taskId,
      dueDate == null ? null : new Date(dueDate).toISOString().slice(0, 10)
    )
  }

  return (
    <TaskDetailForm
      task={display}
      people={people}
      sourceLabel={sourceLabel}
      className={className}
      autoFocusTitle={autoFocusTitle}
      onClose={onClose}
      titleReadOnly={hostOwned}
      metaNotice={
        hostOwned && !docEditable
          ? 'Title, due date & assignees live in the hosting document — open it to edit them.'
          : undefined
      }
      onTitleChange={
        hostOwned ? undefined : (taskId, title) => void update(TaskSchema, taskId, { title })
      }
      onStatusChange={(taskId, status) =>
        void update(TaskSchema, taskId, {
          status: status as TaskStatusId,
          completed: isCompletedTaskStatus(status)
        })
      }
      onPriorityChange={(taskId, priority) =>
        void update(TaskSchema, taskId, {
          priority: priority as 'low' | 'medium' | 'high' | 'urgent'
        })
      }
      onDueDateChange={
        docEditable
          ? handleDocDueDateChange
          : hostOwned
            ? undefined
            : (taskId, dueDate) =>
                // `undefined` is the clear sentinel (matches useTaskProjectionSync).
                void update(TaskSchema, taskId, { dueDate: dueDate ?? undefined })
      }
      onAssigneesChange={
        docEditable
          ? handleDocAssigneesChange
          : hostOwned
            ? undefined
            : (taskId, assignees) =>
                void update(TaskSchema, taskId, {
                  assignees: assignees as DID[],
                  // Legacy single-assignee mirror, kept for older surfaces/filters.
                  assignee: (assignees[0] as DID | undefined) ?? undefined
                })
      }
      onOpenSource={sourceLabel ? handleOpenSource : undefined}
      footerExtra={
        <button
          type="button"
          aria-label={pinned ? 'Unpin task' : 'Pin task'}
          data-testid="task-pin-toggle"
          onClick={() => togglePinnedNode(task.id)}
          className={`flex items-center gap-1 rounded-sm text-xs transition-colors ${
            pinned ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1'
          }`}
        >
          <Pin size={11} className={pinned ? 'fill-current' : ''} />
          {pinned ? 'Pinned' : 'Pin'}
        </button>
      }
    />
  )
}
