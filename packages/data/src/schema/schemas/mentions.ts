/**
 * Structured mentions (exploration 0168).
 *
 * Mentions are an explicit field on the node, populated by the composer when
 * the user inserts a mention pill — never derived by parsing message text
 * (the Matrix MSC3952 "intentional mentions" model). This keeps mention
 * detection working under encryption and makes "mentions of me" a cheap
 * field check instead of a parse.
 */

/** Maximum number of DIDs a single mentions field may carry. */
export const MAX_MENTION_DIDS = 50

export interface MessageMentions {
  /** DIDs of directly mentioned users */
  dids: string[]
  /** Group mention (@room) — notifies all channel members; sender role-gated */
  room?: boolean
}

const DID_PATTERN = /^did:[a-z]+:[a-zA-Z0-9._:-]+$/

/**
 * Normalize a mentions value: dedupe, drop invalid DIDs, cap the list.
 * Returns undefined when nothing remains (so the property is omitted).
 */
export function normalizeMentions(value: unknown): MessageMentions | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as { dids?: unknown; room?: unknown }
  const dids = Array.isArray(raw.dids)
    ? [
        ...new Set(
          raw.dids.filter((d): d is string => typeof d === 'string' && DID_PATTERN.test(d))
        )
      ].slice(0, MAX_MENTION_DIDS)
    : []
  const room = raw.room === true
  if (dids.length === 0 && !room) return undefined
  return room ? { dids, room: true } : { dids }
}

/** Whether a mentions value (possibly absent) mentions the given DID. */
export function mentionsInclude(
  mentions: MessageMentions | undefined | null,
  did: string
): boolean {
  return Boolean(mentions?.dids?.includes(did))
}

/** Validate a mentions value structurally (used by hub-side relay checks). */
export function isValidMentions(value: unknown): value is MessageMentions {
  if (value === null || value === undefined) return true
  if (typeof value !== 'object') return false
  const raw = value as { dids?: unknown; room?: unknown }
  if (raw.room !== undefined && typeof raw.room !== 'boolean') return false
  if (!Array.isArray(raw.dids)) return false
  if (raw.dids.length > MAX_MENTION_DIDS) return false
  return raw.dids.every((d) => typeof d === 'string' && DID_PATTERN.test(d))
}
