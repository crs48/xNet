import { createFileRoute, Link } from '@tanstack/react-router'
import React, { useEffect, useState } from 'react'

type StorybookAvailability = 'checking' | 'ready' | 'unavailable'

const DEFAULT_STORYBOOK_URL = 'http://127.0.0.1:6006'
const AVAILABILITY_TIMEOUT_MS = 1500

export const Route = createFileRoute('/stories')({
  component: StoriesPage
})

function StoriesPage(): JSX.Element {
  const storybookUrl = import.meta.env.VITE_STORYBOOK_URL || DEFAULT_STORYBOOK_URL
  const [availability, setAvailability] = useState<StorybookAvailability>('checking')

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS)

    void fetch(storybookUrl, {
      mode: 'no-cors',
      signal: controller.signal
    })
      .then(() => {
        setAvailability('ready')
      })
      .catch(() => {
        setAvailability('unavailable')
      })
      .finally(() => {
        window.clearTimeout(timeout)
      })

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [storybookUrl])

  if (!import.meta.env.DEV) {
    return (
      <div className="mx-auto flex h-full max-w-xl items-center justify-center p-8 text-center">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold text-foreground">Stories are disabled</h1>
          <p className="text-sm text-muted-foreground">
            The embedded Storybook surface is only available in development builds.
          </p>
          <div>
            <Link
              to="/"
              className="text-sm text-primary no-underline hover:no-underline hover:underline"
            >
              Return home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 -m-6">
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Stories</h1>
          <p className="text-sm text-muted-foreground">
            Dev-only embedded Storybook running from the repo root.
          </p>
        </div>
        <a
          href={storybookUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary no-underline hover:no-underline hover:underline"
        >
          Open in new tab
        </a>
      </div>
      <div className="min-h-0 flex-1 bg-background px-6 pb-6">
        {availability === 'ready' ? (
          <iframe
            title="Storybook"
            src={storybookUrl}
            className="h-full w-full rounded-xl border border-border bg-white"
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-secondary/20 px-6 text-center">
            <div className="max-w-md space-y-3">
              <h2 className="text-base font-medium text-foreground">
                {availability === 'checking' ? 'Checking Storybook' : 'Storybook is not running'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {availability === 'checking'
                  ? 'Looking for the root Storybook dev server...'
                  : 'Start Storybook with `pnpm dev:stories`, then refresh this route.'}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{storybookUrl}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
