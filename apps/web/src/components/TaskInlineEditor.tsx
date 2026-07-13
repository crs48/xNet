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
 * document, so those fields are read-only here and the form links to the
 * host (the live-editor write-through path was retired with the BlockNote
 * migration, 0312). Status, priority, and pins are node-owned and always
 * editable; unhosted tasks edit everything on the node.
 */
import type { JSX } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  MilestoneSchema,
  TaskSchema,
  isCompletedTaskStatus,
  type DID,
  type TaskStatusId
} from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { TaskDetailForm, type TaskTagOption } from '@xnetjs/ui'
import { Flag, Pin } from 'lucide-react'
import { useMemo } from 'react'
import { useWorkspacePeople } from '../hooks/useWorkspacePeople'
import { useWorkspaceTags } from '../hooks/useWorkspaceTags'
import { useWorkbench } from '../workbench/state'
import { taskHostInfo, toTaskDisplayData, type TaskHostInfo, type TaskNode } from './task-node-projection'

export type { TaskNode }

const HOST_OWNED_NOTICE =
  'Title, due date & assignees live in the hosting document — open it to edit them.'

/** Doc-owned fields: locked while a document hosts the task (the next
 * snapshot would overwrite node-side writes); node-owned otherwise. */
function pickMetaHandler<T>(host: TaskHostInfo, nodeHandler: T): T | undefined {
  return host.hostOwned ? undefined : nodeHandler
}

/**
 * Milestone picker (exploration 0190) — Milestones previously had no UI at all,
 * even though Task.milestone existed in the schema. Lists milestones scoped to
 * the task's project (or all, when the task has no project) and writes the
 * single milestone the task targets.
 */
function MilestonePicker({
  task,
  onChange
}: {
  task: TaskNode
  onChange: (milestoneId: string) => void
}): JSX.Element | null {
  const projectId = typeof task.project === 'string' ? task.project : ''
  const { data } = useQuery(MilestoneSchema, { limit: 200 })
  const milestones = useMemo(() => {
    const all = (data ?? []) as Array<{ id: string; name?: string; project?: string }>
    const scoped = projectId ? all.filter((m) => m.project === projectId) : all
    return scoped.map((m) => ({ id: m.id, name: m.name?.trim() || 'Untitled milestone' }))
  }, [data, projectId])
  const current = typeof task.milestone === 'string' ? task.milestone : ''

  // Nothing to pick and nothing set → don't clutter the footer.
  if (milestones.length === 0 && !current) return null

  return (
    <label className="flex items-center gap-1 text-xs text-ink-3">
      <Flag size={11} strokeWidth={1.5} />
      <select
        aria-label="Milestone"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[140px] truncate rounded-sm border border-hairline bg-transparent px-1 py-0.5 text-xs text-ink-2 outline-none focus:border-ink-3"
      >
        <option value="">No milestone</option>
        {/* Keep a stale selection visible even if it falls outside the scope. */}
        {current && !milestones.some((m) => m.id === current) && (
          <option value={current}>Current milestone</option>
        )}
        {milestones.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  )
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
  onClose?: () => void
  autoFocusTitle?: boolean
  className?: string
}

export function TaskInlineEditor({
  task,
  onClose,
  autoFocusTitle,
  className
}: TaskInlineEditorProps): JSX.Element {
  const navigate = useNavigate()
  const { update } = useMutate()
  const people = useWorkspacePeople()
  const { allTags, suggestions: tagOptions, getOrCreateTag } = useWorkspaceTags()

  const display = useMemo(() => toTaskDisplayData(task), [task])

  // Tags are node-owned (like status/priority): always editable.
  const selectedTags = useMemo<TaskTagOption[]>(() => {
    const ids = Array.isArray(task.tags) ? task.tags.map(String) : []
    return ids.map((id) => ({ id, name: allTags.find((tag) => tag.id === id)?.name ?? id }))
  }, [task.tags, allTags])
  const host = taskHostInfo(task)

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

  return (
    <TaskDetailForm
      task={display}
      people={people}
      sourceLabel={host.sourceLabel}
      className={className}
      autoFocusTitle={autoFocusTitle}
      onClose={onClose}
      titleReadOnly={host.hostOwned}
      metaNotice={host.hostOwned ? HOST_OWNED_NOTICE : undefined}
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
      onDueDateChange={pickMetaHandler(host, updateNodeDueDate)}
      onAssigneesChange={pickMetaHandler(host, updateNodeAssignees)}
      tags={selectedTags}
      tagOptions={tagOptions}
      onTagsChange={(taskId, tagIds) => void update(TaskSchema, taskId, { tags: tagIds })}
      onCreateTag={async (name) => (await getOrCreateTag(name))?.id ?? null}
      onOpenSource={host.sourceLabel ? handleOpenSource : undefined}
      footerExtra={
        <div className="flex items-center gap-3">
          <MilestonePicker
            task={task}
            onChange={(milestoneId) =>
              void update(TaskSchema, task.id, { milestone: milestoneId || undefined })
            }
          />
          <PinToggle taskId={task.id} />
        </div>
      }
    />
  )
}
