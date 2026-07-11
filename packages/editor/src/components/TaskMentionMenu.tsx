/**
 * @xnetjs/editor - Task mention menu component
 */
import { useListboxNavigation } from '@xnetjs/ui'
import { forwardRef, useCallback, useImperativeHandle } from 'react'
import { cn } from '../utils'

export type TaskMentionSuggestion = {
  id: string
  label: string
  subtitle?: string
  /** Optional workspace-unique @handle (0172), matched by the picker filter */
  handle?: string
  color?: string
  avatarUrl?: string
}

type TaskMentionMenuProps = {
  items: TaskMentionSuggestion[]
  command: (item: TaskMentionSuggestion) => void
}

export type TaskMentionMenuRef = {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export const TaskMentionMenu = forwardRef<TaskMentionMenuRef, TaskMentionMenuProps>(
  function TaskMentionMenu({ items, command }, ref) {
    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) {
          command(item)
        }
      },
      [command, items]
    )

    const nav = useListboxNavigation({
      count: items.length,
      onCommit: selectItem,
      resetKey: items
    })
    const selectedIndex = nav.activeIndex

    useImperativeHandle(ref, () => ({ onKeyDown: nav.onKeyDown }), [nav.onKeyDown])

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
            onMouseEnter={() => nav.setActiveIndex(index)}
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
                {item.handle ? `@${item.handle}` : (item.subtitle ?? item.id)}
                {item.handle && item.subtitle === 'You' ? ' · You' : ''}
              </span>
            </span>
          </button>
        ))}
      </div>
    )
  }
)
