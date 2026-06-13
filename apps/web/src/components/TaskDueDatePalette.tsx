/**
 * TaskDueDatePalette - keyboard-first due-date entry for a focused task.
 *
 * Opened by the `d` verb on the Tasks surface. Typing a natural-language date
 * ("next friday", "in 3 days", "2026-07-01") surfaces a live "Set due …" row;
 * Enter commits the highlighted option. Presets and a clear action round out
 * the list. Mirrors TaskMiniPalette so the registry's single-key verbs stay
 * suppressed while its input is focused.
 */
import { parseDueDate, utcDayFromNow } from '@xnetjs/ui'
import { useMemo, useRef, useState, type JSX } from 'react'

export interface TaskDueDatePaletteProps {
  /** Commit a due date (UTC-midnight ms) or null to clear. */
  onSelect: (dueDate: number | null) => void
  onClose: () => void
}

interface DueOption {
  id: string
  label: string
  ms: number | null
}

function formatDue(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

export function TaskDueDatePalette({ onSelect, onClose }: TaskDueDatePaletteProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const options = useMemo<DueOption[]>(() => {
    const trimmed = query.trim()
    const parsed = trimmed ? parseDueDate(trimmed) : null
    const presets: DueOption[] = [
      { id: 'today', label: 'Today', ms: utcDayFromNow(0) },
      { id: 'tomorrow', label: 'Tomorrow', ms: utcDayFromNow(1) },
      {
        id: 'weekend',
        label: 'This weekend',
        ms: parseDueDate('this weekend')?.ms ?? utcDayFromNow(0)
      },
      { id: 'nextweek', label: 'Next week', ms: utcDayFromNow(7) },
      { id: 'clear', label: 'Clear due date', ms: null }
    ]
    const filtered = trimmed
      ? presets.filter((option) => option.label.toLowerCase().includes(trimmed.toLowerCase()))
      : presets
    return parsed
      ? [{ id: 'parsed', label: `Set due ${formatDue(parsed.ms)}`, ms: parsed.ms }, ...filtered]
      : filtered
  }, [query])

  const commit = (option: DueOption | undefined) => {
    if (!option) return
    onSelect(option.ms)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32"
      onClick={onClose}
      data-testid="task-due-palette"
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={query}
          placeholder="Set due date… (e.g. next friday)"
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((index) => Math.min(index + 1, options.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => Math.max(index - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              commit(options[activeIndex])
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }
          }}
          className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <ul className="max-h-60 list-none overflow-y-auto p-1">
          {options.map((option, index) => (
            <li
              key={option.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground ${
                index === activeIndex ? 'bg-secondary' : 'hover:bg-secondary'
              }`}
              onClick={() => commit(option)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {option.label}
            </li>
          ))}
          {options.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
          )}
        </ul>
      </div>
    </div>
  )
}
