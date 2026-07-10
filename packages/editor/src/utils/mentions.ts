/**
 * Structured mention extraction (exploration 0168).
 *
 * The composer — not the reader — declares mentions: when a message or
 * comment is sent, the editor document is walked once and every mention
 * pill carrying a DID becomes an entry in the node's structured `mentions`
 * field (the Matrix MSC3952 model). Body text is never parsed for '@'.
 *
 * xNet's existing mention pill node type is `taskMention` (its `id` attr is
 * a DID); `personMention`/`mention` are accepted for forward compatibility.
 */
import type { TaskMentionSuggestion } from '../extensions/task-metadata'
import type { JSONContent } from '@tiptap/core'

const MENTION_NODE_TYPES = new Set(['taskMention', 'personMention', 'mention'])
const DID_PATTERN = /^did:[a-z]+:[a-zA-Z0-9._:-]+$/

function collectDids(node: JSONContent | null | undefined, dids: Set<string>): void {
  if (!node) return
  const id = node.attrs?.id
  if (MENTION_NODE_TYPES.has(node.type ?? '') && typeof id === 'string' && DID_PATTERN.test(id)) {
    dids.add(id)
  }
  for (const child of node.content ?? []) {
    collectDids(child, dids)
  }
}

/** All DIDs mentioned via pills in the document, deduped, in walk order. */
export function extractMentionDids(doc: JSONContent | null | undefined): string[] {
  const dids = new Set<string>()
  collectDids(doc, dids)
  return [...dids]
}

/**
 * The structured `mentions` value for a composed document, or undefined
 * when nothing is mentioned (so the property is omitted entirely).
 */
export function mentionsFromDoc(
  doc: JSONContent | null | undefined
): { dids: string[] } | undefined {
  const dids = extractMentionDids(doc)
  return dids.length > 0 ? { dids } : undefined
}

/** A user that can be offered in the mention picker. */
export interface MentionablePerson {
  did: string
  name?: string
  /** Optional workspace-unique @handle (0172), matched by the picker filter */
  handle?: string
  color?: string
  avatar?: string
}

/**
 * Build mention suggestions from durable profiles plus the live presence
 * roster (profiles win on name/avatar; presence fills in who's around now).
 */
export function buildPersonMentionSuggestions(
  profiles: Iterable<MentionablePerson>,
  presence: Iterable<MentionablePerson>,
  selfDid: string | null | undefined
): TaskMentionSuggestion[] {
  const merged = new Map<string, MentionablePerson>()
  for (const entry of [...profiles, ...presence]) {
    if (!entry.did) continue
    const existing = merged.get(entry.did)
    merged.set(entry.did, { ...entry, ...existing })
  }

  return [...merged.values()].map((entry) => ({
    id: entry.did,
    label: entry.name?.trim() || `${entry.did.slice(8, 16)}...`,
    subtitle: entry.did === selfDid ? 'You' : entry.did,
    handle: entry.handle,
    color: entry.color,
    avatarUrl: entry.avatar
  }))
}
