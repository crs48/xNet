/**
 * LinkPreviewCard - compact preview card for a URL (exploration 0295).
 *
 * Purely presentational: callers pass an already-resolved preview snapshot
 * (composer-stored, never fetched at render). The real destination domain
 * is always shown — preview metadata is author/attacker controlled, so the
 * domain is the reader's anti-phishing anchor. The href goes through the
 * 0171 scheme allowlist; images must already be proxy-safe URLs (never a
 * raw og:image), and are optional.
 */
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'
import { safeHref } from '../utils/linkify'

export interface LinkPreviewCardProps {
  url: string
  title: string
  /** Real destination host — always rendered. */
  domain: string
  description?: string
  /** Proxy-safe image URL. Omit to render a text-only card. */
  imageUrl?: string
  providerName?: string
  /** When set, shows a remove (×) affordance — author-only in chat. */
  onRemove?: () => void
  className?: string
}

export function LinkPreviewCard({
  url,
  title,
  domain,
  description,
  imageUrl,
  providerName,
  onRemove,
  className
}: LinkPreviewCardProps) {
  const href = safeHref(url)
  const heading = <span className="line-clamp-2 text-xs font-medium text-ink-1">{title}</span>
  return (
    <div
      className={cn(
        'group/preview relative flex max-w-96 gap-2 rounded-md border border-hairline border-l-2 px-2.5 py-1.5',
        className
      )}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 self-center rounded object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] uppercase tracking-wider text-ink-3">
          {providerName ? `${providerName} · ` : ''}
          {domain}
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {heading}
          </a>
        ) : (
          heading
        )}
        {description && (
          <p className="m-0 mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-3">
            {description}
          </p>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          title="Remove preview"
          aria-label="Remove preview"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-hairline bg-surface-0 text-ink-3 hover:text-ink-1 group-hover/preview:flex"
        >
          <X size={9} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
