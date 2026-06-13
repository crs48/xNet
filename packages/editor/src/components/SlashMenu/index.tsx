import type { SlashCommandItem } from '../../extensions/slash-command/items'
import { useListboxNavigation } from '@xnetjs/ui'
import { forwardRef, useCallback, useImperativeHandle } from 'react'
import { cn } from '../../utils'

interface SlashMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * SlashMenu - Command palette UI component. Keyboard handling is the shared
 * listbox contract (exploration 0172); swallowKeysWhenEmpty keeps arrows from
 * moving the editor caret while "No results" is showing.
 */
export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref
) {
  const selectItem = useCallback(
    (index: number) => {
      const item = items[index]
      if (item) {
        command(item)
      }
    },
    [items, command]
  )

  const nav = useListboxNavigation({
    count: items.length,
    onCommit: selectItem,
    resetKey: items,
    swallowKeysWhenEmpty: true
  })
  const selectedIndex = nav.activeIndex

  useImperativeHandle(ref, () => ({ onKeyDown: nav.onKeyDown }), [nav.onKeyDown])

  if (items.length === 0) {
    return (
      <div
        data-testid="slash-menu-empty"
        className={cn(
          'slash-menu',
          'w-72 p-2',
          'rounded-lg border border-border bg-background',
          'shadow-lg'
        )}
      >
        <p className="px-2 py-1 text-sm text-muted-foreground">No results found</p>
      </div>
    )
  }

  return (
    <div
      data-testid="slash-menu"
      role="listbox"
      aria-label="Slash commands"
      className={cn(
        'slash-menu',
        'w-72 max-h-80 overflow-y-auto',
        'rounded-lg border border-border bg-background',
        'shadow-lg',
        'p-1',
        'animate-menu-appear'
      )}
    >
      {items.map((item, index) => (
        <SlashMenuItem
          key={item.title}
          item={item}
          isSelected={index === selectedIndex}
          onClick={() => selectItem(index)}
          onMouseEnter={() => nav.setActiveIndex(index)}
        />
      ))}
    </div>
  )
})

interface SlashMenuItemProps {
  item: SlashCommandItem
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
}

function SlashMenuItem({ item, isSelected, onClick, onMouseEnter }: SlashMenuItemProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      aria-label={item.title}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex items-center gap-3 w-full',
        'px-2 py-2 rounded-md',
        'text-left text-sm',
        'transition-colors duration-75',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
    >
      {/* Icon */}
      <span
        className={cn(
          'flex items-center justify-center',
          'w-10 h-10 rounded-md',
          'bg-secondary text-muted-foreground',
          'text-sm font-mono'
        )}
      >
        {item.icon}
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
      </div>
    </button>
  )
}
