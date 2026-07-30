/**
 * Compact value formatting for the Time Machine's property diff (exploration
 * 0329): short scalars render verbatim, long prose renders as word/sentence
 * counts (never character counts — "412 words · 23 sentences" reads, a char
 * total doesn't). Pure so it stays unit-testable.
 */

/** Above this length a string is summarized instead of shown. */
export const LONG_TEXT_THRESHOLD = 120

export function wordCount(text: string): number {
  const matches = text.match(/\S+/g)
  return matches ? matches.length : 0
}

export function sentenceCount(text: string): number {
  if (text.trim().length === 0) return 0
  const matches = text.match(/[.!?]+(?=\s|$)/g)
  // Prose without terminal punctuation still counts as one sentence.
  return Math.max(matches ? matches.length : 0, 1)
}

export function isLongText(value: unknown): value is string {
  return typeof value === 'string' && value.length > LONG_TEXT_THRESHOLD
}

function truncate(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** One-line rendering of any property value for a diff row. */
export function formatValue(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (isLongText(value)) {
    const words = wordCount(value)
    const sentences = sentenceCount(value)
    return `${words} ${words === 1 ? 'word' : 'words'} · ${sentences} ${
      sentences === 1 ? 'sentence' : 'sentences'
    }`
  }
  if (typeof value === 'string') return truncate(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`
  try {
    return truncate(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

/**
 * The delta between two long-text values as a word-count change ("+13 words"),
 * or null when either side isn't long text (the row shows both values then).
 */
export function longTextDelta(before: unknown, after: unknown): string | null {
  if (!isLongText(before) && !isLongText(after)) return null
  const beforeWords = typeof before === 'string' ? wordCount(before) : 0
  const afterWords = typeof after === 'string' ? wordCount(after) : 0
  const delta = afterWords - beforeWords
  if (delta === 0) return '±0 words'
  return `${delta > 0 ? '+' : ''}${delta} ${Math.abs(delta) === 1 ? 'word' : 'words'}`
}
