import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { cn } from '../../utils'
import type { SlashCommandItem } from '../../extensions/slash-command/items'

interface SlashMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * SlashMenu - Command palette UI component
 */
export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref
) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset selection when items change
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
    [items, command]
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
          onMouseEnter={() => setSelectedIndex(index)}
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
