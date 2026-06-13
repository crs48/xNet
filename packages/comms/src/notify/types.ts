/**
 * Notifier types (exploration 0168).
 *
 * Notifications are a *derived view* over the local change log — never
 * delivered objects. The notifier evaluates each applied change once and
 * produces InboxItems; only triage state (InboxState) is persisted.
 */

/** Why an item is in the inbox — machine-readable, used as filter tokens. */
export type NotificationReason =
  | 'mention'
  | 'room-mention'
  | 'dm'
  | 'assigned'
  | 'reply'
  | 'comment'
  | 'keyword'
  | 'call-missed'
  | 'connection-request'
  | 'message-request'
  | 'system'

export interface InboxItem {
  /** Source node ID (message/comment/task) — the stable triage key */
  sourceId: string
  reason: NotificationReason
  /** Container node for grouping and deep links (channel, page, …) */
  contextId?: string
  /** DID of the actor who caused the item */
  actor: string
  /** Wall-clock time of the source change */
  at: number
  /** Short plain-text preview */
  preview?: string
  /** Schema IRI of the source node */
  schemaId?: string
}

/**
 * Minimal structural view of a NodeChangeEvent (packages/data store types).
 * The notifier never imports the store — bridges hand events across.
 */
export interface NotifierEvent {
  change: {
    authorDID: string
    wallTime?: number
  }
  node: Record<string, unknown> | null
  previousNode: Record<string, unknown> | null
}

/**
 * Lookups the rules need from the surrounding app. All optional — absent
 * lookups simply disable the rules that need them.
 */
export interface NotifierContext {
  /** The local user's DID */
  me: string
  /** Resolve a channel's kind ('dm' detection beyond deterministic IDs) */
  getChannelKind?(channelId: string): string | undefined
  /** Whether the user authored or participates in the thread root */
  isMyThread?(rootId: string): boolean
  /** Whether the user created the given node (comment-on-my-node) */
  isMyNode?(nodeId: string): boolean
  /** Keyword alerts (case-insensitive substring match) */
  keywords?: string[]
}
