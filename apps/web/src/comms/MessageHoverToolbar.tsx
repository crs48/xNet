/**
 * MessageHoverToolbar — the floating actions revealed on message hover (0198):
 * quick reactions, add-reaction picker, reply-in-thread, edit (own messages),
 * and the existing safety menu (report / mark sensitive) under "more".
 */
import { MessageSquare, Pencil, SmilePlus } from 'lucide-react'
import { MessageActions } from '../components/MessageActions'
import { QUICK_REACTIONS } from './emoji-data'
import { EmojiPicker } from './EmojiPicker'

const ACTION_CLASS =
  'flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent text-ink-3 hover:bg-surface-2 hover:text-ink-1'

export function MessageHoverToolbar({
  messageId,
  isOwn,
  onToggleReaction,
  onReply,
  onStartEdit
}: {
  messageId: string
  isOwn: boolean
  onToggleReaction: (emoji: string) => void
  onReply: () => void
  onStartEdit: () => void
}) {
  return (
    <div className="absolute -top-3 right-3 z-10 flex items-center gap-0.5 rounded-md border border-hairline bg-surface-0 p-0.5 opacity-0 shadow-sm transition-opacity pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
      {QUICK_REACTIONS.slice(0, 2).map((emoji) => (
        <button
          key={emoji}
          type="button"
          title={`React ${emoji}`}
          aria-label={`React with ${emoji}`}
          onClick={() => onToggleReaction(emoji)}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm hover:bg-surface-2"
        >
          {emoji}
        </button>
      ))}
      <EmojiPicker
        side="top"
        align="end"
        onSelect={onToggleReaction}
        trigger={
          <button type="button" aria-label="Add reaction" className={ACTION_CLASS}>
            <SmilePlus size={14} strokeWidth={1.5} />
          </button>
        }
      />
      <button
        type="button"
        aria-label="Reply in thread"
        title="Reply in thread"
        onClick={onReply}
        className={ACTION_CLASS}
      >
        <MessageSquare size={14} strokeWidth={1.5} />
      </button>
      {isOwn && (
        <button
          type="button"
          aria-label="Edit message"
          title="Edit"
          onClick={onStartEdit}
          className={ACTION_CLASS}
        >
          <Pencil size={14} strokeWidth={1.5} />
        </button>
      )}
      <MessageActions targetId={messageId} isOwn={isOwn} />
    </div>
  )
}
