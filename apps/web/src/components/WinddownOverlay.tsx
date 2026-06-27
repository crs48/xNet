/**
 * "Time well spent" wind-down nudge (Charter §Calm, exploration 0234).
 *
 * Off by default. When enabled, a calm card slides up once per session after the
 * chosen duration, inviting you to step away. No streak, no counter, no "you'll
 * lose your progress" — dismissing is frictionless and the app never guilts you
 * for leaving. The whole point is to help you close the laptop.
 */
import { Presence } from '@xnetjs/ui'
import { Moon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { shouldShowWinddown, useWinddownPreferences, winddownThresholdMs } from '../lib/winddown'

interface WinddownOverlayProps {
  /** How often to re-check elapsed time. Calm by default; overridable for tests. */
  tickMs?: number
}

export function WinddownOverlay({ tickMs = 30_000 }: WinddownOverlayProps): JSX.Element | null {
  const { preferences } = useWinddownPreferences()
  const [elapsedMs, setElapsedMs] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const startRef = useRef<number>(Date.now())

  // Tick the session clock only while the feature is on and not yet dismissed,
  // so a disabled nudge costs nothing.
  useEffect(() => {
    if (!preferences.enabled || dismissed) return
    const tick = (): void => setElapsedMs(Date.now() - startRef.current)
    tick()
    const id = window.setInterval(tick, Math.max(1_000, tickMs))
    return () => window.clearInterval(id)
  }, [preferences.enabled, dismissed, tickMs])

  const show = shouldShowWinddown({
    enabled: preferences.enabled,
    sessionElapsedMs: elapsedMs,
    thresholdMs: winddownThresholdMs(preferences),
    dismissedThisSession: dismissed
  })

  // "Not now" gently restarts the clock instead of nagging immediately.
  const snooze = (): void => {
    startRef.current = Date.now()
    setElapsedMs(0)
  }

  return (
    <Presence
      show={show}
      motion="slide-up"
      className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))]"
    >
      <div
        role="status"
        className="pointer-events-auto rounded-xl border border-border bg-surface-1 p-4 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex rounded-lg bg-surface-2 p-2 text-ink-2">
            <Moon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-1">You&rsquo;ve been here a while</p>
            <p className="mt-1 text-sm text-ink-3">
              Maybe that&rsquo;s enough for today. Your work is saved and will be here whenever you
              come back.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface-2 px-3 text-sm font-medium text-ink-1 transition-colors hover:bg-surface-3"
              >
                Good idea
              </button>
              <button
                type="button"
                onClick={snooze}
                className="inline-flex h-8 items-center rounded-md px-2 text-sm text-ink-3 transition-colors hover:text-ink-2"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="-m-1 flex-shrink-0 rounded p-1 text-ink-3 transition-colors hover:text-ink-1 focus:outline-none"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Presence>
  )
}
