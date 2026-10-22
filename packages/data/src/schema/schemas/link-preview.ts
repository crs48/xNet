/**
 * Composer-resolved URL previews (exploration 0295).
 *
 * A preview is resolved by the author's composer (via a guarded desktop
 * fetcher or the hub's /unfurl proxy), and stored as a structured field on the
 * message/comment — the sender-generated model. Readers render the stored
 * snapshot and never fetch the URL, so no reader IPs leak, no read
 * receipts exist from automatic previews, and snapshots replicate offline.
 * Playing a third-party embed still contacts that provider.
 */

import type { FileRef } from '../properties/file'

/** One stored preview. `url` matches the verbatim token in `content`. */
export interface MessageLinkPreview {
  /** The URL exactly as it appears in the message text — the render key. */
  url: string
  /** 'share' = xNet share link snapshot; 'external' = oEmbed/Open Graph. */
  kind: 'share' | 'external'
  title: string
  description?: string
  /**
   * Optional image. Renderers must only load images through a trusted
   * proxy (the hub's /unfurl/image) — never hotlink, which would ping the
   * origin from every reader.
   */
  imageUrl?: string
  /** Sender-fetched image stored locally; readers never hotlink the source. */
  image?: FileRef
  /** A directly linked image, PDF, audio, video, or text file. */
  media?: FileRef
  providerName?: string
  /** Real destination host, always displayed (anti-phishing). */
  domain: string
  resolvedAt: number
}

/** Cap enforced by composers; renderers also slice defensively. */
export const MAX_LINK_PREVIEWS_PER_MESSAGE = 3

/** Runtime guard for one stored preview entry. */
export function isMessageLinkPreview(value: unknown): value is MessageLinkPreview {
  if (!value || typeof value !== 'object') return false
  const preview = value as Record<string, unknown>
  return (
    typeof preview.url === 'string' &&
    (preview.kind === 'share' || preview.kind === 'external') &&
    typeof preview.title === 'string' &&
    typeof preview.domain === 'string' &&
    typeof preview.resolvedAt === 'number'
  )
}

/** Sanitize a stored linkPreviews value for rendering (unknown authors). */
export function sanitizeLinkPreviews(value: unknown): MessageLinkPreview[] {
  if (!Array.isArray(value)) return []
  return value.filter(isMessageLinkPreview).slice(0, MAX_LINK_PREVIEWS_PER_MESSAGE)
}
