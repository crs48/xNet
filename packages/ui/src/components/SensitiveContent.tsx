/**
 * SensitiveContent - the render gate for NSFW / sensitive content (0175).
 *
 * Given a resolved visibility (computed by `@xnetjs/abuse`
 * `resolveContentVisibility` from the content's labels + the viewer's dial) it
 * shows, warns, blurs (click-to-reveal), or hides its children. The decision is
 * made elsewhere; this component only renders it, so feeds, DMs, and the
 * matching surface can all share one veil.
 */
import * as React from 'react'
import { useState } from 'react'
import { cn } from '../utils'

/** Mirrors `AbuseVisibility` from @xnetjs/abuse (kept local to avoid a dep). */
export type SensitiveVisibility = 'show' | 'warn' | 'blur' | 'hide'

export interface SensitiveContentProps {
  visibility: SensitiveVisibility
  /** Label values driving the warning text, e.g. ['sexual', 'porn']. */
  labels?: readonly string[]
  /** Optional source attribution, e.g. 'via did:key:zAB…' (a subscribed labeler). */
  attribution?: string
  /** Optional human-readable reasons for a "why was this filtered?" disclosure. */
  reasons?: readonly string[]
  /** Render nothing for `hide` (default), or a compact placeholder. */
  hiddenPlaceholder?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/** A small inline "Why?" disclosure listing the reasons content was filtered. */
function WhyFiltered({ reasons }: { reasons?: readonly string[] }) {
  if (!reasons || reasons.length === 0) return null
  return (
    <details className="mt-0.5 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
      <summary className="cursor-pointer select-none opacity-80 hover:opacity-100">Why?</summary>
      <ul className="mt-0.5 list-disc pl-4 text-left font-normal">
        {reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
    </details>
  )
}

const LABEL_TEXT: Record<string, string> = {
  sexual: 'Sexually suggestive',
  nudity: 'Nudity',
  porn: 'Explicit content',
  'graphic-media': 'Graphic media'
}

export function labelText(labels: readonly string[] = []): string {
  if (labels.length === 0) return 'Sensitive content'
  return labels.map((value) => LABEL_TEXT[value] ?? value).join(', ')
}

export function SensitiveContent({
  visibility,
  labels = [],
  attribution,
  reasons,
  hiddenPlaceholder = null,
  className,
  children
}: SensitiveContentProps) {
  const [revealed, setRevealed] = useState(false)
  const suffix = attribution ? ` · ${attribution}` : ''

  if (visibility === 'hide') {
    return <>{hiddenPlaceholder}</>
  }

  if (visibility === 'show' || revealed) {
    return <div className={className}>{children}</div>
  }

  if (visibility === 'warn') {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <div className="text-xs text-muted-foreground" role="note">
          ⚠️ {labelText(labels)}
          {suffix}
          <WhyFiltered reasons={reasons} />
        </div>
        {children}
      </div>
    )
  }

  // blur — cover the content; click to reveal.
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      aria-label={`Reveal hidden content: ${labelText(labels)}`}
      className={cn(
        'relative block w-full overflow-hidden rounded-md text-left',
        'min-h-16 bg-muted/60',
        className
      )}
    >
      <div aria-hidden className="pointer-events-none select-none blur-xl saturate-50">
        {children}
      </div>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-sm font-medium text-foreground">
        <span>🙈 {labelText(labels)} — tap to reveal</span>
        {attribution && (
          <span className="text-xs font-normal text-muted-foreground">{attribution}</span>
        )}
        <WhyFiltered reasons={reasons} />
      </span>
    </button>
  )
}
