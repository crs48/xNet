/**
 * TaskDetailForm - inline editor for one canonical Task node.
 *
 * Presentational like the other composed/tasks components: it renders the
 * task's current state and emits field-level intents; hosts bind those to
 * their mutation layer. Used as the row-expansion editor on the Tasks
 * surface, the board peek, and the page right-panel checklist.
 *
 * Title editing supports @mention-to-assign (same affordance as page
 * checklists); due date and assignees edit through small popovers.
 */
import { CalendarDays, ExternalLink, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DIDAvatar } from '../../components/DIDAvatar'
import { useClickOutside } from '../../hooks/useClickOutside'
import { cn } from '../../utils'
import { MentionTextInput } from './MentionTextInput'
import { filterTaskPeople, taskPersonLabel, type TaskPersonOption } from './people'
import { TaskPriorityIcon, TaskStatusIcon } from './TaskStatusIcon'
import { TASK_STATUS_META, formatDueDate, isCompletedStatus, type TaskDisplayData } from './types'

export interface TaskDetailFormProps {
  task: TaskDisplayData
  /** Candidates for assignment (assignee picker + @mention) */
  people?: TaskPersonOption[]
  /** Label for the host-surface link; absent hides the affordance */
  sourceLabel?: string | null
  onTitleChange?: (taskId: string, title: string) => void
  /** Status changes carry the derived `completed` so hosts stay one-call */
  onStatusChange?: (taskId: string, status: string, completed: boolean) => void
  onPriorityChange?: (taskId: string, priority: string) => void
  /** UTC ms at midnight, or null to clear */
  onDueDateChange?: (taskId: string, dueDate: number | null) => void
  onAssigneesChange?: (taskId: string, assignees: string[]) => void
  onOpenSource?: (taskId: string) => void
  onClose?: () => void
  /** Extra host affordances rendered in the footer (e.g. pin toggle) */
  footerExtra?: ReactNode
  /**
   * Render the title as static text. Hosted checklist tasks own their
   * title in the host document, so panels must not edit it on the node.
   */
  titleReadOnly?: boolean
  /** Short notice under the pickers (e.g. where host-owned fields live) */
  metaNotice?: ReactNode
  autoFocusTitle?: boolean
  className?: string
}

const PRIORITY_IDS = ['low', 'medium', 'high', 'urgent'] as const
const WORKFLOW_IDS = Object.keys(TASK_STATUS_META) as Array<keyof typeof TASK_STATUS_META>

const DAY_MS = 86_400_000

/** UTC midnight of the calendar day `offset` days from now. */
function utcDay(offset: number): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offset * DAY_MS
}

function toDateInputValue(dueDate: number | null | undefined): string {
  if (dueDate == null) return ''
  return new Date(dueDate).toISOString().slice(0, 10)
}

function fromDateInputValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed) ? null : parsed
}

/** Chip-style trigger that reveals a popover panel below itself. */
function PickerChip({
  label,
  icon,
  open,
  onToggle,
  onClose,
  children,
  testId
}: {
  label: string
  icon: ReactNode
  open: boolean
  onToggle: () => void
  onClose: () => void
  children: ReactNode
  testId: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useClickOutside(containerRef, onClose, open)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid={testId}
        onClick={onToggle}
        className={cn(
          'flex h-6 items-center gap-1.5 rounded-md border border-border px-1.5 text-xs',
          open ? 'bg-background-subtle text-foreground' : 'text-foreground-muted',
          'transition-colors hover:bg-background-subtle hover:text-foreground'
        )}
      >
        {icon}
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-background p-1 shadow-lg">
          {children}
        </div>
      )}
    </div>
  )
}

function PickerOption({
  selected,
  onSelect,
  children
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground',
        selected ? 'bg-background-subtle' : 'hover:bg-background-subtle'
      )}
    >
      {children}
    </button>
  )
}

type OpenPicker = 'status' | 'priority' | 'due' | 'assign' | null

export function TaskDetailForm({
  task,
  people = [],
  sourceLabel,
  onTitleChange,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneesChange,
  onOpenSource,
  onClose,
  footerExtra,
  titleReadOnly = false,
  metaNotice,
  autoFocusTitle = false,
  className
}: TaskDetailFormProps) {
  const [title, setTitle] = useState(task.title)
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null)
  const [assignQuery, setAssignQuery] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  // Adopt remote title edits unless the local draft is mid-edit.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(task.title)
  }, [task.title])

  const assignees = task.assignees ?? []
  const due = formatDueDate(task.dueDate)
  const statusMeta = TASK_STATUS_META[(task.status ?? 'todo') as keyof typeof TASK_STATUS_META]

  const commitTitle = () => {
    const next = title.trim()
    if (next && next !== task.title) onTitleChange?.(task.id, next)
    else setTitle(task.title)
  }

  const toggle = (picker: Exclude<OpenPicker, null>) => {
    setAssignQuery('')
    setOpenPicker((current) => (current === picker ? null : picker))
  }

  const addAssignee = (did: string) => {
    if (!assignees.includes(did)) onAssigneesChange?.(task.id, [...assignees, did])
  }

  const removeAssignee = (did: string) => {
    onAssigneesChange?.(
      task.id,
      assignees.filter((existing) => existing !== did)
    )
  }

  const setDueDate = (dueDate: number | null) => {
    onDueDateChange?.(task.id, dueDate)
    setOpenPicker(null)
  }

  const assignCandidates = filterTaskPeople(
    people.filter((person) => !assignees.includes(person.did)),
    assignQuery
  )

  return (
    <div
      data-testid="task-detail-form"
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border bg-background p-2',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {task.shortId && (
          <span className="shrink-0 font-mono text-xs text-foreground-muted">{task.shortId}</span>
        )}
        {titleReadOnly ? (
          <span
            data-testid="task-title-static"
            className="min-w-0 flex-1 truncate text-sm text-foreground"
          >
            {task.title || 'Untitled task'}
          </span>
        ) : (
          <MentionTextInput
            value={title}
            onChange={setTitle}
            people={people.filter((person) => !assignees.includes(person.did))}
            onMention={addAssignee}
            onSubmit={() => {
              commitTitle()
              onClose?.()
            }}
            onCancel={() => {
              setTitle(task.title)
              onClose?.()
            }}
            onBlur={commitTitle}
            placeholder="Task title"
            autoFocus={autoFocusTitle}
            inputRef={titleRef}
            data-testid="task-title-input"
          />
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Close editor"
            onClick={onClose}
            className="shrink-0 rounded-sm p-1 text-foreground-muted transition-colors hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <PickerChip
          testId="task-status-chip"
          label={statusMeta?.name ?? task.status ?? 'To Do'}
          icon={<TaskStatusIcon status={task.status} size={12} />}
          open={openPicker === 'status'}
          onToggle={() => toggle('status')}
          onClose={() => setOpenPicker(null)}
        >
          {WORKFLOW_IDS.map((status) => (
            <PickerOption
              key={status}
              selected={status === (task.status ?? 'todo')}
              onSelect={() => {
                onStatusChange?.(task.id, status, isCompletedStatus(status))
                setOpenPicker(null)
              }}
            >
              <TaskStatusIcon status={status} size={13} />
              {TASK_STATUS_META[status].name}
            </PickerOption>
          ))}
        </PickerChip>

        <PickerChip
          testId="task-priority-chip"
          label={
            (task.priority ?? 'medium').charAt(0).toUpperCase() +
            (task.priority ?? 'medium').slice(1)
          }
          icon={<TaskPriorityIcon priority={task.priority} size={12} />}
          open={openPicker === 'priority'}
          onToggle={() => toggle('priority')}
          onClose={() => setOpenPicker(null)}
        >
          {PRIORITY_IDS.map((priority) => (
            <PickerOption
              key={priority}
              selected={priority === (task.priority ?? 'medium')}
              onSelect={() => {
                onPriorityChange?.(task.id, priority)
                setOpenPicker(null)
              }}
            >
              <TaskPriorityIcon priority={priority} size={13} />
              {priority.charAt(0).toUpperCase() + priority.slice(1)}
            </PickerOption>
          ))}
        </PickerChip>

        {!onDueDateChange && due.urgency !== 'none' && (
          <span className="flex h-6 items-center gap-1.5 rounded-md border border-border px-1.5 text-xs text-foreground-muted">
            <CalendarDays size={12} />
            {due.label}
          </span>
        )}
        {onDueDateChange && (
          <PickerChip
            testId="task-due-chip"
            label={due.urgency === 'none' ? 'Due date' : due.label}
            icon={<CalendarDays size={12} />}
            open={openPicker === 'due'}
            onToggle={() => toggle('due')}
            onClose={() => setOpenPicker(null)}
          >
            <div className="flex flex-col gap-1 p-1">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setDueDate(utcDay(0))}
                  className="flex-1 rounded-sm border border-border px-1.5 py-1 text-xs text-foreground hover:bg-background-subtle"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDueDate(utcDay(1))}
                  className="flex-1 rounded-sm border border-border px-1.5 py-1 text-xs text-foreground hover:bg-background-subtle"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => setDueDate(utcDay(7))}
                  className="flex-1 rounded-sm border border-border px-1.5 py-1 text-xs text-foreground hover:bg-background-subtle"
                >
                  Next week
                </button>
              </div>
              <input
                type="date"
                data-testid="task-due-input"
                value={toDateInputValue(task.dueDate)}
                onChange={(event) => {
                  const parsed = fromDateInputValue(event.target.value)
                  if (parsed != null) setDueDate(parsed)
                }}
                className="w-full rounded-sm border border-border bg-transparent px-1.5 py-1 text-xs text-foreground outline-none"
              />
              {task.dueDate != null && (
                <button
                  type="button"
                  onClick={() => setDueDate(null)}
                  className="rounded-sm px-1.5 py-1 text-left text-xs text-foreground-muted hover:bg-background-subtle hover:text-foreground"
                >
                  Clear due date
                </button>
              )}
            </div>
          </PickerChip>
        )}

        {onAssigneesChange && (
          <PickerChip
            testId="task-assign-chip"
            label={assignees.length === 0 ? 'Assign' : `${assignees.length} assigned`}
            icon={<UserPlus size={12} />}
            open={openPicker === 'assign'}
            onToggle={() => toggle('assign')}
            onClose={() => setOpenPicker(null)}
          >
            <input
              type="text"
              value={assignQuery}
              autoFocus
              placeholder="Find people…"
              onChange={(event) => setAssignQuery(event.target.value)}
              className="mb-1 w-full rounded-sm border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none placeholder:text-foreground-muted"
            />
            {assignCandidates.length === 0 ? (
              <p className="m-0 px-2 py-1.5 text-xs text-foreground-muted">No matching people</p>
            ) : (
              assignCandidates.map((person) => (
                <PickerOption
                  key={person.did}
                  selected={false}
                  onSelect={() => addAssignee(person.did)}
                >
                  <DIDAvatar did={person.did} size={18} />
                  <span className="min-w-0 flex-1 truncate">
                    {taskPersonLabel(person)}
                    {person.isSelf && <span className="text-foreground-muted"> (you)</span>}
                  </span>
                </PickerOption>
              ))
            )}
          </PickerChip>
        )}
      </div>

      {metaNotice && <p className="m-0 text-[11px] text-foreground-muted">{metaNotice}</p>}

      {assignees.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {assignees.map((did) => {
            const person = people.find((candidate) => candidate.did === did)
            return (
              <span
                key={did}
                data-testid="task-assignee-chip"
                className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-1.5 text-xs text-foreground"
              >
                <DIDAvatar did={did} size={16} />
                {taskPersonLabel(person ?? { did })}
                {onAssigneesChange && (
                  <button
                    type="button"
                    aria-label={`Remove assignee ${taskPersonLabel(person ?? { did })}`}
                    onClick={() => removeAssignee(did)}
                    className="rounded-full text-foreground-muted transition-colors hover:text-foreground"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {(sourceLabel || footerExtra) && (
        <div className="flex items-center gap-2 border-t border-border pt-2">
          {sourceLabel && onOpenSource && (
            <button
              type="button"
              data-testid="task-open-source"
              onClick={() => onOpenSource(task.id)}
              className="flex items-center gap-1 rounded-sm text-xs text-foreground-muted transition-colors hover:text-foreground"
            >
              <ExternalLink size={11} />
              {sourceLabel}
            </button>
          )}
          <span className="ml-auto flex items-center gap-1">{footerExtra}</span>
        </div>
      )}
    </div>
  )
}
