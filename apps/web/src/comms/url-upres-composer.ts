/**
 * Pure logic for the chat composer's URL up-res pill (exploration 0295).
 *
 * Mirrors link-composer.ts: when the draft contains an internal URL (an app
 * deep link or xnet:// reference) that resolves to a linkable workspace
 * node, the composer offers to convert it into a `[[Title]]` wikilink pick.
 * Accepting rewrites the draft text and records the title → node-id binding
 * so the message's structured `links` relation carries the reference —
 * readers never parse body text.
 */
import type { WikilinkTarget } from '@xnetjs/editor/react'
import { findLinkTokens } from '@xnetjs/ui'
import { classifyUrl, type UrlEnv } from '../lib/url-upres'
import { nodeIdFromHref } from './link-composer'

export interface UpresCandidate {
  /** Span of the URL token in the draft, verbatim */
  start: number
  end: number
  url: string
  nodeId: string
  title: string
  kind: string
}

/**
 * The first internal URL in the draft that resolves to a linkable node and
 * has not been dismissed. Null when there is nothing to offer.
 */
export function internalUrlCandidate(
  text: string,
  targets: WikilinkTarget[],
  env: UrlEnv,
  dismissed: ReadonlySet<string>
): UpresCandidate | null {
  for (const token of findLinkTokens(text)) {
    if (token.type !== 'url' || dismissed.has(token.text)) continue
    const cls = classifyUrl(token.href, env)
    if (cls.kind !== 'internal') continue
    const target = targets.find((t) => nodeIdFromHref(t.href) === cls.nodeId)
    if (!target) continue
    return {
      start: token.start,
      end: token.end,
      url: token.text,
      nodeId: cls.nodeId,
      title: target.title,
      kind: target.kind
    }
  }
  return null
}

/** Replace the candidate's URL span with `[[Title]]` and place the caret after it. */
export function applyUrlUpres(
  text: string,
  candidate: UpresCandidate
): { text: string; caret: number } {
  const inserted = `[[${candidate.title}]]`
  const next = text.slice(0, candidate.start) + inserted + text.slice(candidate.end)
  return { text: next, caret: candidate.start + inserted.length }
}
