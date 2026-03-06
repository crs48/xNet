/**
 * @xnetjs/editor - Shared task mention suggestion helpers
 */
import type { TaskMentionSuggestion } from '../extensions/task-metadata'
import { createGravatarUrl } from './gravatar'

type MentionPresenceEntry = {
  did: string
  name?: string
  color?: string
  avatar?: string
}

export function buildTaskMentionSuggestions(
  presence: Iterable<MentionPresenceEntry>,
  did: string | null | undefined
): TaskMentionSuggestion[] {
  const suggestions = new Map<string, TaskMentionSuggestion>()

  const addSuggestion = (entry: MentionPresenceEntry | null | undefined, isLocal = false): void => {
    if (!entry?.did || suggestions.has(entry.did)) return

    suggestions.set(entry.did, {
      id: entry.did,
      label: entry.name?.trim() || `${entry.did.slice(8, 16)}...`,
      subtitle: isLocal ? 'You' : entry.did,
      color: entry.color,
      avatarUrl: entry.avatar || createGravatarUrl(entry.did)
    })
  }

  addSuggestion(did ? { did } : null, true)

  for (const user of presence) {
    addSuggestion(user)
  }

  return Array.from(suggestions.values())
}
