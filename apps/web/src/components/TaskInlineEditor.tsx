/**
 * TaskInlineEditor - binds the shared TaskDetailForm to this app's
 * mutation layer, people directory, workbench pins, and router.
 *
 * One host for every surface that edits a task in place: the Tasks
 * surface (list expansion + board peek + context panel), the page
 * right-panel checklist, and the left-sidebar dashboard.
 *
 * Field authority (docs/specs/PAGE_TASK_RECONCILIATION.md): a hosted
 * checklist task owns its title, assignees, and due date in the host
 * document. When the host page's live editor is available (`hostEditor`),
 * assignee/due-date edits write through to the document's inline metadata
 * (mentions, due chips) and reconcile back to the node; without it those
 * fields are read-only and the form links to the host. Status, priority,
 * and pins are node-owned and always editable.
 */
import type { JSX } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { TaskSchema, isCompletedTaskStatus, type DID, type TaskStatusId } from '@xnetjs/data'
import {
  addTaskAssigneeToDoc,
  removeTaskAssigneeFromDoc,
  setTaskDueDateInDoc,
  type Editor,
  type TaskMentionSuggestion
} from '@xnetjs/editor/react'
import { useMutate } from '@xnetjs/react'
import { TaskDetailForm } from '@xnetjs/ui'
import { Pin } from 'lucide-react'
import { useMemo } from 'react'
import { useWorkspacePeople } from '../hooks/useWorkspacePeople'
import { useWorkbench } from '../workbench/state'
import {
  diffAssignees,
  dueDateMsToIso,
  fallbackMentionLabel,
  taskHostInfo,
  toTaskDisplayData,
  type TaskHostInfo,
  type TaskNode
} from './task-node-projection'

export type { TaskNode }

/** Live editor of the page hosting this task (node → editor direction). */
export interface TaskHostEditor {
  getEditor: () => Editor | null
  /** Presence-derived people for mention metadata (labels, colors) */
  suggestions: TaskMentionSuggestion[]
}

const HOST_OWNED_NOTICE =
  'Title, due date & assignees live in the hosting document — open it to edit them.'

function mentionForDid(suggestions: TaskMentionSuggestion[], did: string): TaskMentionSuggestion {
  return (
    suggestions.find((entry) => entry.id === did) ?? { id: did, label: fallbackMentionLabel(did) }
  )
}

/** Doc-owned fields: write through the live editor, fall back to the
 * node when the task is unhosted, and lock when hosted without one. */
function pickMetaHandler<T>(
  host: TaskHostInfo,
  docEditable: boolean,
  docHandler: T,
  nodeHandler: T
): T | undefined {
  if (docEditable) return docHandler
  return host.hostOwned ? undefined : nodeHandler
}

function PinToggle({ taskId }: { taskId: string }): JSX.Element {
  const pinned = useWorkbench((state) => state.pinnedNodeIds.includes(taskId))
  const togglePinnedNode = useWorkbench((state) => state.togglePinnedNode)
  const idleClass = 'text-ink-3 hover:text-ink-1'

  return (
    <button
      type="button"
      aria-label={pinned ? 'Unpin task' : 'Pin task'}
      data-testid="task-pin-toggle"
      onClick={() => togglePinnedNode(taskId)}
      className={`flex items-center gap-1 rounded-sm text-xs transition-colors ${
        pinned ? 'text-ink-1' : idleClass
      }`}
    >
      <Pin size={11} className={pinned ? 'fill-current' : ''} />
      {pinned ? 'Pinned' : 'Pin'}
    </button>
  )
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

  const display = useMemo(() => toTaskDisplayData(task), [task])
  const host = taskHostInfo(task)
  const docEditable = host.hostOwned && Boolean(hostEditor)

  const handleOpenSource = () => {
    if (host.pageId) {
      void navigate({ to: '/doc/$docId', params: { docId: host.pageId } })
    } else if (host.canvasId) {
      void navigate({ to: '/canvas/$canvasId', params: { canvasId: host.canvasId } })
    }
  }

  const updateNodeTitle = (taskId: string, title: string) =>
    void update(TaskSchema, taskId, { title })

  const updateNodeDueDate = (taskId: string, dueDate: number | null) =>
    // `undefined` is the clear sentinel (matches useTaskProjectionSync).
    void update(TaskSchema, taskId, { dueDate: dueDate ?? undefined })

  const updateNodeAssignees = (taskId: string, assignees: string[]) =>
    void update(TaskSchema, taskId, {
      assignees: assignees as DID[],
      // Legacy single-assignee mirror, kept for older surfaces/filters.
      assignee: (assignees[0] as DID | undefined) ?? undefined
    })

  const applyDocDueDate = (taskId: string, dueDate: number | null) => {
    const editor = hostEditor?.getEditor()
    if (editor) setTaskDueDateInDoc(editor, taskId, dueDateMsToIso(dueDate))
  }

  const applyDocAssignees = (taskId: string, assignees: string[]) => {
    const editor = hostEditor?.getEditor()
    if (!editor) return
    const suggestions = hostEditor?.suggestions ?? []
    const { added, removed } = diffAssignees(display.assignees ?? [], assignees)
    for (const did of added) addTaskAssigneeToDoc(editor, taskId, mentionForDid(suggestions, did))
    for (const did of removed) removeTaskAssigneeFromDoc(editor, taskId, did)
  }

  return (
    <TaskDetailForm
      task={display}
      people={people}
      sourceLabel={host.sourceLabel}
      className={className}
      autoFocusTitle={autoFocusTitle}
      onClose={onClose}
      titleReadOnly={host.hostOwned}
      metaNotice={host.hostOwned && !docEditable ? HOST_OWNED_NOTICE : undefined}
      onTitleChange={host.hostOwned ? undefined : updateNodeTitle}
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
      onDueDateChange={pickMetaHandler(host, docEditable, applyDocDueDate, updateNodeDueDate)}
      onAssigneesChange={pickMetaHandler(host, docEditable, applyDocAssignees, updateNodeAssignees)}
      onOpenSource={host.sourceLabel ? handleOpenSource : undefined}
      footerExtra={<PinToggle taskId={task.id} />}
    />
  )
}
