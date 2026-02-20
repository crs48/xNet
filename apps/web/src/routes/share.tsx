/**
 * Share bridge route.
 *
 * Attempts to launch Electron via xnet:// deep link and falls back to the web app.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

const DEEP_LINK_TIMEOUT_MS = 1000

export const Route = createFileRoute('/share')({
  component: ShareBridgePage
})

function ShareBridgePage(): JSX.Element {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'launching' | 'fallback' | 'error'>('launching')
  const [error, setError] = useState<string | null>(null)

  const payload = useMemo(() => {
    const parsed = new URL(window.location.href)
    return parsed.searchParams.get('payload') ?? ''
  }, [])

  useEffect(() => {
    if (!payload) {
      setStatus('error')
      setError('Missing payload in share link')
      return
    }

    if (payload.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(payload)) {
      setStatus('error')
      setError('Share payload is invalid')
      return
    }

    const deepLink = `xnet://share?payload=${encodeURIComponent(payload)}`
    window.location.href = deepLink

    const timeout = window.setTimeout(() => {
      setStatus('fallback')
      navigate({ to: '/', replace: true })
    }, DEEP_LINK_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [navigate, payload])

  const copyRawPayload = async () => {
    if (!payload) return
    await navigator.clipboard.writeText(payload)
  }

  return (
    <div className="max-w-xl mx-auto py-16">
      <h1 className="text-2xl font-semibold mb-3">Opening your shared document...</h1>
      <p className="text-sm text-muted-foreground mb-6">
        We will open the desktop app if available, then continue in web automatically.
      </p>

      {status === 'fallback' && (
        <p className="text-sm text-muted-foreground mb-4">
          Electron did not open, so we continued in web.
        </p>
      )}

      {status === 'error' && error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <button
        onClick={copyRawPayload}
        className="px-3 py-2 text-sm rounded-md border border-border hover:bg-accent"
      >
        Copy raw share token
      </button>
    </div>
  )
}
