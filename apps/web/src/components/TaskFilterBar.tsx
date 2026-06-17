/**
 * TaskFilterBar - Linear-style filter chips + "Filter" menu (F).
 *
 * Renders active filter values as removable chips and a popover to add
 * more. Pure presentation over a TaskFilter; value labels/icons come from
 * the host's option lists.
 */
import { ListFilter, X } from 'lucide-react'
import { useState, type JSX, type ReactNode } from 'react'
import {
  TASK_FILTER_FIELDS,
  addFilterValue,
  isTaskFilterActive,
  removeFilterValue,
  type TaskFilter,
  type TaskFilterField
} from './task-filter'

export interface FilterValueOption {
  id: string
  label: string
  icon?: ReactNode
}

export interface TaskFilterBarProps {
  filter: TaskFilter
  onChange: (filter: TaskFilter) => void
  options: Record<TaskFilterField, FilterValueOption[]>
  /** Open the add-filter menu (wired to the `f` shortcut) */
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
}

const FIELD_LABEL: Record<TaskFilterField, string> = {
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  label: 'Label'
}

export function TaskFilterBar({
  filter,
  onChange,
  options,
  menuOpen,
  onMenuOpenChange
}: TaskFilterBarProps): JSX.Element {
  const [field, setField] = useState<TaskFilterField | null>(null)
  const active = isTaskFilterActive(filter)

  const labelFor = (f: TaskFilterField, id: string): string =>
    options[f].find((option) => option.id === id)?.label ?? id

  const close = () => {
    onMenuOpenChange(false)
    setField(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <button
          type="button"
          aria-label="Add filter"
          title="Filter (F)"
          aria-expanded={menuOpen}
          onClick={() => onMenuOpenChange(!menuOpen)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
            menuOpen
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          <ListFilter size={13} />
          Filter
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
            <div
              data-testid="task-filter-menu"
              className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-popover p-1 shadow-2xl"
            >
              {field === null ? (
                TASK_FILTER_FIELDS.map((f) => (
                  <MenuButton key={f} onClick={() => setField(f)}>
                    {FIELD_LABEL[f]}
                  </MenuButton>
                ))
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setField(null)}
                    className="mb-1 px-2 py-1 text-[11px] uppercase tracking-wide text-foreground-muted hover:text-foreground"
                  >
                    ← {FIELD_LABEL[field]}
                  </button>
                  <div className="max-h-60 overflow-y-auto">
                    {options[field].length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No options</div>
                    )}
                    {options[field].map((option) => {
                      const checked = filter[field].includes(option.id)
                      return (
                        <MenuButton
                          key={option.id}
                          onClick={() =>
                            onChange(
                              checked
                                ? removeFilterValue(filter, field, option.id)
                                : addFilterValue(filter, field, option.id)
                            )
                          }
                        >
                          {option.icon}
                          <span className="flex-1 truncate">{option.label}</span>
                          {checked && <span className="text-foreground-muted">✓</span>}
                        </MenuButton>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {TASK_FILTER_FIELDS.flatMap((f) =>
        filter[f].map((value) => (
          <span
            key={`${f}:${value}`}
            className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
          >
            <span className="text-foreground-muted">{FIELD_LABEL[f]}:</span>
            {labelFor(f, value)}
            <button
              type="button"
              aria-label={`Remove ${FIELD_LABEL[f]} ${labelFor(f, value)} filter`}
              onClick={() => onChange(removeFilterValue(filter, f, value))}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={10} />
            </button>
          </span>
        ))
      )}

      {active && (
        <button
          type="button"
          onClick={() => onChange({ status: [], priority: [], assignee: [], label: [] })}
          className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function MenuButton({
  children,
  onClick
}: {
  children: ReactNode
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"
    >
      {children}
    </button>
  )
}
