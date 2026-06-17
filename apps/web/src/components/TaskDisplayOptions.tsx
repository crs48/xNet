/**
 * TaskDisplayOptions - Linear-style "Display" popover (Shift+V).
 *
 * Controls grouping, ordering, density, and whether completed tasks show.
 * Pure presentation: it owns no task state, only emits option changes.
 */
import type { TaskRowDensity } from '@xnetjs/ui'
import type { TaskGroupBy, TaskOrderBy } from '@xnetjs/views'
import { Check, SlidersHorizontal } from 'lucide-react'
import { type JSX } from 'react'

export interface TaskDisplaySettings {
  groupBy: TaskGroupBy
  orderBy: TaskOrderBy
  density: TaskRowDensity
  showCompleted: boolean
}

export interface TaskDisplayOptionsProps {
  settings: TaskDisplaySettings
  onChange: (patch: Partial<TaskDisplaySettings>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

const GROUP_OPTIONS: Array<{ id: TaskGroupBy; label: string }> = [
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'none', label: 'No grouping' }
]

const ORDER_OPTIONS: Array<{ id: TaskOrderBy; label: string }> = [
  { id: 'manual', label: 'Manual' },
  { id: 'priority', label: 'Priority' },
  { id: 'due', label: 'Due date' },
  { id: 'title', label: 'Title' },
  { id: 'updated', label: 'Updated' },
  { id: 'created', label: 'Created' }
]

const DENSITY_OPTIONS: Array<{ id: TaskRowDensity; label: string }> = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' }
]

export function TaskDisplayOptions({
  settings,
  onChange,
  open,
  onOpenChange
}: TaskDisplayOptionsProps): JSX.Element {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Display options"
        aria-expanded={open}
        title="Display options (Shift+V)"
        onClick={() => onOpenChange(!open)}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
          open
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <SlidersHorizontal size={13} />
        Display
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} aria-hidden />
          <div
            data-testid="task-display-options"
            className="absolute right-0 top-full z-50 mt-1 w-60 rounded-lg border border-border bg-popover p-2 shadow-2xl"
          >
            <OptionRow label="Grouping">
              <Segmented
                options={GROUP_OPTIONS}
                value={settings.groupBy}
                onSelect={(groupBy) => onChange({ groupBy })}
              />
            </OptionRow>
            <OptionRow label="Ordering">
              <Segmented
                options={ORDER_OPTIONS}
                value={settings.orderBy}
                onSelect={(orderBy) => onChange({ orderBy })}
              />
            </OptionRow>
            <OptionRow label="Density">
              <Segmented
                options={DENSITY_OPTIONS}
                value={settings.density}
                onSelect={(density) => onChange({ density })}
              />
            </OptionRow>
            <button
              type="button"
              onClick={() => onChange({ showCompleted: !settings.showCompleted })}
              className="mt-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-accent"
            >
              Show completed
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border ${
                  settings.showCompleted
                    ? 'border-ring bg-ring text-background'
                    : 'border-border text-transparent'
                }`}
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function OptionRow({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <div className="px-1 py-1">
      <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-foreground-muted">
        {label}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onSelect
}: {
  options: Array<{ id: T; label: string }>
  value: T
  onSelect: (id: T) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
            value === option.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-background-muted text-foreground-muted hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
