/**
 * EmojiPicker — a small, dependency-free emoji popover (0198). Searchable grid
 * over the curated EMOJI_SET; closes and clears its query when one is picked.
 */
import { Popover } from '@xnetjs/ui'
import { useState, type ReactElement } from 'react'
import { filterEmoji } from './emoji-data'

export function EmojiPicker({
  trigger,
  onSelect,
  side = 'top',
  align = 'end'
}: {
  trigger: ReactElement
  onSelect: (emoji: string) => void
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const results = filterEmoji(query)

  const pick = (emoji: string) => {
    onSelect(emoji)
    setQuery('')
    setOpen(false)
  }

  return (
    <Popover
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      side={side}
      align={align}
      className="w-64 p-2"
    >
      <div className="flex flex-col gap-2">
        <input
          autoFocus
          type="text"
          value={query}
          placeholder="Search emoji…"
          onChange={(event) => setQuery(event.target.value)}
          className="h-7 w-full rounded border border-hairline bg-surface-0 px-2 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
        />
        <div
          role="listbox"
          aria-label="Emoji"
          className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto"
        >
          {results.map((entry) => (
            <button
              key={entry.emoji}
              type="button"
              role="option"
              aria-selected={false}
              title={entry.name}
              aria-label={entry.name}
              onClick={() => pick(entry.emoji)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none bg-transparent text-base hover:bg-surface-2"
            >
              {entry.emoji}
            </button>
          ))}
          {results.length === 0 && (
            <div className="col-span-8 px-2 py-3 text-center text-xs text-ink-3">
              No emoji found
            </div>
          )}
        </div>
      </div>
    </Popover>
  )
}
