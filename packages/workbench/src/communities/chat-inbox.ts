export interface ChatPreference {
  pinnedAt?: number
  seen?: string
  unread?: boolean
}
export type ChatPreferences = Record<string, ChatPreference>
export interface ChatSummary {
  id: string
  createdAt: number
  createdBy: string
  agentReply?: boolean
  text: string
  kind: 'message' | 'file' | 'image' | 'video' | 'audio' | 'extension' | 'thread'
}

export function parseChatPreferences(raw: string | null): ChatPreferences {
  if (raw === null) return {}
  const value: unknown = JSON.parse(raw)
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('chats' in value) ||
    !value.chats ||
    typeof value.chats !== 'object' ||
    Array.isArray(value.chats)
  )
    throw new Error('Saved chat preferences have an unsupported format.')
  const entries = Object.entries(value.chats)
  if (entries.length > 2000) throw new Error('Saved chat preferences exceed the supported limit.')
  return Object.fromEntries(
    entries.map(([id, item]: [string, unknown]) => {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        ('pinnedAt' in item &&
          (typeof item.pinnedAt !== 'number' ||
            !Number.isFinite(item.pinnedAt) ||
            item.pinnedAt < 0)) ||
        ('seen' in item && typeof item.seen !== 'string') ||
        ('unread' in item && typeof item.unread !== 'boolean')
      )
        throw new Error('Saved chat preferences could not be read.')
      return [id, item as ChatPreference]
    })
  )
}

export function chatIsUnread(
  summary: ChatSummary | undefined,
  preference: ChatPreference | undefined,
  did: string | null
): boolean {
  if (preference?.unread) return true
  return (
    !!summary &&
    (summary.createdBy !== did || !!summary.agentReply) &&
    preference?.seen !== summary.id
  )
}

export function sortChatIds(
  ids: string[],
  summaries: Record<string, ChatSummary | undefined>,
  preferences: ChatPreferences
): string[] {
  return [...ids].sort((a, b) => {
    const pinA = preferences[a]?.pinnedAt ?? 0
    const pinB = preferences[b]?.pinnedAt ?? 0
    return (
      pinB - pinA ||
      (summaries[b]?.createdAt ?? 0) - (summaries[a]?.createdAt ?? 0) ||
      a.localeCompare(b)
    )
  })
}
