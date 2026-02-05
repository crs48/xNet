/**
 * DemoBanner - Persistent banner indicating demo mode
 *
 * Shown at the top of the app when connected to a demo hub.
 * Dismissible with localStorage persistence.
 */
import { useState } from 'react'

export interface DemoBannerProps {
  /** How many hours until demo data expires */
  evictionHours: number
  /** Called when banner is dismissed */
  onDismiss?: () => void
}

const STORAGE_KEY = 'xnet:demo-banner-dismissed'

/**
 * DemoBanner component
 *
 * @example
 * ```tsx
 * <DemoBanner evictionHours={24} />
 * ```
 */
export function DemoBanner({ evictionHours, onDismiss }: DemoBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  if (dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-amber-100 dark:bg-amber-900/50 border-b border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 text-sm">
      <div className="flex items-center gap-2">
        <span>Demo mode — data expires after {evictionHours}h of inactivity.</span>
        <a
          href="https://xnet.fyi/download"
          className="ml-2 px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium transition-colors"
        >
          Download desktop app
        </a>
      </div>
      <button
        onClick={handleDismiss}
        className="p-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded transition-colors"
        aria-label="Dismiss banner"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}
