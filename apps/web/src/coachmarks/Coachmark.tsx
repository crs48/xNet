/**
 * Coachmark — a single, non-modal, lovely first-run tip (exploration 0206).
 *
 * Deliberately NOT a Base UI Popover: a coachmark must never trap focus or
 * block the app the way a modal popover does. Instead — like the editor's
 * CommentPopover — we portal a fixed-position card next to the anchor, measure
 * once, and reposition on scroll/resize. Enter animation and reduced-motion
 * come from the shared <Presence> vocabulary; dismissal is Escape, the ✕, or
 * "Got it". No backdrop, no focus steal.
 */
import type { CoachTip } from './registry'
import { Presence } from '@xnetjs/ui'
import { Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Side = NonNullable<CoachTip['side']>

interface Pos {
  left: number
  top: number
}

const GAP = 10

function place(rect: DOMRect, side: Side, w: number, h: number): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left: number
  let top: number
  switch (side) {
    case 'right':
      left = rect.right + GAP
      top = rect.top + rect.height / 2 - h / 2
      break
    case 'left':
      left = rect.left - GAP - w
      top = rect.top + rect.height / 2 - h / 2
      break
    case 'top':
      left = rect.left + rect.width / 2 - w / 2
      top = rect.top - GAP - h
      break
    case 'bottom':
    default:
      left = rect.left + rect.width / 2 - w / 2
      top = rect.bottom + GAP
      break
  }
  // Keep the whole card on-screen with an 8px breathing margin.
  left = Math.max(8, Math.min(left, vw - w - 8))
  top = Math.max(8, Math.min(top, vh - h - 8))
  return { left, top }
}

export interface CoachmarkProps {
  tip: CoachTip
  anchor: HTMLElement
  onDismiss: () => void
}

export function Coachmark({ tip, anchor, onDismiss }: CoachmarkProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const side = tip.side ?? 'bottom'

  const reposition = useCallback(() => {
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    setPos(place(anchor.getBoundingClientRect(), side, box.width || 288, box.height || 96))
  }, [anchor, side])

  useLayoutEffect(() => {
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [reposition])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={ref}
      data-coachmark={tip.id}
      style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, zIndex: 60 }}
      className={pos ? undefined : 'invisible'}
    >
      <Presence show motion="pop">
        <div
          role="dialog"
          aria-label={tip.title}
          className="w-72 rounded-lg border border-hairline bg-surface-1 p-3 shadow-lg"
        >
          <div className="flex items-start gap-2">
            <Sparkles size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent-ink" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-1">{tip.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{tip.body}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismiss}
              className="shrink-0 rounded p-0.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md px-2 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
            >
              Got it
            </button>
          </div>
        </div>
      </Presence>
    </div>,
    document.body
  )
}
