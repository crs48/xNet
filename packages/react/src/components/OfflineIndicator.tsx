/**
 * Offline indicator banner.
 *
 * Shows a non-intrusive banner when the user loses network connectivity.
 * Automatically hides when the connection is restored.
 */
import { useState, useEffect } from 'react'

// ─── Types ──────────────────────────────────────────────────

export type OfflineIndicatorProps = {
  /** Custom message. Default: 'You are offline. Changes will sync when reconnected.' */
  message?: string
  /** Additional CSS class. */
  className?: string
  /** Position. Default: 'bottom'. */
  position?: 'top' | 'bottom'
}

// ─── Hook ───────────────────────────────────────────────────

/** Returns true when the browser is offline. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  )

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)

    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  return offline
}

// ─── Component ──────────────────────────────────────────────

export function OfflineIndicator({
  message = 'You are offline. Changes will sync when reconnected.',
  className,
  position = 'bottom'
}: OfflineIndicatorProps): JSX.Element | null {
  const offline = useIsOffline()

  if (!offline) return null

  const positionStyle: React.CSSProperties = position === 'top' ? { top: 0 } : { bottom: 0 }

  return (
    <div
      role="status"
      aria-live="polite"
      className={className}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        background: '#fbbf24',
        color: '#78350f',
        fontSize: '0.875rem',
        fontWeight: 500,
        ...positionStyle
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
