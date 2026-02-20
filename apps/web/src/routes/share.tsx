/**
 * Share bridge route.
 *
 * Attempts to launch Electron via xnet:// deep link and falls back to the web app.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

const DEEP_LINK_TIMEOUT_MS = 1000
const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

type ShareDocType = 'page' | 'database' | 'canvas'

type SharePayloadV2 = {
  v: 2
  resource: string
  docType: ShareDocType
}

export const Route = createFileRoute('/share')({
  component: ShareBridgePage
})

function ShareBridgePage(): JSX.Element {
  const [status, setStatus] = useState<'launching' | 'fallback' | 'error'>('launching')
  const [error, setError] = useState<string | null>(null)

  const payload = useMemo(() => {
    const parsed = new URL(window.location.href)
    return parsed.searchParams.get('payload') ?? ''
  }, [])

  const parsedPayload = useMemo(() => {
    try {
      const json = fromBase64Url(payload)
      const decoded = JSON.parse(json) as SharePayloadV2
      if (
        decoded?.v !== 2 ||
        typeof decoded.resource !== 'string' ||
        (decoded.docType !== 'page' &&
          decoded.docType !== 'database' &&
          decoded.docType !== 'canvas')
      ) {
        return null
      }
      return decoded
    } catch {
      return null
    }
  }, [payload])

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

      if (!parsedPayload) {
        setStatus('error')
        setError('Share payload is invalid')
        return
      }

      window.location.replace(getWebFallbackPath(parsedPayload, payload))
    }, DEEP_LINK_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [payload, parsedPayload])

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

function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function getWebFallbackPath(parsedPayload: SharePayloadV2, encodedPayload: string): string {
  const query = `payload=${encodeURIComponent(encodedPayload)}`
  const prefix = BASE_PATH === '' ? '' : BASE_PATH

  if (parsedPayload.docType === 'page') {
    return `${prefix}/doc/${encodeURIComponent(parsedPayload.resource)}?${query}`
  }

  if (parsedPayload.docType === 'database') {
    return `${prefix}/db/${encodeURIComponent(parsedPayload.resource)}?${query}`
  }

  return `${prefix}/canvas/${encodeURIComponent(parsedPayload.resource)}?${query}`
}
