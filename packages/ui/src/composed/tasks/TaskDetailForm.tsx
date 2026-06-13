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
import { CalendarDays, ExternalLink, Hash, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { DIDAvatar } from '../../components/DIDAvatar'
import { useClickOutside } from '../../hooks/useClickOutside'
import { cn } from '../../utils'
import { dueDateInputValue, isoToDueDateMs, utcDayFromNow } from './due-date'
import { MentionTextInput } from './MentionTextInput'
import { filterTaskPeople, taskPersonLabel, type TaskPersonOption } from './people'
import { TaskPriorityIcon, TaskStatusIcon } from './TaskStatusIcon'
import { TASK_STATUS_META, formatDueDate, isCompletedStatus, type TaskDisplayData } from './types'

/** A workspace tag as the form renders it (0169). */
export interface TaskTagOption {
  id: string
  name: string
}

export interface TaskDetailFormProps {
  task: TaskDisplayData
  /** Candidates for assignment (assignee picker + @mention) */
  people?: TaskPersonOption[]
  /** Tags currently on the task (resolved id → name by the host) */
  tags?: TaskTagOption[]
  /** Workspace tags offered by the picker */
  tagOptions?: TaskTagOption[]
  /** Tags are node-owned: always editable when the host passes this */
  onTagsChange?: (taskId: string, tagIds: string[]) => void
  /** Create a tag for an unknown name; resolve its id (null aborts) */
  onCreateTag?: (name: string) => Promise<string | null>
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
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

interface PickerControl {
  open: boolean
  onToggle: () => void
  onClose: () => void
}

function StatusChip({
  task,
  control,
  onPick
}: {
  task: TaskDisplayData
  control: PickerControl
  onPick: (status: string, completed: boolean) => void
}) {
  const current = task.status ?? 'todo'
  const meta = TASK_STATUS_META[current as keyof typeof TASK_STATUS_META]

  return (
    <PickerChip
      testId="task-status-chip"
      label={meta?.name ?? 'To Do'}
      icon={<TaskStatusIcon status={task.status} size={12} />}
      {...control}
    >
      {WORKFLOW_IDS.map((status) => (
        <PickerOption
          key={status}
          selected={status === current}
          onSelect={() => onPick(status, isCompletedStatus(status))}
        >
          <TaskStatusIcon status={status} size={13} />
          {TASK_STATUS_META[status].name}
        </PickerOption>
      ))}
    </PickerChip>
  )
}

function PriorityChip({
  task,
  control,
  onPick
}: {
  task: TaskDisplayData
  control: PickerControl
  onPick: (priority: string) => void
}) {
  const current = task.priority ?? 'medium'

  return (
    <PickerChip
      testId="task-priority-chip"
      label={capitalize(current)}
      icon={<TaskPriorityIcon priority={task.priority} size={12} />}
      {...control}
    >
      {PRIORITY_IDS.map((priority) => (
        <PickerOption
          key={priority}
          selected={priority === current}
          onSelect={() => onPick(priority)}
        >
          <TaskPriorityIcon priority={priority} size={13} />
          {capitalize(priority)}
        </PickerOption>
      ))}
    </PickerChip>
  )
}

function QuickDueButton({ label, onPick }: { label: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex-1 rounded-sm border border-border px-1.5 py-1 text-xs text-foreground hover:bg-background-subtle"
    >
      {label}
    </button>
  )
}

function DueDateMenu({
  dueDate,
  onPick
}: {
  dueDate: number | null | undefined
  onPick: (dueDate: number | null) => void
}) {
  return (
    <div className="flex flex-col gap-1 p-1">
      <div className="flex gap-1">
        <QuickDueButton label="Today" onPick={() => onPick(utcDayFromNow(0))} />
        <QuickDueButton label="Tomorrow" onPick={() => onPick(utcDayFromNow(1))} />
        <QuickDueButton label="Next week" onPick={() => onPick(utcDayFromNow(7))} />
      </div>
      <input
        type="date"
        data-testid="task-due-input"
        value={dueDateInputValue(dueDate)}
        onChange={(event) => {
          const parsed = isoToDueDateMs(event.target.value)
          if (parsed != null) onPick(parsed)
        }}
        className="w-full rounded-sm border border-border bg-transparent px-1.5 py-1 text-xs text-foreground outline-none"
      />
      {dueDate != null && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="rounded-sm px-1.5 py-1 text-left text-xs text-foreground-muted hover:bg-background-subtle hover:text-foreground"
        >
          Clear due date
        </button>
      )}
    </div>
  )
}

/** Editable due-date picker, a static chip for locked tasks, or nothing. */
function DueSection({
  task,
  control,
  onPick
}: {
  task: TaskDisplayData
  control: PickerControl
  onPick?: ((dueDate: number | null) => void) | undefined
}) {
  const due = formatDueDate(task.dueDate)

  if (!onPick) {
    if (due.urgency === 'none') return null
    return (
      <span className="flex h-6 items-center gap-1.5 rounded-md border border-border px-1.5 text-xs text-foreground-muted">
        <CalendarDays size={12} />
        {due.label}
      </span>
    )
  }

  return (
    <PickerChip
      testId="task-due-chip"
      label={due.urgency === 'none' ? 'Due date' : due.label}
      icon={<CalendarDays size={12} />}
      {...control}
    >
      <DueDateMenu dueDate={task.dueDate} onPick={onPick} />
    </PickerChip>
  )
}

function PersonOptionRow({
  person,
  onSelect
}: {
  person: TaskPersonOption
  onSelect: (did: string) => void
}) {
  return (
    <PickerOption selected={false} onSelect={() => onSelect(person.did)}>
      <DIDAvatar did={person.did} size={18} />
      <span className="min-w-0 flex-1 truncate">
        {taskPersonLabel(person)}
        {person.isSelf && <span className="text-foreground-muted"> (you)</span>}
      </span>
    </PickerOption>
  )
}

function AssignChip({
  candidates,
  assignedCount,
  control,
  query,
  onQueryChange,
  onAdd
}: {
  candidates: TaskPersonOption[]
  assignedCount: number
  control: PickerControl
  query: string
  onQueryChange: (query: string) => void
  onAdd: (did: string) => void
}) {
  return (
    <PickerChip
      testId="task-assign-chip"
      label={assignedCount === 0 ? 'Assign' : `${assignedCount} assigned`}
      icon={<UserPlus size={12} />}
      {...control}
    >
      <input
        type="text"
        value={query}
        autoFocus
        placeholder="Find people…"
        onChange={(event) => onQueryChange(event.target.value)}
        className="mb-1 w-full rounded-sm border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none placeholder:text-foreground-muted"
      />
      {candidates.length === 0 ? (
        <p className="m-0 px-2 py-1.5 text-xs text-foreground-muted">No matching people</p>
      ) : (
        candidates.map((person) => (
          <PersonOptionRow key={person.did} person={person} onSelect={onAdd} />
        ))
      )}
    </PickerChip>
  )
}

function AssigneeChips({
  assignees,
  people,
  onRemove
}: {
  assignees: string[]
  people: TaskPersonOption[]
  onRemove?: ((did: string) => void) | undefined
}) {
  if (assignees.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {assignees.map((did) => {
        const person = people.find((candidate) => candidate.did === did) ?? { did }
        return (
          <span
            key={did}
            data-testid="task-assignee-chip"
            className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-1.5 text-xs text-foreground"
          >
            <DIDAvatar did={did} size={16} />
            {taskPersonLabel(person)}
            {onRemove && (
              <button
                type="button"
                aria-label={`Remove assignee ${taskPersonLabel(person)}`}
                onClick={() => onRemove(did)}
                className="rounded-full text-foreground-muted transition-colors hover:text-foreground"
              >
                <X size={11} />
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

function filterTagOptions(options: TaskTagOption[], query: string): TaskTagOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return options.slice(0, 8)
  return options.filter((option) => option.name.toLowerCase().includes(needle)).slice(0, 8)
}

function TagChipPicker({
  options,
  selectedCount,
  control,
  query,
  onQueryChange,
  onAdd,
  onCreate
}: {
  options: TaskTagOption[]
  selectedCount: number
  control: PickerControl
  query: string
  onQueryChange: (query: string) => void
  onAdd: (tagId: string) => void
  onCreate?: ((name: string) => void) | undefined
}) {
  const trimmed = query.trim().toLowerCase()
  const exact = options.some((option) => option.name === trimmed)
  return (
    <PickerChip
      testId="task-tags-chip"
      label={selectedCount === 0 ? 'Tags' : `${selectedCount} tagged`}
      icon={<Hash size={12} />}
      {...control}
    >
      <input
        type="text"
        value={query}
        autoFocus
        placeholder="Find or create tags…"
        onChange={(event) => onQueryChange(event.target.value)}
        className="mb-1 w-full rounded-sm border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none placeholder:text-foreground-muted"
      />
      {filterTagOptions(options, query).map((option) => (
        <PickerOption key={option.id} selected={false} onSelect={() => onAdd(option.id)}>
          <Hash size={13} className="text-foreground-muted" />
          {option.name}
        </PickerOption>
      ))}
      {onCreate && trimmed && !exact && (
        <PickerOption selected={false} onSelect={() => onCreate(trimmed)}>
          <Hash size={13} className="text-foreground-muted" />
          Create “{trimmed}”
        </PickerOption>
      )}
    </PickerChip>
  )
}

function TagChips({
  tags,
  onRemove
}: {
  tags: TaskTagOption[]
  onRemove: (tagId: string) => void
}) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag.id}
          data-testid="task-tag-chip"
          className="flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-xs text-foreground"
        >
          <Hash size={10} className="text-foreground-muted" />
          {tag.name}
          <button
            type="button"
            aria-label={`Remove tag ${tag.name}`}
            onClick={() => onRemove(tag.id)}
            className="rounded-full text-foreground-muted transition-colors hover:text-foreground"
          >
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  )
}

function FormFooter({
  taskId,
  sourceLabel,
  onOpenSource,
  footerExtra
}: {
  taskId: string
  sourceLabel?: string | null | undefined
  onOpenSource?: ((taskId: string) => void) | undefined
  footerExtra?: ReactNode
}) {
  if (!sourceLabel && !footerExtra) return null
  return (
    <div className="flex items-center gap-2 border-t border-border pt-2">
      {sourceLabel && onOpenSource && (
        <button
          type="button"
          data-testid="task-open-source"
          onClick={() => onOpenSource(taskId)}
          className="flex items-center gap-1 rounded-sm text-xs text-foreground-muted transition-colors hover:text-foreground"
        >
          <ExternalLink size={11} />
          {sourceLabel}
        </button>
      )}
      <span className="ml-auto flex items-center gap-1">{footerExtra}</span>
    </div>
  )
}

function TitleRow({
  task,
  titleReadOnly,
  title,
  onTitleChange,
  mentionPeople,
  onMention,
  onCommit,
  onRevert,
  onClose,
  autoFocusTitle,
  titleRef
}: {
  task: TaskDisplayData
  titleReadOnly: boolean
  title: string
  onTitleChange: (title: string) => void
  mentionPeople: TaskPersonOption[]
  onMention: (did: string) => void
  onCommit: () => void
  onRevert: () => void
  onClose?: (() => void) | undefined
  autoFocusTitle: boolean
  titleRef: RefObject<HTMLInputElement>
}) {
  return (
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
          onChange={onTitleChange}
          people={mentionPeople}
          onMention={onMention}
          onSubmit={() => {
            onCommit()
            onClose?.()
          }}
          onCancel={() => {
            onRevert()
            onClose?.()
          }}
          onBlur={onCommit}
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
  )
}

type OpenPicker = 'status' | 'priority' | 'due' | 'assign' | 'tags' | null

export function TaskDetailForm({
  task,
  people = [],
  tags = [],
  tagOptions = [],
  onTagsChange,
  onCreateTag,
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
  const [tagQuery, setTagQuery] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  // Adopt remote title edits unless the local draft is mid-edit.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(task.title)
  }, [task.title])

  const assignees = task.assignees ?? []

  const commitTitle = () => {
    const next = title.trim()
    if (next && next !== task.title) onTitleChange?.(task.id, next)
    else setTitle(task.title)
  }

  const pickerControl = (picker: Exclude<OpenPicker, null>): PickerControl => ({
    open: openPicker === picker,
    onToggle: () => {
      setAssignQuery('')
      setOpenPicker((current) => (current === picker ? null : picker))
    },
    onClose: () => setOpenPicker(null)
  })

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

  const unassignedPeople = people.filter((person) => !assignees.includes(person.did))

  const tagIds = tags.map((tag) => tag.id)
  const addTag = (tagId: string) => {
    setTagQuery('')
    if (!tagIds.includes(tagId)) onTagsChange?.(task.id, [...tagIds, tagId])
  }
  const removeTag = (tagId: string) => {
    onTagsChange?.(
      task.id,
      tagIds.filter((existing) => existing !== tagId)
    )
  }
  const createAndAddTag = (name: string) => {
    setTagQuery('')
    void onCreateTag?.(name).then((tagId) => {
      if (tagId) addTag(tagId)
    })
  }

  return (
    <div
      data-testid="task-detail-form"
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border bg-background p-2',
        className
      )}
    >
      <TitleRow
        task={task}
        titleReadOnly={titleReadOnly}
        title={title}
        onTitleChange={setTitle}
        mentionPeople={unassignedPeople}
        onMention={addAssignee}
        onCommit={commitTitle}
        onRevert={() => setTitle(task.title)}
        onClose={onClose}
        autoFocusTitle={autoFocusTitle}
        titleRef={titleRef}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip
          task={task}
          control={pickerControl('status')}
          onPick={(status, completed) => {
            onStatusChange?.(task.id, status, completed)
            setOpenPicker(null)
          }}
        />
        <PriorityChip
          task={task}
          control={pickerControl('priority')}
          onPick={(priority) => {
            onPriorityChange?.(task.id, priority)
            setOpenPicker(null)
          }}
        />
        <DueSection
          task={task}
          control={pickerControl('due')}
          onPick={onDueDateChange ? setDueDate : undefined}
        />
        {onAssigneesChange && (
          <AssignChip
            candidates={filterTaskPeople(unassignedPeople, assignQuery)}
            assignedCount={assignees.length}
            control={pickerControl('assign')}
            query={assignQuery}
            onQueryChange={setAssignQuery}
            onAdd={addAssignee}
          />
        )}
        {onTagsChange && (
          <TagChipPicker
            options={tagOptions.filter((option) => !tagIds.includes(option.id))}
            selectedCount={tags.length}
            control={pickerControl('tags')}
            query={tagQuery}
            onQueryChange={setTagQuery}
            onAdd={addTag}
            onCreate={onCreateTag ? createAndAddTag : undefined}
          />
        )}
      </div>

      {metaNotice && <p className="m-0 text-[11px] text-foreground-muted">{metaNotice}</p>}

      <AssigneeChips
        assignees={assignees}
        people={people}
        onRemove={onAssigneesChange ? removeAssignee : undefined}
      />

      {onTagsChange && <TagChips tags={tags} onRemove={removeTag} />}

      <FormFooter
        taskId={task.id}
        sourceLabel={sourceLabel}
        onOpenSource={onOpenSource}
        footerExtra={footerExtra}
      />
    </div>
  )
}
