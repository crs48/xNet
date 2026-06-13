/**
 * Menu for the `[[` wikilink typeahead (exploration 0170): linkable
 * workspace nodes with kind icons, plus a trailing create-page row.
 * Keyboard contract matches the other suggestion menus — Arrow keys
 * move, Enter/Tab accept (SuggestionMenuRef).
 */
import type { LucideIcon } from 'lucide-react'
import {
  Database,
  FileText,
  Hash,
  LayoutDashboard,
  Link2,
  Plus,
  Shapes,
  Table2
} from 'lucide-react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { cn } from '../utils'

export type WikilinkMenuItem = {
  /** Commit href (page id or xnet://<type>/<id>), or the create sentinel */
  id: string
  /** Link text that will be inserted */
  label: string
  /** Node kind driving the icon ('page' | 'database' | 'canvas' | …) */
  kind: string
  /** Secondary line (kind name or create hint) */
  subtitle?: string
  /** Page title to create when this is the create row */
  createTitle?: string
}

const KIND_ICONS: Record<string, LucideIcon> = {
  page: FileText,
  database: Database,
  canvas: Shapes,
  dashboard: LayoutDashboard,
  savedview: Table2,
  channel: Hash,
  create: Plus
}

export function wikilinkKindIcon(kind: string): LucideIcon {
  return KIND_ICONS[kind] ?? Link2
}

type LinkTargetMenuProps = {
  items: WikilinkMenuItem[]
  command: (item: WikilinkMenuItem) => void
}

export type LinkTargetMenuRef = {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export const LinkTargetMenu = forwardRef<LinkTargetMenuRef, LinkTargetMenuProps>(
  function LinkTargetMenu({ items, command }, ref) {
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
        if (items.length === 0) return false

        const step = (delta: number) => {
          event.preventDefault()
          setSelectedIndex((prev) => (prev + delta + items.length) % items.length)
          return true
        }

        if (event.key === 'ArrowUp') return step(-1)
        if (event.key === 'ArrowDown') return step(1)

        if (event.key === 'Enter' || event.key === 'Tab') {
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
          data-testid="link-target-menu-empty"
          className={cn(
            'link-target-menu',
            'w-72 p-2',
            'rounded-lg border border-border bg-background',
            'shadow-lg'
          )}
        >
          <p className="px-2 py-1 text-sm text-muted-foreground">No matching nodes</p>
        </div>
      )
    }

    return (
      <div
        data-testid="link-target-menu"
        role="listbox"
        aria-label="Link suggestions"
        className={cn(
          'link-target-menu',
          'w-80 max-h-80 overflow-y-auto',
          'rounded-lg border border-border bg-background',
          'shadow-lg',
          'p-1',
          'animate-menu-appear'
        )}
      >
        {items.map((item, index) => {
          const Icon = wikilinkKindIcon(item.kind)
          return (
            <button
              key={`${item.id}:${item.label}`}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
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
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                <Icon size={14} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.label}</span>
                {item.subtitle ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.subtitle}
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    )
  }
)
