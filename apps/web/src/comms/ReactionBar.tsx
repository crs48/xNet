/**
 * ReactionBar — emoji reaction pills under a message (0198). Highlights the
 * viewer's own reactions, shows reactor names on hover, toggles on click, and
 * offers an inline "add reaction" emoji picker. Pops in with scale-in.
 */
import type { ReactionGroup } from './reactions'
import { cn } from '@xnetjs/ui'
import { SmilePlus } from 'lucide-react'
import { EmojiPicker } from './EmojiPicker'
import { displayName, type ProfileEntry } from './hooks'

export function ReactionBar({
  groups,
  profiles,
  onToggle
}: {
  groups: ReactionGroup[]
  profiles: ProfileEntry[]
  onToggle: (emoji: string) => void
}) {
  if (groups.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {groups.map((group) => (
        <button
          key={group.emoji}
          type="button"
          aria-pressed={group.mine}
          title={group.reactors.map((did) => displayName(did, profiles)).join(', ')}
          onClick={() => onToggle(group.emoji)}
          className={cn(
            'flex animate-scale-in items-center gap-1 rounded-full border px-1.5 py-px text-xs transition-colors',
            group.mine
              ? 'border-accent bg-accent/10 text-accent-ink'
              : 'border-hairline bg-surface-1 text-ink-2 hover:border-border-emphasis'
          )}
        >
          <span aria-hidden>{group.emoji}</span>
          <span className="font-mono text-[10px]">{group.count}</span>
        </button>
      ))}
      <EmojiPicker
        side="top"
        align="start"
        onSelect={onToggle}
        trigger={
          <button
            type="button"
            aria-label="Add reaction"
            className="flex h-[18px] cursor-pointer items-center rounded-full border border-hairline bg-surface-1 px-1.5 text-ink-3 hover:text-ink-1"
          >
            <SmilePlus size={12} strokeWidth={1.5} />
          </button>
        }
      />
    </div>
  )
}
