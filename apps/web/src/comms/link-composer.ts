/**
 * Pure logic for the chat composer's [[ node-link autocomplete (0170).
 *
 * Mirrors mention-composer.ts / hashtag-composer.ts: typing `[[que…`
 * opens a picker over linkable workspace nodes; picking inserts
 * `[[Title]] ` and records the title → node-id binding. On send, only
 * titles still present in the text become entries in the message's
 * structured `links` relation (composer-declared; body text is never
 * parsed by readers).
 */
import type { WikilinkTarget } from '@xnetjs/editor/react'

export interface LinkQuery {
  /** Index of the first '[' character */
  start: number
  /** Text typed after '[[' so far */
  query: string
}

const TRIGGER = /(^|\s)\[\[([^\]\n]*)$/

/** The active link query at the caret, or null when not composing one. */
export function linkQueryAt(text: string, caret: number): LinkQuery | null {
  const before = text.slice(0, caret)
  const match = TRIGGER.exec(before)
  if (!match) return null
  const query = match[2] ?? ''
  return { start: caret - query.length - 2, query }
}

/** Replace the active link query with `[[Title]] ` and move the caret. */
export function applyLinkPick(
  text: string,
  caret: number,
  start: number,
  title: string
): { text: string; caret: number } {
  const inserted = `[[${title}]] `
  const next = text.slice(0, start) + inserted + text.slice(caret)
  return { text: next, caret: start + inserted.length }
}

/** Node id behind a wikilink href (pages are bare ids; others xnet:// URIs). */
export function nodeIdFromHref(href: string): string {
  const match = href.match(/^xnet:\/\/[a-z]+\/(.+)$/)
  return match ? match[1] : href
}

/**
 * The `links` relation for a composed message: every picked title whose
 * `[[Title]]` text survives in the final message contributes its node id.
 */
export function composerLinks(
  text: string,
  picked: ReadonlyMap<string, string>
): string[] | undefined {
  const ids = [...picked.entries()]
    .filter(([title, id]) => id && text.includes(`[[${title}]]`))
    .map(([, id]) => id)
  return ids.length > 0 ? [...new Set(ids)] : undefined
}

/** Picker options for the active query (prefix matches first, capped). */
export function linkOptionsFor(
  text: string,
  caret: number,
  targets: WikilinkTarget[]
): WikilinkTarget[] {
  const query = linkQueryAt(text, caret)
  if (!query) return []
  const q = query.query.trim().toLowerCase()
  if (!q) return targets.slice(0, 6)
  const starts = targets.filter((t) => t.title.toLowerCase().startsWith(q))
  const contains = targets.filter((t) => {
    const title = t.title.toLowerCase()
    return !title.startsWith(q) && title.includes(q)
  })
  return [...starts, ...contains].slice(0, 6)
}
