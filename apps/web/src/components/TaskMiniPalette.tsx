/**
 * TaskMiniPalette - Linear-style in-place picker for a focused task.
 *
 * Opened by single-key verbs (s = status, p = priority). The filter input
 * keeps keyboard flow: typing narrows options, Enter commits, Escape
 * closes — and because it is a real input, the CommandRegistry's
 * single-key verbs are automatically suppressed while it is open.
 */
import { TaskStatusIcon, TaskPriorityIcon } from '@xnetjs/ui'
import { useMemo, useRef, useState, type JSX, type ReactNode } from 'react'

export interface MiniPaletteOption {
  id: string
  label: string
  /** Optional leading glyph (people/label palettes supply their own) */
  icon?: ReactNode
}

export interface TaskMiniPaletteProps {
  title: string
  /** Status/priority render the workflow glyphs; others rely on option.icon */
  kind?: 'status' | 'priority' | 'generic'
  options: MiniPaletteOption[]
  onSelect: (optionId: string) => void
  onClose: () => void
}

export function TaskMiniPalette({
  title,
  kind,
  options,
  onSelect,
  onClose
}: TaskMiniPaletteProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) => option.label.toLowerCase().includes(needle))
  }, [options, query])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32"
      onClick={onClose}
      data-testid="task-mini-palette"
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
          placeholder={title}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => Math.max(index - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const option = filtered[activeIndex]
              if (option) {
                onSelect(option.id)
                onClose()
              }
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }
          }}
          className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <ul className="max-h-60 list-none overflow-y-auto p-1">
          {filtered.map((option, index) => (
            <li
              key={option.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground ${
                index === activeIndex ? 'bg-secondary' : 'hover:bg-secondary'
              }`}
              onClick={() => {
                onSelect(option.id)
                onClose()
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {option.icon !== undefined ? (
                option.icon
              ) : kind === 'status' ? (
                <TaskStatusIcon status={option.id} size={13} />
              ) : kind === 'priority' ? (
                <TaskPriorityIcon priority={option.id} size={13} />
              ) : null}
              {option.label}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
          )}
        </ul>
      </div>
    </div>
  )
}
