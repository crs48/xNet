/**
 * Pure message-grouping helpers for the channel message list (0198).
 *
 * Kept free of React so they stay unit-tested and the list component stays
 * thin. `groupMessages` turns a flat, chronologically-sorted message list into
 * render rows that carry the cross-app chat grammar: consecutive same-author
 * messages collapse into a group (one avatar + name), a day boundary inserts a
 * date separator, and the first message past the read watermark is flagged so
 * the list can draw a "New messages" divider above it.
 */

/** Minimal shape the grouping needs — a superset of the rendered fields. */
export interface ChatRow {
  id: string
  content?: string
  createdBy?: string
  createdAt?: number
  edited?: boolean
  redacted?: boolean
  mentions?: { dids?: string[]; room?: boolean }
  tags?: string[]
  links?: string[]
  /** Composer-resolved URL previews (0295), stored with the message. */
  linkPreviews?: unknown
  inReplyTo?: string
}

export interface RenderRow {
  message: ChatRow
  /** Show avatar + name + absolute timestamp (first of an author run). */
  startsGroup: boolean
  /** Day label to render above this row, when it crosses a calendar day. */
  daySeparator?: string
  /** This is the first unread message — draw the "New messages" divider. */
  firstUnread: boolean
}

/** Messages within this window from the same author collapse into one group. */
export const GROUP_WINDOW_MS = 5 * 60_000

const DAY_MS = 24 * 60 * 60_000

/** Local midnight (ms) for a timestamp — the canonical day key. */
function startOfDay(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** True when both timestamps fall on the same local calendar day. */
export function sameDay(a: number | undefined, b: number | undefined): boolean {
  if (a == null || b == null) return false
  return startOfDay(a) === startOfDay(b)
}

/** Hour:minute in the viewer's locale, e.g. "9:24 AM". */
export function formatTime(at: number | undefined): string {
  if (!at) return ''
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** "Today" / "Yesterday" / "Mon, Jun 9" relative to `now`. */
export function dayLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Build render rows from chronologically-ascending messages. A row starts a
 * new group when the author changes, the gap exceeds GROUP_WINDOW_MS, or the
 * message crosses a calendar day. `lastReadAt` is the read watermark; the
 * first message created after it is flagged `firstUnread`.
 */
export function groupMessages(
  messages: ChatRow[],
  lastReadAt: number,
  now: number = Date.now()
): RenderRow[] {
  let prev: ChatRow | undefined
  let unreadShown = false
  return messages.map((message) => {
    const at = message.createdAt ?? 0
    const crossesDay = !sameDay(prev?.createdAt, at)
    const newAuthor = message.createdBy !== prev?.createdBy
    const gap = at - (prev?.createdAt ?? 0) > GROUP_WINDOW_MS
    const firstUnread = !unreadShown && at > lastReadAt
    if (firstUnread) unreadShown = true
    const row: RenderRow = {
      message,
      startsGroup: newAuthor || gap || crossesDay,
      daySeparator: crossesDay ? dayLabel(at, now) : undefined,
      firstUnread
    }
    prev = message
    return row
  })
}
