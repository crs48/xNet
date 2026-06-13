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
  /** Render nothing for `hide` (default), or a compact placeholder. */
  hiddenPlaceholder?: React.ReactNode
  className?: string
  children: React.ReactNode
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
  hiddenPlaceholder = null,
  className,
  children
}: SensitiveContentProps) {
  const [revealed, setRevealed] = useState(false)

  if (visibility === 'hide') {
    return <>{hiddenPlaceholder}</>
  }

  if (visibility === 'show' || revealed) {
    return <div className={className}>{children}</div>
  }

  if (visibility === 'warn') {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <p className="text-xs text-muted-foreground" role="note">
          ⚠️ {labelText(labels)}
        </p>
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
      <span className="absolute inset-0 flex items-center justify-center gap-1 text-sm font-medium text-foreground">
        🙈 {labelText(labels)} — tap to reveal
      </span>
    </button>
  )
}
