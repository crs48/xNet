import { useState } from 'react'

interface StorageWarningBannerProps {
  tone: 'success' | 'warning' | 'info'
  title: string
  message: string
  usageBytes?: number
  quotaBytes?: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function getToneClasses(tone: StorageWarningBannerProps['tone']): {
  container: string
  icon: string
  text: string
  button: string
} {
  switch (tone) {
    case 'success':
      return {
        container:
          'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60',
        icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
        text: 'text-emerald-900 dark:text-emerald-100',
        button:
          'text-emerald-700 dark:text-emerald-300 hover:text-emerald-600 dark:hover:text-emerald-200'
      }
    case 'info':
      return {
        container: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/60',
        icon: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
        text: 'text-sky-900 dark:text-sky-100',
        button: 'text-sky-700 dark:text-sky-300 hover:text-sky-600 dark:hover:text-sky-200'
      }
    case 'warning':
      return {
        container: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60',
        icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
        text: 'text-amber-900 dark:text-amber-100',
        button: 'text-amber-700 dark:text-amber-300 hover:text-amber-600 dark:hover:text-amber-200'
      }
  }
}

export function StorageWarningBanner({
  tone,
  title,
  message,
  usageBytes,
  quotaBytes
}: StorageWarningBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)
  const toneClasses = getToneClasses(tone)
  const usageLabel =
    typeof usageBytes === 'number' && typeof quotaBytes === 'number' && quotaBytes > 0
      ? `${formatBytes(usageBytes)} used of ${formatBytes(quotaBytes)} available`
      : null

  if (dismissed) return null

  return (
    <div
      className={`pointer-events-none fixed top-0 left-0 right-0 z-50 border-b ${toneClasses.container}`}
    >
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start flex-1 min-w-0">
            <span className={`flex p-2 rounded-lg ${toneClasses.icon}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </span>
            <div className={`ml-3 min-w-0 ${toneClasses.text}`}>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm mt-0.5">{message}</p>
              {usageLabel && <p className="text-xs mt-1 opacity-80">{usageLabel}</p>}
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className={`pointer-events-auto flex-shrink-0 inline-flex focus:outline-none ${toneClasses.button}`}
            aria-label="Dismiss"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
