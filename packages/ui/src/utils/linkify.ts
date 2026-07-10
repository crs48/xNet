/**
 * Link detection for plain user text (0171).
 *
 * Tokenizes URLs and email addresses with linkifyjs (the same engine
 * @tiptap/extension-link uses, so read surfaces and the page editor agree on
 * what counts as a link) and applies a strict scheme allowlist before any
 * token is rendered as an anchor. Stored text is never modified — detection
 * is render-time decoration only.
 */
import { find } from 'linkifyjs'

export type LinkTokenType = 'url' | 'email' | 'phone'

export interface LinkToken {
  type: LinkTokenType
  /** Original text span, verbatim */
  text: string
  /** Sanitized href, guaranteed scheme-allowlisted */
  href: string
  start: number
  end: number
}

export interface TextSegment {
  text: string
  /** Present when this segment should render as a link */
  token?: LinkToken
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/** Control and zero-width characters that can smuggle a scheme past checks */
// eslint-disable-next-line no-control-regex
const SMUGGLING_CHARS = /[\u0000-\u001f\u200b-\u200d\u2060\ufeff]/g

/**
 * Validate a candidate href against the scheme allowlist.
 * Returns the cleaned href, or null when the scheme is not allowed.
 */
export function safeHref(raw: string): string | null {
  const cleaned = raw.replace(SMUGGLING_CHARS, '')
  try {
    const url = new URL(cleaned)
    return ALLOWED_PROTOCOLS.has(url.protocol) ? cleaned : null
  } catch {
    return null
  }
}

function toLinkToken(match: ReturnType<typeof find>[number]): LinkToken | null {
  if (match.type !== 'url' && match.type !== 'email') return null
  const href = safeHref(match.href)
  if (href === null) return null
  return { type: match.type, text: match.value, href, start: match.start, end: match.end }
}

/**
 * Find URL and email tokens in plain text. Fuzzy domains ("example.com")
 * resolve to https; emails resolve to mailto.
 */
export function findLinkTokens(text: string): LinkToken[] {
  // Property values from untyped stores can leak through as numbers/objects;
  // linkify-it throws on anything that isn't a real string.
  if (typeof text !== 'string' || text === '') return []
  return find(text, { defaultProtocol: 'https' })
    .map(toLinkToken)
    .filter((token): token is LinkToken => token !== null)
}

/**
 * Merge extra tokens (e.g. lazily-detected phone numbers) into a base token
 * list. Base tokens win on overlap; the result is sorted by position.
 */
export function mergeLinkTokens(base: LinkToken[], extra: LinkToken[]): LinkToken[] {
  const overlapsBase = (token: LinkToken) =>
    base.some((b) => token.start < b.end && b.start < token.end)
  return [...base, ...extra.filter((token) => !overlapsBase(token))].sort(
    (a, b) => a.start - b.start
  )
}

/**
 * Split text into plain and link segments. Tokens must be sorted by position
 * and non-overlapping (as produced by findLinkTokens/mergeLinkTokens).
 */
export function segmentText(text: string, tokens: LinkToken[]): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0
  for (const token of tokens) {
    if (token.start > cursor) segments.push({ text: text.slice(cursor, token.start) })
    segments.push({ text: token.text, token })
    cursor = token.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) })
  return segments
}
