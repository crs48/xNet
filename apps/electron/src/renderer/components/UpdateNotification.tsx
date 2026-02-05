/**
 * Update notification banner for the Electron app.
 *
 * Listens for auto-updater IPC events and shows download/install prompts.
 */
import { useState, useEffect } from 'react'

interface UpdateInfo {
  version: string
  releaseNotes?: string
}

interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

export function UpdateNotification() {
  const [available, setAvailable] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const api = w.electron as
      | {
          on: (channel: string, cb: (...args: unknown[]) => void) => void
          removeAllListeners: (channel: string) => void
          invoke: (channel: string) => Promise<unknown>
        }
      | undefined

    if (!api) return

    api.on('update-available', (_e: unknown, info: unknown) => {
      setAvailable(info as UpdateInfo)
    })

    api.on('update-progress', (_e: unknown, prog: unknown) => {
      setProgress(prog as UpdateProgress)
    })

    api.on('update-ready', () => {
      setReady(true)
      setProgress(null)
    })

    return () => {
      api.removeAllListeners('update-available')
      api.removeAllListeners('update-progress')
      api.removeAllListeners('update-ready')
    }
  }, [])

  if (!available && !progress && !ready) {
    return null
  }

  const invoke = (channel: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const api = w.electron as
      | {
          invoke: (channel: string) => Promise<unknown>
        }
      | undefined
    api?.invoke(channel)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
      {available && !progress && !ready && (
        <div className="flex items-center gap-3">
          <span className="text-sm">Version {available.version} is available</span>
          <button
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
            onClick={() => invoke('download-update')}
          >
            Download
          </button>
          <button
            className="rounded px-3 py-1 text-xs text-neutral-500 hover:text-neutral-700"
            onClick={() => setAvailable(null)}
          >
            Later
          </button>
        </div>
      )}

      {progress && (
        <div className="space-y-2">
          <span className="text-sm">Downloading update...</span>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="text-xs text-neutral-500">{Math.round(progress.percent)}%</span>
        </div>
      )}

      {ready && (
        <div className="flex items-center gap-3">
          <span className="text-sm">Update ready to install</span>
          <button
            className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
            onClick={() => invoke('install-update')}
          >
            Restart Now
          </button>
        </div>
      )}
    </div>
  )
}
