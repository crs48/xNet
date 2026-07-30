/**
 * Mention picker suggestions (exploration 0168).
 *
 * Document mention extraction moved to blocknote/doc-utils (0312); this
 * module keeps the picker-suggestion builder shared by hosts.
 */
import type { TaskMentionSuggestion } from '../blocknote/specs/mention'
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
