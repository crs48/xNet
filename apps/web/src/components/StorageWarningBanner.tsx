import { Presence } from '@xnetjs/ui'
import { AlertTriangle, CheckCircle2, ChevronDown, Info, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatBytes } from '../lib/format-bytes'

/**
 * Dismissing the storage banner used to reset on every reload, so the
 * non-blocking "durable storage pending" notice (which localhost and Chrome
 * re-raise on every boot) nagged endlessly. We persist a dismissal keyed by
 * the banner's identity (tone + title): closing the current notice keeps it
 * closed, but a materially different banner — e.g. an escalated
 * "Storage may be limited" warning — has a new key and still surfaces.
 */
const DISMISS_STORAGE_KEY = 'xnet:storage-banner:dismissed'

function bannerKey(tone: string, title: string): string {
  return `${tone}:${title}`
}

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return new Set(
      Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    )
  } catch {
    return new Set()
  }
}

function persistDismissed(key: string): void {
  try {
    const next = readDismissed()
    next.add(key)
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    // Private-mode / disabled storage: dismissal is best-effort, session-only.
  }
}

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
  secondaryActionLabel?: string
  secondaryActionPendingLabel?: string
  secondaryActionPending?: boolean
  onSecondaryAction?: () => void
  detailItems?: string[]
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
  onAction,
  secondaryActionLabel,
  secondaryActionPendingLabel,
  secondaryActionPending = false,
  onSecondaryAction,
  detailItems
}: StorageWarningBannerProps): JSX.Element | null {
  const key = bannerKey(tone, title)
  const [dismissed, setDismissed] = useState(() => readDismissed().has(key))
  const [showDetails, setShowDetails] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Re-evaluate persistence when the banner identity changes (an escalated
  // warning replaces a dismissed info notice without a remount).
  useEffect(() => {
    setDismissed(readDismissed().has(key))
    setShowDetails(false)
  }, [key])

  const dismiss = () => {
    persistDismissed(key)
    setDismissed(true)
  }

  // Publish the banner height so the workbench can offset below the
  // fixed overlay instead of rendering underneath it (0166).
  useEffect(() => {
    const root = rootRef.current
    const documentElement = document.documentElement
    if (!root || dismissed) {
      documentElement.style.setProperty('--storage-banner-height', '0px')
      return
    }
    const update = () =>
      documentElement.style.setProperty('--storage-banner-height', `${root.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root)
    return () => {
      observer.disconnect()
      documentElement.style.setProperty('--storage-banner-height', '0px')
    }
  }, [dismissed])
  const toneClasses = getToneClasses(tone)
  const Icon = toneClasses.actionIcon
  const showAction = Boolean(actionLabel && onAction)
  const showSecondaryAction = Boolean(secondaryActionLabel && onSecondaryAction)
  const usageLabel =
    typeof usageBytes === 'number' && typeof quotaBytes === 'number' && quotaBytes > 0
      ? `${formatBytes(usageBytes)} used of ${formatBytes(quotaBytes)} available`
      : null

  return (
    <Presence
      show={!dismissed}
      motion="slide-down"
      className={`pointer-events-none fixed top-0 left-0 right-0 z-50 border-b ${toneClasses.container}`}
    >
      <div ref={rootRef} className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start flex-1 min-w-0">
            <span className={`flex p-2 rounded-lg ${toneClasses.icon}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            {/* Compact on mobile (exploration 0196): the verbose message,
                usage line, and detail list stack to ~1000px on a phone and
                would push the whole shell off-screen via
                --storage-banner-height. Below sm we clamp the message and
                hide the rest; sm+ restores the full desktop banner. */}
            <div className={`ml-3 min-w-0 ${toneClasses.text}`}>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 line-clamp-2 text-sm sm:line-clamp-none">{message}</p>
              {usageLabel && (
                <p className="mt-1 hidden text-xs opacity-80 sm:block">{usageLabel}</p>
              )}
              {/* The recovery steps are useful but verbose — a five-line list
                  turned this into a top-of-viewport block. Keep the banner to
                  ~two lines by default and reveal the steps on demand. */}
              {detailItems && detailItems.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    aria-expanded={showDetails}
                    className={`pointer-events-auto mt-1 hidden items-center gap-1 text-xs font-medium opacity-80 hover:opacity-100 sm:inline-flex ${toneClasses.button}`}
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                    {showDetails ? 'Hide details' : 'What can I do?'}
                  </button>
                  {showDetails && (
                    <ul className="mt-2 hidden list-disc space-y-1 pl-4 text-xs opacity-90 sm:block">
                      {detailItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
          {(showAction || showSecondaryAction) && (
            <div className="pointer-events-auto flex flex-shrink-0 flex-wrap items-center gap-2">
              {showSecondaryAction && (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  disabled={secondaryActionPending}
                  className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:cursor-wait disabled:opacity-70 ${toneClasses.actionButton}`}
                >
                  <ShieldCheck
                    className={`h-4 w-4 ${secondaryActionPending ? 'animate-pulse' : ''}`}
                    aria-hidden="true"
                  />
                  <span>
                    {secondaryActionPending
                      ? (secondaryActionPendingLabel ?? secondaryActionLabel)
                      : secondaryActionLabel}
                  </span>
                </button>
              )}
              {showAction && (
                <button
                  type="button"
                  onClick={onAction}
                  disabled={actionPending}
                  className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:cursor-wait disabled:opacity-70 ${toneClasses.actionButton}`}
                >
                  <ShieldCheck
                    className={`h-4 w-4 ${actionPending ? 'animate-pulse' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{actionPending ? (actionPendingLabel ?? actionLabel) : actionLabel}</span>
                </button>
              )}
            </div>
          )}
          <button
            onClick={dismiss}
            className={`pointer-events-auto flex-shrink-0 inline-flex focus:outline-none ${toneClasses.button}`}
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Presence>
  )
}
