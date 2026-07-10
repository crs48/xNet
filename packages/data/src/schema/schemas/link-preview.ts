/**
 * Composer-resolved URL previews (exploration 0295).
 *
 * A preview is resolved ONCE, by the author's composer (via the hub's
 * SSRF-guarded /unfurl proxy), and stored as a structured field on the
 * message/comment — the sender-generated model. Readers render the stored
 * snapshot and never fetch the URL, so no reader IPs leak, no read
 * receipts exist, and previews replicate offline like any other data.
 */

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
