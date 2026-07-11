/**
 * EmojiMenu - `:` shortcode picker for @tiptap/extension-emoji (0297).
 *
 * Rendered through the shared suggestion-popup contract, with the same
 * listbox keyboard handling as SlashMenu (exploration 0172).
 */
import type { EmojiItem } from '@tiptap/extension-emoji'
import { useListboxNavigation } from '@xnetjs/ui'
import { forwardRef, useCallback, useImperativeHandle } from 'react'
import { cn } from '../utils'

interface EmojiMenuProps {
  items: EmojiItem[]
  command: (item: EmojiItem) => void
}

export interface EmojiMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/** Max suggestions shown for a `:` query. */
export const EMOJI_SUGGESTION_LIMIT = 10

/**
 * Filter the emoji catalog by shortcode/name/tag prefix relevance.
 * Exported for the RichTextEditor suggestion wiring and tests.
 */
export function filterEmojiSuggestions(emojis: EmojiItem[], query: string): EmojiItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return emojis.slice(0, EMOJI_SUGGESTION_LIMIT)

  const matches = (value: string) => value.toLowerCase().startsWith(q)
  const contains = (value: string) => value.toLowerCase().includes(q)

  const prefixHits: EmojiItem[] = []
  const containsHits: EmojiItem[] = []
  for (const item of emojis) {
    const names = [item.name, ...(item.shortcodes ?? []), ...(item.tags ?? [])]
    if (names.some(matches)) {
      prefixHits.push(item)
    } else if (names.some(contains)) {
      containsHits.push(item)
    }
    if (prefixHits.length >= EMOJI_SUGGESTION_LIMIT) break
  }

  return [...prefixHits, ...containsHits].slice(0, EMOJI_SUGGESTION_LIMIT)
}

export const EmojiMenu = forwardRef<EmojiMenuRef, EmojiMenuProps>(function EmojiMenu(
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
    swallowKeysWhenEmpty: false
  })
  const selectedIndex = nav.activeIndex

  useImperativeHandle(ref, () => ({ onKeyDown: nav.onKeyDown }), [nav.onKeyDown])

  if (items.length === 0) return null

  return (
    <div
      data-testid="emoji-menu"
      role="listbox"
      aria-label="Emoji suggestions"
      className={cn(
        'w-56 max-h-72 overflow-y-auto',
        'rounded-lg border border-border bg-background',
        'shadow-lg',
        'p-1',
        'animate-menu-appear'
      )}
    >
      {items.map((item, index) => (
        <button
          key={item.name}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          aria-label={item.name}
          onClick={() => selectItem(index)}
          onMouseEnter={() => nav.setActiveIndex(index)}
          className={cn(
            'flex items-center gap-2 w-full',
            'px-2 py-1.5 rounded-md',
            'text-left text-sm',
            'transition-colors duration-75',
            index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
          )}
        >
          <span className="w-5 text-base leading-none">
            {item.emoji ??
              (item.fallbackImage ? (
                <img src={item.fallbackImage} alt="" className="w-4 h-4" />
              ) : (
                '·'
              ))}
          </span>
          <span className="flex-1 min-w-0 truncate text-muted-foreground">:{item.name}:</span>
        </button>
      ))}
    </div>
  )
})
