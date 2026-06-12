/**
 * Pure logic for the chat composer's @-mention autocomplete (0168).
 *
 * The composer is a plain textarea: typing `@que…` opens a picker; picking
 * inserts `@Label ` and records the label → DID binding. On send, only
 * labels still present in the text become structured mentions — deleting
 * the text removes the mention (composer-declared, MSC3952 model).
 */

export interface MentionQuery {
  /** Index of the '@' character */
  start: number
  /** Text typed after the '@' so far */
  query: string
}

const TRIGGER = /(^|\s)@([\w-]*)$/

/** The active mention query at the caret, or null when not composing one. */
export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const match = TRIGGER.exec(before)
  if (!match) return null
  const query = match[2] ?? ''
  return { start: caret - query.length - 1, query }
}

/** Replace the active mention query with `@Label ` and move the caret. */
export function applyMentionPick(
  text: string,
  caret: number,
  start: number,
  label: string
): { text: string; caret: number } {
  const inserted = `@${label} `
  const next = text.slice(0, start) + inserted + text.slice(caret)
  return { text: next, caret: start + inserted.length }
}

/**
 * The structured mentions for a composed message: every picked label whose
 * `@Label` text survives in the final message contributes its DID.
 */
export function composerMentions(
  text: string,
  picked: ReadonlyMap<string, string>
): { dids: string[] } | undefined {
  const dids = [...picked.entries()]
    .filter(([label]) => text.includes(`@${label}`))
    .map(([, did]) => did)
  return dids.length > 0 ? { dids: [...new Set(dids)] } : undefined
}

/** Case-insensitive prefix-then-substring filtering for the picker. */
export function filterMentionables<T extends { label: string }>(items: T[], query: string): T[] {
  const q = query.toLowerCase()
  if (!q) return items.slice(0, 6)
  const starts = items.filter((i) => i.label.toLowerCase().startsWith(q))
  const contains = items.filter(
    (i) => !i.label.toLowerCase().startsWith(q) && i.label.toLowerCase().includes(q)
  )
  return [...starts, ...contains].slice(0, 6)
}
