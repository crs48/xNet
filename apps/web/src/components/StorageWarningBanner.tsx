import { AlertTriangle, CheckCircle2, Info, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'

interface StorageWarningBannerProps {
  tone: 'success' | 'warning' | 'info'
  title: string
  message: string
  usageBytes?: number
  quotaBytes?: number
  actionLabel?: string
  actionPendingLabel?: string
  actionPending?: boolean
  onAction?: () => void
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
  actionButton: string
  actionIcon: typeof AlertTriangle
} {
  switch (tone) {
    case 'success':
      return {
        container:
          'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60',
        icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
        text: 'text-emerald-900 dark:text-emerald-100',
        button:
          'text-emerald-700 dark:text-emerald-300 hover:text-emerald-600 dark:hover:text-emerald-200',
        actionButton:
          'border-emerald-300/80 bg-emerald-100/80 text-emerald-900 hover:bg-emerald-200 dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-100 dark:hover:bg-emerald-800',
        actionIcon: CheckCircle2
      }
    case 'info':
      return {
        container: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/60',
        icon: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
        text: 'text-sky-900 dark:text-sky-100',
        button: 'text-sky-700 dark:text-sky-300 hover:text-sky-600 dark:hover:text-sky-200',
        actionButton:
          'border-sky-300/80 bg-sky-100/80 text-sky-900 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-900/60 dark:text-sky-100 dark:hover:bg-sky-800',
        actionIcon: Info
      }
    case 'warning':
      return {
        container: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60',
        icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
        text: 'text-amber-900 dark:text-amber-100',
        button: 'text-amber-700 dark:text-amber-300 hover:text-amber-600 dark:hover:text-amber-200',
        actionButton:
          'border-amber-300/80 bg-amber-100/80 text-amber-950 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-800',
        actionIcon: AlertTriangle
      }
  }
}

export function StorageWarningBanner({
  tone,
  title,
  message,
  usageBytes,
  quotaBytes,
  actionLabel,
  actionPendingLabel,
  actionPending = false,
  onAction
}: StorageWarningBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)
  const toneClasses = getToneClasses(tone)
  const Icon = toneClasses.actionIcon
  const showAction = Boolean(actionLabel && onAction)
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
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className={`ml-3 min-w-0 ${toneClasses.text}`}>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm mt-0.5">{message}</p>
              {usageLabel && <p className="text-xs mt-1 opacity-80">{usageLabel}</p>}
            </div>
          </div>
          {showAction && (
            <button
              type="button"
              onClick={onAction}
              disabled={actionPending}
              className={`pointer-events-auto inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:cursor-wait disabled:opacity-70 ${toneClasses.actionButton}`}
            >
              <ShieldCheck
                className={`h-4 w-4 ${actionPending ? 'animate-pulse' : ''}`}
                aria-hidden="true"
              />
              <span>{actionPending ? (actionPendingLabel ?? actionLabel) : actionLabel}</span>
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className={`pointer-events-auto flex-shrink-0 inline-flex focus:outline-none ${toneClasses.button}`}
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
