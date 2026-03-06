import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { cn } from '../utils'

export interface TaskMentionSuggestion {
  id: string
  label: string
  subtitle?: string
  color?: string
  avatarUrl?: string
}

interface TaskMentionMenuProps {
  items: TaskMentionSuggestion[]
  command: (item: TaskMentionSuggestion) => void
}

export interface TaskMentionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export const TaskMentionMenu = forwardRef<TaskMentionMenuRef, TaskMentionMenuProps>(
  function TaskMentionMenu({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => {
      setSelectedIndex(0)
    }, [items])

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) {
          command(item)
        }
      },
      [command, items]
    )

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
          return true
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % items.length)
          return true
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          selectItem(selectedIndex)
          return true
        }

        return false
      }
    }))

    if (items.length === 0) {
      return (
        <div
          data-testid="task-mention-menu-empty"
          className={cn(
            'task-mention-menu',
            'w-72 p-2',
            'rounded-lg border border-border bg-background',
            'shadow-lg'
          )}
        >
          <p className="px-2 py-1 text-sm text-muted-foreground">No matching people</p>
        </div>
      )
    }

    return (
      <div
        data-testid="task-mention-menu"
        className={cn(
          'task-mention-menu',
          'w-80 max-h-80 overflow-y-auto',
          'rounded-lg border border-border bg-background',
          'shadow-lg',
          'p-1',
          'animate-menu-appear'
        )}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              'flex items-center gap-3 w-full',
              'px-2 py-2 rounded-md',
              'text-left text-sm',
              'transition-colors duration-75',
              index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
          >
            {item.avatarUrl ? (
              <img
                src={item.avatarUrl}
                alt={`Avatar for ${item.label}`}
                className="h-8 w-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: item.color ?? 'rgb(37 99 235 / 0.12)',
                  color: item.color ? 'white' : 'rgb(37 99 235)'
                }}
              >
                {item.label.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">@{item.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.subtitle ?? item.id}
              </span>
            </span>
          </button>
        ))}
      </div>
    )
  }
)
