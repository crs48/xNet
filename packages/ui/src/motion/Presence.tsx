/**
 * <Presence> — enter/exit animation for any React child.
 *
 * Base UI components animate on close because the library keeps the node
 * mounted and flips a `data-ending-style` attribute before unmounting. Plain
 * React conditionals (`{open && <Toast/>}`) can't do that — the node is gone
 * the instant `open` flips false, so there's nothing left to animate out.
 *
 * <Presence> generalizes the trick with ~zero runtime: when `show` goes false
 * it keeps the child mounted, sets `data-state="closed"` (which plays the exit
 * keyframe defined in motion.css), and unmounts only after `animationend`.
 *
 *   <Presence show={toast != null} motion="slide-up">
 *     <ToastBody … />
 *   </Presence>
 *
 * The matching keyframes live in packages/ui/src/theme/motion.css
 * (`.motion-presence[data-state][data-motion]`). To add a motion, add two
 * lines there and a name here — no JS animation library involved. Under
 * `prefers-reduced-motion` the keyframes collapse to ~instant (handled
 * globally in motion.css) and animationend still fires, so unmount is correct.
 */
import * as React from 'react'
import { cn } from '../utils'

/** The named motions with matching `.motion-presence` rules in motion.css. */
export type PresenceMotion = 'fade' | 'scale' | 'slide-up' | 'slide-down' | 'pop'

export interface PresenceProps {
  /** When true the child is shown (enter); when false it animates out, then unmounts. */
  show: boolean
  /** Which enter/exit keyframe pair to play. Defaults to `fade`. */
  motion?: PresenceMotion
  /** Render a plain wrapper `<div>` (default) or merge onto the child via a render prop. */
  children: React.ReactNode
  /** Extra classes for the wrapper element. */
  className?: string
  /** Wrapper element tag. Defaults to `div`. */
  as?: keyof React.JSX.IntrinsicElements
  /** Forwarded to the wrapper (e.g. role, aria-live). */
  wrapperProps?: React.HTMLAttributes<HTMLElement>
}

export function Presence({
  show,
  motion = 'fade',
  children,
  className,
  as = 'div',
  wrapperProps
}: PresenceProps): React.ReactElement | null {
  // `mounted` lags `show` on the way out: it stays true through the exit
  // animation and only drops to false on animationend.
  const [mounted, setMounted] = React.useState(show)

  React.useEffect(() => {
    if (show) setMounted(true)
  }, [show])

  const handleAnimationEnd = React.useCallback(() => {
    if (!show) setMounted(false)
  }, [show])

  if (!mounted) return null

  const Tag = as as React.ElementType
  return (
    <Tag
      {...wrapperProps}
      data-motion={motion}
      data-state={show ? 'open' : 'closed'}
      onAnimationEnd={handleAnimationEnd}
      className={cn('motion-presence', className)}
    >
      {children}
    </Tag>
  )
}
