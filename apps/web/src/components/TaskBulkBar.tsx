/**
 * TaskBulkBar - Linear-style floating bulk-action bar.
 *
 * Appears at the bottom of the Tasks surface while a multi-selection is
 * active. Each action applies to every selected task in one optimistic
 * batch (status/priority via the shared mini-palette, assign-to-me and
 * delete directly). Escape / Clear empties the selection.
 */
import { CircleDot, Flag, Trash2, UserPlus, X } from 'lucide-react'
import type { JSX } from 'react'

export interface TaskBulkBarProps {
  count: number
  onStatus: () => void
  onPriority: () => void
  onAssignMe: () => void
  onDelete: () => void
  onClear: () => void
}

export function TaskBulkBar({
  count,
  onStatus,
  onPriority,
  onAssignMe,
  onDelete,
  onClear
}: TaskBulkBarProps): JSX.Element {
  return (
    <div
      data-testid="task-bulk-bar"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-popover px-2 py-1.5 shadow-2xl">
        <span className="px-1.5 text-xs font-medium tabular-nums text-foreground">
          {count} selected
        </span>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <BulkButton icon={<CircleDot size={13} />} label="Status" onClick={onStatus} />
        <BulkButton icon={<Flag size={13} />} label="Priority" onClick={onPriority} />
        <BulkButton icon={<UserPlus size={13} />} label="Assign me" onClick={onAssignMe} />
        <BulkButton
          icon={<Trash2 size={13} />}
          label="Delete"
          onClick={onDelete}
          tone="destructive"
        />
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <button
          type="button"
          aria-label="Clear selection"
          onClick={onClear}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

function BulkButton({
  icon,
  label,
  onClick,
  tone = 'default'
}: {
  icon: JSX.Element
  label: string
  onClick: () => void
  tone?: 'default' | 'destructive'
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
        tone === 'destructive'
          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'text-foreground hover:bg-accent'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
