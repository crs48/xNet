/**
 * Pure logic for the chat composer's #hashtag autocomplete (0169).
 *
 * Mirrors mention-composer.ts: typing `#des…` opens a picker; picking
 * inserts `#name ` and records the name → Tag-id binding. On send, only
 * names still present in the text become entries in the message's
 * structured `tags` relation — deleting the text removes the tag
 * (composer-declared; raw '#' text is never parsed by readers).
 */
import { normalizeTagName } from '@xnetjs/data'

export interface HashtagQuery {
  /** Index of the '#' character */
  start: number
  /** Text typed after the '#' so far */
  query: string
}

export interface TagOption {
  /** Tag node id; '' for the create entry until it resolves */
  id: string
  /** Normalized tag name */
  name: string
  /** True for the trailing "create new tag" entry */
  isNew?: boolean
}

const TRIGGER = /(^|\s)#([\p{L}\p{N}\-_./]*)$/u

/** The active hashtag query at the caret, or null when not composing one. */
export function hashtagQueryAt(text: string, caret: number): HashtagQuery | null {
  const before = text.slice(0, caret)
  const match = TRIGGER.exec(before)
  if (!match) return null
  const query = match[2] ?? ''
  return { start: caret - query.length - 1, query }
}

/** Replace the active hashtag query with `#name ` and move the caret. */
export function applyHashtagPick(
  text: string,
  caret: number,
  start: number,
  name: string
): { text: string; caret: number } {
  const inserted = `#${name} `
  const next = text.slice(0, start) + inserted + text.slice(caret)
  return { text: next, caret: start + inserted.length }
}

/**
 * The `tags` relation for a composed message: every picked name whose
 * `#name` text survives in the final message contributes its Tag id.
 */
export function composerTags(
  text: string,
  picked: ReadonlyMap<string, string>
): string[] | undefined {
  const ids = [...picked.entries()]
    .filter(([name, id]) => id && text.includes(`#${name}`))
    .map(([, id]) => id)
  return ids.length > 0 ? [...new Set(ids)] : undefined
}

/**
 * Plain Enter sends — unless Shift is held or a suggestion picker is
 * open (Enter then belongs to the picker).
 */
export function shouldSendOnEnter(
  event: { key: string; shiftKey: boolean },
  openSuggestionCount: number
): boolean {
  return event.key === 'Enter' && !event.shiftKey && openSuggestionCount === 0
}

/**
 * Picker options for the active query: existing tags (prefix matches
 * first, capped) plus a trailing create entry when the query is a
 * usable, unknown name.
 */
export function tagOptionsFor(
  text: string,
  caret: number,
  tags: Array<{ id: string; name: string }>
): TagOption[] {
  const query = hashtagQueryAt(text, caret)
  if (!query) return []

  const normalized = normalizeTagName(query.query)
  const starts = tags.filter((tag) => normalized && tag.name.startsWith(normalized))
  const contains = tags.filter(
    (tag) => !tag.name.startsWith(normalized) && normalized && tag.name.includes(normalized)
  )
  const options: TagOption[] = (normalized ? [...starts, ...contains] : tags).slice(0, 6)

  if (normalized && !tags.some((tag) => tag.name === normalized)) {
    options.push({ id: '', name: normalized, isNew: true })
  }
  return options
}
