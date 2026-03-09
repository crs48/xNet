import { Button } from '@xnetjs/ui'
import React, { useCallback, useEffect, useState } from 'react'

type StorybookBridge = NonNullable<typeof window.xnetStorybook>
type StorybookStatus = Awaited<ReturnType<StorybookBridge['status']>>

const STATUS_POLL_INTERVAL_MS = 1500

const DEFAULT_STATUS: StorybookStatus = {
  state: 'stopped'
}

export function StorybookView(): React.ReactElement {
  const storybook = window.xnetStorybook
  const [status, setStatus] = useState<StorybookStatus>(DEFAULT_STATUS)

  const refreshStatus = useCallback(async () => {
    if (!storybook) {
      return DEFAULT_STATUS
    }

    const nextStatus = await storybook.status()
    setStatus(nextStatus)
    return nextStatus
  }, [storybook])

  const ensureStorybook = useCallback(async () => {
    if (!storybook) {
      return DEFAULT_STATUS
    }

    const nextStatus = await storybook.ensure()
    setStatus(nextStatus)
    return nextStatus
  }, [storybook])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    let cancelled = false

    void ensureStorybook().then((nextStatus) => {
      if (!cancelled) {
        setStatus(nextStatus)
      }
    })

    const timer = window.setInterval(() => {
      void refreshStatus()
    }, STATUS_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [ensureStorybook, refreshStatus])

  if (!import.meta.env.DEV) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-8 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">Stories are only available in dev.</p>
          <p className="text-xs text-muted-foreground">
            The embedded Storybook surface is intentionally hidden from production builds.
          </p>
        </div>
      </div>
    )
  }

  if (!storybook) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-8 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">Storybook bridge is unavailable.</p>
          <p className="text-xs text-muted-foreground">
            Restart the Electron dev shell so the preload can expose the dev-only Storybook API.
          </p>
        </div>
      </div>
    )
  }

  if (status.state !== 'ready' || !status.url) {
    const message =
      status.state === 'error'
        ? status.error || 'Storybook failed to start.'
        : 'Starting the root Storybook runtime...'

    return (
      <div className="flex h-full items-center justify-center bg-background px-8 text-center">
        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              {status.state === 'error' ? 'Storybook needs attention' : 'Preparing stories'}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">{message}</p>
            {status.lastOutput ? (
              <p className="rounded-lg border border-border/70 bg-secondary/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {status.lastOutput}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void ensureStorybook()
              }}
            >
              Retry
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void refreshStatus()
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <iframe
      title="Storybook"
      src={status.url}
      className="h-full w-full border-0 bg-white"
      allow="clipboard-read; clipboard-write"
    />
  )
}
